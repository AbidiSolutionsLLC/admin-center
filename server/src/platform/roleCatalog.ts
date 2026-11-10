// server/src/platform/roleCatalog.ts — PUT /apps/:productKey/role-catalog (05 §2)
import { Router } from 'express';
import { z } from 'zod';
import { App } from '../models/App.model';
import { AppAssignment } from '../models/AppAssignment.model';
import { ProductRole, PRODUCT_KEYS } from '../models/ProductRole.model';
import { runInTransaction } from '../lib/platformEvents';
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
    const productKey = req.params.productKey as string;
    if (!(PRODUCT_KEYS as string[]).includes(productKey) || productKey === 'admin') {
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
    const result = await runInTransaction(async (session) => {
      const opts = session ? { session } : {};
      const removed = (await ProductRole.find({ product_key: productKey, key: { $nin: newKeys } }, null, opts).lean()).map(r => r.key);
      if (removed.length) {
        const used = await AppAssignment.distinct('product_role_key', { app_id: app._id, is_active: true, product_role_key: { $in: removed } }, opts as any);
        if (used.length) throw new RoleInUse(used as string[]);
      }
      for (const r of roles) {
        await ProductRole.updateOne(
          { product_key: productKey, key: r.key },
          { $set: { app_id: app._id, name: r.name, description: r.description, rank: r.rank, is_default: !!r.is_default, assignable: r.assignable !== false, catalog_version: version } },
          { upsert: true, ...opts },
        );
      }
      if (removed.length) await ProductRole.deleteMany({ product_key: productKey, key: { $in: removed } }, opts);
      await App.updateOne({ _id: app._id }, { $set: { role_catalog_version: version, default_role_key: roles.find(r => r.is_default)!.key } }, opts);
      return ProductRole.find({ product_key: productKey }, null, opts).lean();
    });
    res.status(200).json(view(version, result));
  } catch (err) {
    if (err instanceof RoleInUse) return res.status(409).json({ error: 'Role in use', code: 'ROLE_IN_USE', roles: err.keys });
    next(err);
  }
});
