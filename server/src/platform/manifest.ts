// server/src/platform/manifest.ts — PUT /apps/:productKey/manifest, GET /apps (plan 1.3; DRD §2.2, §2.4)
// Copied from roleCatalog.ts: same scope, allow-list, optimistic version lock, ROLE_IN_USE protection, transaction and fan-out.
// Differences: it upserts the App and writes the descriptive fields. Only suite hosting is accepted on PUT (standalone portals are
// registered in the Command Center); GET /apps reports the real, secret-free `hosting` block of a standalone product (W2-LAUNCH).
import { Router } from 'express';
import { z } from 'zod';
import { App } from '../models/App.model';
import { AppAssignment } from '../models/AppAssignment.model';
import { ProductRole } from '../models/ProductRole.model';
import { runInTransaction, fanOutAppAccessChanged, correlationIdFor } from '../lib/platformEvents';
import { productLaunchUrl } from '../lib/productCatalog';
import { standaloneView } from '../lib/standalonePortals';
import { invalidateProductRegistry, RESERVED_PRODUCT_KEY } from '../lib/productRegistry';
import { requireServiceToken, serviceMayAccessProduct } from './requireServiceToken';

export const manifestRouter = Router();

const KEY = /^[a-z][a-z0-9_]{1,30}$/;

const bodySchema = z.object({
  manifest_version: z.literal(1),
  key: z.string().regex(KEY),
  name: z.string().min(1).max(100),
  description: z.string().max(160),
  icon: z.string().min(1).max(64),
  category: z.enum(['core', 'work', 'it', 'talent']),
  status: z.enum(['active', 'beta', 'hidden', 'retired']),
  version: z.number().int().min(1),
  hosting: z.object({ mode: z.literal('suite'), launch_path: z.string().startsWith('/').max(200) }),
  roles: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    rank: z.number().int().min(1),
    is_default: z.boolean().optional(),
    assignable: z.boolean().optional(),
  })).min(1).max(100),
  default_assignments: z.array(z.object({ target: z.literal('all_members'), role: z.string() })).max(20).optional(),
  capabilities: z.object({ seats: z.boolean(), offboarding: z.boolean() }).optional(),
}).superRefine((b, ctx) => {
  if (b.key === RESERVED_PRODUCT_KEY) ctx.addIssue({ code: 'custom', message: "key 'admin' is reserved" });
  const keys = b.roles.map(r => r.key);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'duplicate role key' });
  if (b.roles.filter(r => r.is_default).length !== 1) ctx.addIssue({ code: 'custom', message: 'exactly one role must have is_default=true' });
  for (const a of b.default_assignments ?? []) {
    if (!keys.includes(a.role)) ctx.addIssue({ code: 'custom', message: `default_assignments role '${a.role}' is not a role of this product` });
  }
});

class RoleInUse extends Error { constructor(public keys: string[]) { super('ROLE_IN_USE'); } }

const view = (app: any, rows: any[]) => ({
  product_key: app.product_key,
  manifest_version: app.manifest_version ?? 1,
  key: app.product_key,
  name: app.name,
  description: app.description ?? '',
  icon: app.icon ?? '',
  category: app.product_category ?? '',
  status: app.product_status ?? 'active',
  version: app.role_catalog_version ?? 1,
  role_catalog_version: app.role_catalog_version ?? 1,
  hosting: app.hosting_mode === 'standalone' ? standaloneView(app, []).hosting : { mode: 'suite', launch_path: app.launch_path ?? '' },
  roles: [...rows].sort((a, b) => b.rank - a.rank).map(r => ({
    key: r.key, name: r.name, description: r.description, rank: r.rank, is_default: !!r.is_default, assignable: r.assignable !== false,
  })),
  default_assignments: app.default_assignments ?? [],
});

const systemProduct = (key: string) => ({ product_key: key, app_type: 'karbexa_product' as const, is_system_app: true, company_id: { $exists: false } });

manifestRouter.get('/apps', requireServiceToken('platform.role_catalog.write'), async (_req, res, next) => {
  try {
    const apps: any[] = await App.find({ app_type: 'karbexa_product', product_key: { $exists: true, $ne: RESERVED_PRODUCT_KEY }, company_id: { $exists: false } }).sort({ product_key: 1 }).lean();
    const roles: any[] = await ProductRole.find({ product_key: { $in: apps.map(a => a.product_key) } }).lean();
    res.json(apps.map(a => view(a, roles.filter(r => r.product_key === a.product_key))));
  } catch (err) { next(err); }
});

