// server/src/operator/standalone.ts — standalone portal registration (DRD §8.2, PRD SP-1, SP-7).
//   GET  /products/standalone                          products.read    every standalone registration (no secrets)
//   GET  /products/:key/standalone                     products.read    one registration (no secrets)
//   PUT  /products/:key                                products.write   register or update (manifest, hosting.mode 'standalone')
//   POST /products/:key/rotate-secret                  products.write   new client secret; the old one stays valid 24 h
//   PUT  /products/:key/tenants/:orgId/launch-url      entitlements.write  per-tenant launch URL (per_tenant_launch_url only)
// The PUT copies platform/manifest.ts (validation, optimistic version lock, ROLE_IN_USE, one transaction, post-commit
// fan-out) and adds: refusal of a suite key, the OIDC client fields, the generated secret (returned once, stored
// encrypted) and the operator audit entry.
import { Router, Request, Response, NextFunction } from 'express';
import { Types, ClientSession } from 'mongoose';
import { z } from 'zod';
import { App } from '../models/App.model';
import { AppAssignment } from '../models/AppAssignment.model';
import { ProductRole } from '../models/ProductRole.model';
import { Company } from '../models/Company.model';
import { OrganizationEntitlement } from '../models/OrganizationEntitlement.model';
import { runInTransaction, fanOutAppAccessChanged } from '../lib/platformEvents';
import { invalidateProductRegistry, RESERVED_PRODUCT_KEY } from '../lib/productRegistry';
import { encrypt } from '../lib/cryptoService';
import {
  PRODUCT_KEY_RE, PREVIOUS_SECRET_GRACE_MS, standaloneManifestSchema, issuesText, storedClient, usesClientSecret, generateClientSecret,
  standaloneView, systemProduct, clientIdFor, invalidateStandalonePortals, portalUrlProblem,
} from '../lib/standalonePortals';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { requirePermission, permissionsFor, PERMISSION_MARK } from './permissions';
import type { AuditInput } from './audit';

interface Helpers {
  ok: (res: Response, data: unknown, status?: number, meta?: unknown) => unknown;
  oid: (id: string, what?: string) => string;
  audit: (req: Request, p: AuditInput, session?: ClientSession) => Promise<void>;
  actorOf: (req: Request) => { type: 'operator'; id: string };
  corrOf: (req: Request) => string;
}

export const PRODUCTS_WRITE = 'products.write';

/**
 * DRD §4.5/§8.2: registration needs `products.write` (platform_admin only). operator/permissions.ts does not grant it
 * yet (it was left out until Phase 6), so until it does a platform_admin is accepted directly. Marked for the
 * route-coverage test like requirePermission.
 */
export function requireProductsWrite(req: Request, res: Response, next: NextFunction) {
  const roles = req.operator?.roles ?? [];
  if (!req.operator || !(permissionsFor(roles).includes(PRODUCTS_WRITE) || roles.includes('platform_admin'))) {
    return res.status(403).json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
  }
  next();
}
(requireProductsWrite as any)[PERMISSION_MARK] = PRODUCTS_WRITE;

class RoleInUse extends Error { constructor(public keys: string[]) { super('ROLE_IN_USE'); } }

const SECRET_FIELDS = '+hosting.client.secret_enc +hosting.client.previous_secret_enc';
const noStore = (res: Response) => res.setHeader('Cache-Control', 'no-store');

const keyParam = (req: Request): string => {
  const key = String(req.params.key);
  if (key === RESERVED_PRODUCT_KEY || !PRODUCT_KEY_RE.test(key)) throw new AppError('Product not found', 404, 'NOT_FOUND');
  return key;
};

/** Audit summary of a registration (no secrets; `redact` in ./audit is the second line of defence). */
const auditSummary = (v: { name?: string; status?: string; version?: number; launch_url?: string; redirect_uris?: string[]; roles?: string[] }) => v;

const launchUrlBody = z.object({ launch_url: z.string().trim().max(500).nullable() });

