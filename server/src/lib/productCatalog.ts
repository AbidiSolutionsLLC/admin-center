// server/src/lib/productCatalog.ts — 04 §4-6: system product Apps, role catalogs, default Plans (idempotent seed)
import { App } from '../models/App.model';
import { ProductRole, ProductKey } from '../models/ProductRole.model';
import { Plan } from '../models/Plan.model';
import { invalidateProductRegistry } from './productRegistry';

interface RoleDef { key: string; name: string; rank: number; is_default?: boolean }
interface ProductDef { product_key: ProductKey; name: string; slug: string; description: string; env: string; port: number; /** Entry page in the products web app (matches its AppLauncher INTERNAL_PATHS). */ path: string; icon: string; product_category: string; default_assignments: { target: 'all_members'; role: string }[]; roles: RoleDef[] }

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
    icon: 'users', product_category: 'talent', default_assignments: [{ target: 'all_members', role: 'employee' }],
    roles: [
      { key: 'people_administrator', name: 'People Administrator', rank: 40 },
      { key: 'hr', name: 'HR', rank: 30 },
      { key: 'employee', name: 'Employee', rank: 10, is_default: true },
      { key: 'read_only', name: 'Read Only', rank: 5 },
    ],
  },
  {
    product_key: 'projects', name: 'Projects', slug: 'karbexa-projects', description: 'Projects and work management', env: 'PROJECTS_LAUNCH_URL', port: 5174, path: '/project/projectDashboard',
    icon: 'folder-kanban', product_category: 'work', default_assignments: [],
    roles: [
      { key: 'project_administrator', name: 'Project Administrator', rank: 30 },
      { key: 'project_manager', name: 'Project Manager', rank: 20 },
      { key: 'team_member', name: 'Team Member', rank: 10, is_default: true },
      { key: 'read_only', name: 'Read Only', rank: 5 },
    ],
  },
  {
    product_key: 'sign', name: 'Sign', slug: 'karbexa-sign', description: 'Document signing', env: 'SIGN_LAUNCH_URL', port: 5174, path: '/sign/dashboard',
    icon: 'file-signature', product_category: 'core', default_assignments: [],
    roles: [
      { key: 'sign_administrator', name: 'Sign Administrator', rank: 20 },
      { key: 'sign_user', name: 'Sign User', rank: 10, is_default: true },
      { key: 'read_only', name: 'Read Only', rank: 5 },
    ],
  },
  {
    product_key: 'desk', name: 'Desk', slug: 'karbexa-desk', description: 'Service desk', env: 'DESK_LAUNCH_URL', port: 5174, path: '/desk/home',
    icon: 'headset', product_category: 'it', default_assignments: [{ target: 'all_members', role: 'requester' }],
    roles: [
      { key: 'desk_admin', name: 'Desk Admin', rank: 40 },
      { key: 'support_lead', name: 'Support Lead', rank: 30 },
      { key: 'technician', name: 'Technician', rank: 20 },
      { key: 'requester', name: 'Requester', rank: 10, is_default: true },
      { key: 'read_only', name: 'Read Only', rank: 5 },
    ],
  },
  {
    // Knowledge Base (execution plan D-3, decision G4): a suite module of the products app. Roles from KB PRD v2.0 §5.2
    // plus read_only. No automatic default rule and in no default plan: operators entitle a tenant by override.
    product_key: 'kb', name: 'Knowledge Base', slug: 'karbexa-kb', description: 'Knowledge articles, manuals and learning', env: 'KB_LAUNCH_URL', port: 5174, path: '/kb',
    icon: 'book-open', product_category: 'work', default_assignments: [],
    roles: [
      { key: 'kb_administrator', name: 'KB Administrator', rank: 40 },
      { key: 'kb_reviewer', name: 'KB Reviewer', rank: 30 },
      { key: 'kb_author', name: 'KB Author', rank: 20 },
      { key: 'kb_reader', name: 'KB Reader', rank: 10, is_default: true },
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
    // Manifest fields: first seed only. A later published manifest (platform/manifest.ts) is never overwritten by a re-seed.
    await App.updateOne({ _id: app!._id, manifest_version: { $exists: false } }, {
      $set: { manifest_version: 1, product_status: 'active', launch_path: def.path, icon: def.icon, product_category: def.product_category, default_assignments: def.default_assignments },
    });
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
  invalidateProductRegistry();
}