manifestRouter.put('/apps/:productKey/manifest', requireServiceToken('platform.role_catalog.write'), async (req, res, next) => {
  try {
    const productKey = String(req.params.productKey);
    if (productKey === RESERVED_PRODUCT_KEY || !KEY.test(productKey)) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    if (!serviceMayAccessProduct(req, productKey)) {
      return res.status(403).json({ error: 'Product not allowed for this client', code: 'PRODUCT_NOT_ALLOWED' });
    }
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join('; '), code: 'VALIDATION_ERROR' });
    const m = parsed.data;
    if (m.key !== productKey) return res.status(400).json({ error: 'key does not match the path', code: 'VALIDATION_ERROR' });
    const version = m.version;

    const existing: any = await App.findOne(systemProduct(productKey)).lean();
    const current = existing?.role_catalog_version ?? 0;
    if (existing && version < current) { // stale caller: keep the stored (newer) manifest and return it
      return res.status(200).json(view(existing, await ProductRole.find({ product_key: productKey }).lean()));
    }

    const newKeys = m.roles.map(r => r.key);
    const newDefault = m.roles.find(r => r.is_default)!.key;
    const launchUrl = process.env[`${productKey.toUpperCase()}_LAUNCH_URL`] || productLaunchUrl({ path: m.hosting.launch_path });
    const result = await runInTransaction(async (session) => {
      const opts = session ? { session } : {};
      let appId = existing?._id;
      if (!existing) { // first publish registers the product; version 0 lets the lock below take it to `version`
        const [created] = await App.create([{
          name: m.name, slug: `karbexa-${productKey}`, category: 'Karbexa', provider: 'Karbexa', is_system_app: true, app_type: 'karbexa_product',
          product_key: productKey, role_catalog_version: 0,
        } as never], opts);
        appId = created._id;
      }
      // Optimistic version lock: a concurrent/newer manifest makes this match nothing.
      const lock = await App.updateOne({ _id: appId, role_catalog_version: { $not: { $gt: version } } }, { $set: { role_catalog_version: version } }, opts);
      if (lock.matchedCount === 0) return { stale: true as const };
      const before = await ProductRole.find({ product_key: productKey }, null, opts).lean();
      const oldDefault: string | undefined = existing?.default_role_key;
      const removed = before.filter(r => !newKeys.includes(r.key)).map(r => r.key);
      if (removed.length) {
        const used = new Set<string>(await AppAssignment.distinct('product_role_key', { app_id: appId, is_active: true, product_role_key: { $in: removed } }, opts as any) as string[]);
        // Assignments without an explicit role resolve through the default role: it cannot be removed while they exist.
        if (oldDefault && removed.includes(oldDefault)
          && await AppAssignment.exists({ app_id: appId, is_active: true, $or: [{ product_role_key: { $exists: false } }, { product_role_key: null }, { product_role_key: '' }] }).session(session ?? null)) {
          used.add(oldDefault);
        }
        if (used.size) throw new RoleInUse([...used]);
      }
      const rankChanged = before.some(b => { const n = m.roles.find(r => r.key === b.key); return n && (n.rank !== b.rank || n.name !== b.name); });
      for (const r of m.roles) {
        await ProductRole.updateOne(
          { product_key: productKey, key: r.key },
          { $set: { app_id: appId, name: r.name, description: r.description, rank: r.rank, is_default: !!r.is_default, assignable: r.assignable !== false, catalog_version: version } },
          { upsert: true, ...opts },
        );
      }
      if (removed.length) await ProductRole.deleteMany({ product_key: productKey, key: { $in: removed } }, opts);
      await App.updateOne({ _id: appId }, {
        $set: {
          name: m.name, description: m.description, icon: m.icon, product_category: m.category, product_status: m.status,
          manifest_version: m.manifest_version, launch_path: m.hosting.launch_path, launch_url: launchUrl,
          default_role_key: newDefault, default_assignments: m.default_assignments ?? [], is_active: m.status !== 'retired',
        },
      }, opts);
      return { stale: false as const, appId, accessAffected: !!existing && (oldDefault !== newDefault || rankChanged) };
    });
    invalidateProductRegistry();
    const stored: any = await App.findOne(systemProduct(productKey)).lean();
    const rows = await ProductRole.find({ product_key: productKey }).lean();
    res.status(200).json(view(stored, rows));
    if (!result.stale && result.accessAffected) {
      // Effective roles may have changed for assignees: bump + notify, per org, after commit (errors logged inside).
      void (async () => {
        const ctx = { actor: { type: 'system' as const }, correlation_id: correlationIdFor(req), bump: true };
        for (const companyId of await AppAssignment.distinct('company_id', { app_id: result.appId, is_active: true })) {
          await fanOutAppAccessChanged(companyId, ctx);
        }
      })().catch(e => console.error('[manifest] fan-out failed', e));
    }
  } catch (err) {
    if (err instanceof RoleInUse) return res.status(409).json({ error: 'Role in use', code: 'ROLE_IN_USE', roles: err.keys });
    if ((err as { code?: number })?.code === 11000) return res.status(409).json({ error: 'Product is being registered concurrently', code: 'CONFLICT' });
    next(err);
  }
});