export function standaloneRoutes(h: Helpers): Router {
  const router = Router();

  router.get('/products/standalone', requirePermission('products.read'), asyncHandler(async (_req: Request, res: Response) => {
    const apps: any[] = await App.find({ app_type: 'karbexa_product', company_id: { $exists: false }, hosting_mode: 'standalone' }).sort({ product_key: 1 }).lean();
    const roles: any[] = await ProductRole.find({ product_key: { $in: apps.map((a) => a.product_key) } }).lean();
    h.ok(res, apps.map((a) => standaloneView(a, roles.filter((r) => r.product_key === a.product_key))));
  }));

  router.get('/products/:key/standalone', requirePermission('products.read'), asyncHandler(async (req: Request, res: Response) => {
    const key = keyParam(req);
    const app: any = await App.findOne({ ...systemProduct(key), hosting_mode: 'standalone' }).lean();
    if (!app) throw new AppError('Standalone portal not found', 404, 'NOT_FOUND');
    h.ok(res, standaloneView(app, await ProductRole.find({ product_key: key }).lean()));
  }));

  // Register or update. 201 + client_secret (once) on first registration of a confidential client; 200 otherwise.
  router.put('/products/:key', requireProductsWrite, asyncHandler(async (req: Request, res: Response) => {
    const key = keyParam(req);
    const parsed = standaloneManifestSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(issuesText(parsed.error), 400, 'VALIDATION_ERROR');
    const m = parsed.data;
    if (m.key !== key) throw new AppError('key does not match the path', 400, 'VALIDATION_ERROR');

    const existing: any = await App.findOne(systemProduct(key)).lean();
    if (existing && existing.hosting_mode !== 'standalone') {
      throw new AppError(`'${key}' is a suite product; it cannot be registered as a standalone portal`, 409, 'HOSTING_MODE_CONFLICT');
    }
    const current = existing?.role_catalog_version ?? 0;
    if (existing && m.version < current) throw new AppError(`version ${m.version} is older than the stored version ${current}`, 409, 'MANIFEST_STALE');

    const client = storedClient(m.hosting.client);
    const needsSecret = usesClientSecret(client);
    const newSecret = needsSecret && !existing?.hosting?.client?.secret_set_at ? generateClientSecret() : undefined;
    const newKeys = m.roles.map((r) => r.key);
    const newDefault = m.roles.find((r) => r.is_default)!.key;
    const now = new Date();

    let result: { appId: Types.ObjectId; accessAffected: boolean };
    try {
      result = await runInTransaction(async (session) => {
        const opts = session ? { session } : {};
        let appId = existing?._id as Types.ObjectId | undefined;
        if (!existing) {
          const [created] = await App.create([{
            name: m.name, slug: `karbexa-${key}`, category: 'Karbexa', is_system_app: true, app_type: 'karbexa_product',
            product_key: key, role_catalog_version: 0, hosting_mode: 'standalone', registered_at: now,
          } as never], opts);
          appId = created._id as Types.ObjectId;
        }
        const lock = await App.updateOne({ _id: appId, role_catalog_version: { $not: { $gt: m.version } } }, { $set: { role_catalog_version: m.version } }, opts);
        if (lock.matchedCount === 0) throw new AppError('A newer version was saved concurrently', 409, 'MANIFEST_STALE');

        const before = await ProductRole.find({ product_key: key }, null, opts).lean();
        const oldDefault: string | undefined = existing?.default_role_key;
        const removed = before.filter((r) => !newKeys.includes(r.key)).map((r) => r.key);
        if (removed.length) {
          const used = new Set<string>(await AppAssignment.distinct('product_role_key', { app_id: appId, is_active: true, product_role_key: { $in: removed } }, opts as any) as string[]);
          if (oldDefault && removed.includes(oldDefault)
            && await AppAssignment.exists({ app_id: appId, is_active: true, $or: [{ product_role_key: { $exists: false } }, { product_role_key: null }, { product_role_key: '' }] }).session(session ?? null)) {
            used.add(oldDefault);
          }
          if (used.size) throw new RoleInUse([...used]);
        }
        const rankChanged = before.some((b) => { const n = m.roles.find((r) => r.key === b.key); return n && (n.rank !== b.rank || n.name !== b.name); });
        for (const r of m.roles) {
          await ProductRole.updateOne(
            { product_key: key, key: r.key },
            { $set: { app_id: appId, name: r.name, description: r.description, rank: r.rank, is_default: !!r.is_default, assignable: r.assignable !== false, catalog_version: m.version } },
            { upsert: true, ...opts },
          );
        }
        if (removed.length) await ProductRole.deleteMany({ product_key: key, key: { $in: removed } }, opts);

        // Dotted paths: the stored secrets (not selected above) are never overwritten by accident.
        const set: Record<string, unknown> = {
          name: m.name, description: m.description, icon: m.icon, product_category: m.category, product_status: m.status,
          manifest_version: m.manifest_version, launch_url: m.hosting.launch_url, default_role_key: newDefault,
          default_assignments: m.default_assignments ?? [], is_active: m.status !== 'retired', hosting_mode: 'standalone',
          'hosting.launch_url': m.hosting.launch_url, 'hosting.per_tenant_launch_url': m.hosting.per_tenant_launch_url,
          'hosting.client.type': client.type, 'hosting.client.redirect_uris': client.redirect_uris,
          'hosting.client.post_logout_redirect_uris': client.post_logout_redirect_uris,
        };
        const unset: Record<string, 1> = { launch_path: 1 };
        const optional: Array<[string, string | undefined]> = [
          ['hosting.client.backchannel_logout_uri', client.backchannel_logout_uri], ['hosting.client.token_endpoint_auth', client.token_endpoint_auth],
          ['hosting.client.jwks_uri', client.jwks_uri], ['hosting.health_url', m.hosting.health_url],
        ];
        for (const [path, value] of optional) if (value) set[path] = value; else unset[path] = 1;
        if (newSecret) {
          set['hosting.client.secret_enc'] = encrypt(newSecret);
          set['hosting.client.secret_set_at'] = now;
        }
        if (!needsSecret) {
          for (const p of ['secret_enc', 'secret_set_at', 'previous_secret_enc', 'previous_secret_expires_at']) unset[`hosting.client.${p}`] = 1;
        }
        await App.updateOne({ _id: appId }, { $set: set, $unset: unset }, opts);

        await h.audit(req, {
          action: existing ? 'product.updated' : 'product.registered', target_type: 'Product', target_id: key,
          before: existing ? auditSummary({
            name: existing.name, status: existing.product_status, version: current, launch_url: existing.launch_url,
            redirect_uris: existing.hosting?.client?.redirect_uris, roles: before.map((r) => r.key),
          }) : undefined,
          after: auditSummary({ name: m.name, status: m.status, version: m.version, launch_url: m.hosting.launch_url, redirect_uris: client.redirect_uris, roles: newKeys }),
          details: { hosting_mode: 'standalone', client_type: client.type, client_secret_issued: !!newSecret },
        }, session);
        return { appId: appId!, accessAffected: !!existing && (oldDefault !== newDefault || rankChanged) };
      });
    } catch (err) {
      if (err instanceof RoleInUse) throw new AppError('Role in use', 409, 'ROLE_IN_USE', { roles: err.keys });
      if ((err as { code?: number })?.code === 11000) throw new AppError('Product is being registered concurrently', 409, 'CONFLICT');
      throw err;
    }
    invalidateProductRegistry();
    invalidateStandalonePortals();

    const stored: any = await App.findOne(systemProduct(key)).lean();
    const view = standaloneView(stored, await ProductRole.find({ product_key: key }).lean());
    if (newSecret) noStore(res);
    h.ok(res, newSecret ? { ...view, client_secret: newSecret } : view, existing ? 200 : 201);

    if (result.accessAffected) {
      // Effective roles may have changed for assignees: bump + notify, per org, after commit (errors logged inside).
      void (async () => {
        for (const companyId of await AppAssignment.distinct('company_id', { app_id: result.appId, is_active: true })) {
          await fanOutAppAccessChanged(companyId, { actor: h.actorOf(req), correlation_id: h.corrOf(req), bump: true });
        }
      })().catch((e) => console.error('[standalone] fan-out failed', e));
    }
  }));

  // New secret; the previous one is accepted for 24 hours so the portal can be redeployed without downtime.
  router.post('/products/:key/rotate-secret', requireProductsWrite, asyncHandler(async (req: Request, res: Response) => {
    const key = keyParam(req);
    const app: any = await App.findOne({ ...systemProduct(key), hosting_mode: 'standalone' }).select(SECRET_FIELDS).lean();
    if (!app) throw new AppError('Standalone portal not found', 404, 'NOT_FOUND');
    if (!usesClientSecret(app.hosting?.client)) {
      throw new AppError('This portal does not authenticate with a client secret', 409, 'NO_CLIENT_SECRET');
    }
    const secret = generateClientSecret();
    const now = new Date();
    const previousUntil = new Date(now.getTime() + PREVIOUS_SECRET_GRACE_MS);
    const set: Record<string, unknown> = { 'hosting.client.secret_enc': encrypt(secret), 'hosting.client.secret_set_at': now };
    const unset: Record<string, 1> = {};
    if (app.hosting.client.secret_enc) {
      set['hosting.client.previous_secret_enc'] = app.hosting.client.secret_enc;
      set['hosting.client.previous_secret_expires_at'] = previousUntil;
    } else {
      unset['hosting.client.previous_secret_enc'] = 1;
      unset['hosting.client.previous_secret_expires_at'] = 1;
    }
    await runInTransaction(async (session) => {
      await App.updateOne({ _id: app._id }, { $set: set, $unset: unset }, session ? { session } : {});
      await h.audit(req, {
        action: 'product.secret_rotated', target_type: 'Product', target_id: key,
        details: { previous_valid_until: app.hosting.client.secret_enc ? previousUntil.toISOString() : null },
      }, session);
    });
    invalidateStandalonePortals();
    noStore(res);
    h.ok(res, { client_id: clientIdFor(key), client_secret: secret, previous_secret_expires_at: app.hosting.client.secret_enc ? previousUntil : null });
  }));

  // Per-tenant launch URL (DRD §8.2): set on the organization's entitlement; null removes it.
  router.put('/products/:key/tenants/:orgId/launch-url', requirePermission('entitlements.write'), asyncHandler(async (req: Request, res: Response) => {
    const key = keyParam(req);
    const parsed = launchUrlBody.safeParse(req.body);
    if (!parsed.success) throw new AppError(issuesText(parsed.error), 400, 'VALIDATION_ERROR');
    const url = parsed.data.launch_url || null;
    const problem = url ? portalUrlProblem(url) : null;
    if (problem) throw new AppError(`launch_url: ${problem}`, 400, 'VALIDATION_ERROR');

    const app: any = await App.findOne({ ...systemProduct(key), hosting_mode: 'standalone' }).lean();
    if (!app) throw new AppError('Standalone portal not found', 404, 'NOT_FOUND');
    if (!app.hosting?.per_tenant_launch_url) {
      throw new AppError('This portal has one launch URL for every organization', 409, 'PER_TENANT_URL_DISABLED');
    }
    const company = await Company.findById(h.oid(String(req.params.orgId), 'organization id'));
    if (!company) throw new AppError('Organization not found', 404, 'NOT_FOUND');
    const ent: any = await OrganizationEntitlement.findOne({ company_id: company._id, product_key: key }).lean();
    if (!ent) throw new AppError('The organization is not entitled to this product', 404, 'NOT_ENTITLED');

    await runInTransaction(async (session) => {
      await OrganizationEntitlement.updateOne(
        { _id: ent._id, company_id: company._id },
        url ? { $set: { 'config.launch_url': url } } : { $unset: { 'config.launch_url': 1 } },
        session ? { session } : {},
      );
      await h.audit(req, {
        action: 'entitlement.launch_url_updated', target_type: 'Entitlement', target_id: `${company._id}:${key}`,
        company: { _id: company._id as Types.ObjectId, name: company.name },
        before: { launch_url: ent.config?.launch_url ?? null }, after: { launch_url: url },
      }, session);
    });
    invalidateStandalonePortals();
    h.ok(res, { product_key: key, org_id: String(company._id), launch_url: url });
  }));

  return router;
}
