// server/src/platform/roleCatalog.ts — PUT /apps/:productKey/role-catalog (05 §2)
import { Router } from 'express';
import { z } from 'zod';
import { App } from '../models/App.model';
import { AppAssignment } from '../models/AppAssignment.model';
import { ProductRole, ProductKey } from '../models/ProductRole.model';
import { getProduct, RESERVED_PRODUCT_KEY } from '../lib/productRegistry';
import { runInTransaction, fanOutAppAccessChanged, correlationIdFor } from '../lib/platformEvents';
import { requireServiceToken, serviceMayAccessProduct } from './requireServiceToken';

export const roleCatalogRouter = Router();

const bodySchema = z.object({
  version: z.number().int().min(1),
  roles: z.array(z.object({
    key: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    rank: z.number().int(),
    is_default: z.boolean().optional(),
    assignable: z.boolean().optional(),
  })).min(1).max(100),
}).superRefine((b, ctx) => {
  if (new Set(b.roles.map(r => r.key)).size !== b.roles.length) ctx.addIssue({ code: 'custom', message: 'duplicate role key' });
  if (b.roles.filter(r => r.is_default).length !== 1) ctx.addIssue({ code: 'custom', message: 'exactly one role must have is_default=true' });
});

class RoleInUse extends Error { constructor(public keys: string[]) { super('ROLE_IN_USE'); } }

const view = (version: number, rows: any[]) => ({
  version,
  roles: [...rows].sort((a, b) => b.rank - a.rank).map(r => ({
    key: r.key, name: r.name, description: r.description, rank: r.rank, is_default: !!r.is_default, assignable: r.assignable !== false,
  })),
});

roleCatalogRouter.put('/apps/:productKey/role-catalog', requireServiceToken('platform.role_catalog.write'), async (req, res, next) => {
  try {
    const productKey = req.params.productKey as ProductKey; // validated against the registry right below
    if (productKey === RESERVED_PRODUCT_KEY || !(await getProduct(productKey))) {
      return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    }
    if (!serviceMayAccessProduct(req, productKey)) {
      return res.status(403).json({ error: 'Product not allowed for this client', code: 'PRODUCT_NOT_ALLOWED' });
    }
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join('; '), code: 'VALIDATION_ERROR' });
    const { version, roles } = parsed.data;

    const app: any = await App.findOne({ product_key: productKey, is_system_app: true, company_id: { $exists: false } }).lean();
    if (!app) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    const current = app.role_catalog_version ?? 1;
    if (version < current) { // stale caller: keep the stored (newer) catalog and return it
      return res.status(200).json(view(current, await ProductRole.find({ product_key: productKey }).lean()));
    }

    const newKeys = roles.map(r => r.key);
    const newDefault = roles.find(r => r.is_default)!.key;
    const result = await runInTransaction(async (session) => {
      const opts = session ? { session } : {};
      // Optimistic version lock as the first write: a concurrent/newer catalog makes this match nothing.
      const lock = await App.updateOne({ _id: app._id, role_catalog_version: { $not: { $gt: version } } }, { $set: { role_catalog_version: version } }, opts);
      if (lock.matchedCount === 0) return { stale: true as const };
      const before = await ProductRole.find({ product_key: productKey }, null, opts).lean();
      const oldApp: any = await App.findById(app._id, 'default_role_key', opts).lean();
      const removed = before.filter(r => !newKeys.includes(r.key)).map(r => r.key);
      const oldDefault: string | undefined = oldApp?.default_role_key;
      if (removed.length) {
        const used = new Set<string>(await AppAssignment.distinct('product_role_key', { app_id: app._id, is_active: true, product_role_key: { $in: removed } }, opts as any) as string[]);
        // Assignments without an explicit role resolve through the default role: it cannot be removed while they exist.
        if (oldDefault && removed.includes(oldDefault)
          && await AppAssignment.exists({ app_id: app._id, is_active: true, $or: [{ product_role_key: { $exists: false } }, { product_role_key: null }, { product_role_key: '' }] }).session(session ?? null)) {
          used.add(oldDefault);
        }
        if (used.size) throw new RoleInUse([...used]);
      }
      const rankChanged = before.some(b => { const n = roles.find(r => r.key === b.key); return n && (n.rank !== b.rank || n.name !== b.name); });
      for (const r of roles) {
        await ProductRole.updateOne(
          { product_key: productKey, key: r.key },
          { $set: { app_id: app._id, name: r.name, description: r.description, rank: r.rank, is_default: !!r.is_default, assignable: r.assignable !== false, catalog_version: version } },
          { upsert: true, ...opts },
        );
      }
      if (removed.length) await ProductRole.deleteMany({ product_key: productKey, key: { $in: removed } }, opts);
      await App.updateOne({ _id: app._id }, { $set: { default_role_key: newDefault } }, opts);
      return { stale: false as const, rows: await ProductRole.find({ product_key: productKey }, null, opts).lean(), accessAffected: oldDefault !== newDefault || rankChanged };
    });
    if (result.stale) {
      const stored: any = await App.findById(app._id, 'role_catalog_version').lean();
      return res.status(200).json(view(stored?.role_catalog_version ?? current, await ProductRole.find({ product_key: productKey }).lean()));
    }
    res.status(200).json(view(version, result.rows));
    if (result.accessAffected) {
      // Effective roles may have changed for assignees: bump + notify, per org, after commit (errors logged inside).
      void (async () => {
        const ctx = { actor: { type: 'system' as const }, correlation_id: correlationIdFor(req), bump: true };
        for (const companyId of await AppAssignment.distinct('company_id', { app_id: app._id, is_active: true })) {
          await fanOutAppAccessChanged(companyId, ctx);
        }
      })().catch(e => console.error('[roleCatalog] fan-out failed', e));
    }
  } catch (err) {
    if (err instanceof RoleInUse) return res.status(409).json({ error: 'Role in use', code: 'ROLE_IN_USE', roles: err.keys });
    next(err);
  }
});
