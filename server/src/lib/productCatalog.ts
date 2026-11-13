// server/src/lib/productCatalog.ts — 04 §4-6: system product Apps, role catalogs, default Plans (idempotent seed)
import { App } from '../models/App.model';
import { ProductRole, ProductKey } from '../models/ProductRole.model';
import { Plan } from '../models/Plan.model';

interface RoleDef { key: string; name: string; rank: number; is_default?: boolean }
interface ProductDef { product_key: ProductKey; name: string; slug: string; description: string; env: string; port: number; /** Entry page in the products web app (matches its AppLauncher INTERNAL_PATHS). */ path: string; roles: RoleDef[] }

/**
 * Default launch URL: the products web app (PRODUCTS_SPA_ORIGIN, a registered OIDC origin) plus the product entry page.
 * Was http://<product>.karbexa.localhost:5174, a host no OIDC client is registered for, so launcher tiles failed to sign in.
 */
export function productLaunchUrl(def: { path: string }): string {
  const origin = (process.env.PRODUCTS_SPA_ORIGIN || 'http://app.karbexa.localhost:5174').replace(/\/+$/, '');
  return origin + def.path;
}

export const PRODUCT_DEFS: ProductDef[] = [
  {
    product_key: 'people', name: 'People', slug: 'karbexa-people', description: 'HR and people operations', env: 'PEOPLE_LAUNCH_URL', port: 5174, path: '/people/home',
    roles: [
      { key: 'people_administrator', name: 'People Administrator', rank: 40 },
      { key: 'hr', name: 'HR', rank: 30 },
      { key: 'employee', name: 'Employee', rank: 10, is_default: true },
      { key: 'read_only', name: 'Read Only', rank: 5 },
    ],
  },
  {
    product_key: 'projects', name: 'Dictate', slug: 'karbexa-projects', description: 'Projects and work management', env: 'PROJECTS_LAUNCH_URL', port: 5174, path: '/project/projectDashboard',
    roles: [
      { key: 'project_administrator', name: 'Project Administrator', rank: 30 },
      { key: 'project_manager', name: 'Project Manager', rank: 20 },
      { key: 'team_member', name: 'Team Member', rank: 10, is_default: true },
      { key: 'read_only', name: 'Read Only', rank: 5 },
    ],
  },
  {
    product_key: 'sign', name: 'Sign', slug: 'karbexa-sign', description: 'Document signing', env: 'SIGN_LAUNCH_URL', port: 5174, path: '/sign/dashboard',
    roles: [
      { key: 'sign_administrator', name: 'Sign Administrator', rank: 20 },
      { key: 'sign_user', name: 'Sign User', rank: 10, is_default: true },
      { key: 'read_only', name: 'Read Only', rank: 5 },
    ],
  },
  {
    product_key: 'desk', name: 'Desk', slug: 'karbexa-desk', description: 'Service desk', env: 'DESK_LAUNCH_URL', port: 5174, path: '/desk/home',
    roles: [
      { key: 'desk_admin', name: 'Desk Admin', rank: 40 },
      { key: 'support_lead', name: 'Support Lead', rank: 30 },
      { key: 'technician', name: 'Technician', rank: 20 },
      { key: 'requester', name: 'Requester', rank: 10, is_default: true },
      { key: 'read_only', name: 'Read Only', rank: 5 },
    ],
  },
];

export const DEFAULT_PLANS: { key: string; name: string; products: ProductKey[] }[] = [
  { key: 'starter', name: 'Starter', products: ['people'] },
  { key: 'professional', name: 'Professional', products: ['people', 'projects', 'sign'] },
  { key: 'enterprise', name: 'Enterprise', products: ['people', 'projects', 'sign', 'desk'] },
];

/** Idempotent: upserts system product Apps, their role catalogs and default Plans. */
export async function seedProductRegistry(): Promise<void> {
  for (const def of PRODUCT_DEFS) {
    const defaultRole = def.roles.find(r => r.is_default)!;
    const app = await App.findOneAndUpdate(
      { slug: def.slug, company_id: { $exists: false } },
      {
        $set: {
          name: def.name,
          description: def.description,
          category: 'Karbexa',
          provider: 'Karbexa',
          status: 'active',
          is_active: true,
          is_system_app: true,
          app_type: 'karbexa_product',
          product_key: def.product_key,
          launch_url: process.env[def.env] || productLaunchUrl(def),
          default_role_key: defaultRole.key,
        },
        $setOnInsert: { slug: def.slug, role_catalog_version: 1 },
      },
      { upsert: true, new: true },
    );
    for (const r of def.roles) {
      await ProductRole.updateOne(
        { product_key: def.product_key, key: r.key },
        { $set: { app_id: app!._id, name: r.name, rank: r.rank, is_default: !!r.is_default, assignable: true } },
        { upsert: true },
      );
    }
  }
  for (const p of DEFAULT_PLANS) {
    await Plan.updateOne({ key: p.key }, { $set: { name: p.name, products: p.products, status: 'active' } }, { upsert: true });
  }
}
