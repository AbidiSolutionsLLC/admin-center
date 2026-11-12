// server/src/scripts/seed-e11.ts — E11 Seeding Script implementing S1–S8 from 11-SEEDING-AND-CUTOVER-PLAN.md
import mongoose, { Types, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import {
  Company as AdminCompany,
  User as AdminUser,
  Identity as AdminIdentity,
  Location as AdminLocation,
  Department as AdminDepartment,
  Role as AdminRole,
  UserRole as AdminUserRole,
  App as AdminApp,
  ProductRole as AdminProductRole,
  Plan as AdminPlan,
  OrganizationEntitlement as AdminEntitlement,
  IdentityProviderConnection as AdminIdpConnection,
  HolidayCalendar as AdminHolidayCalendar,
  Holiday as AdminHoliday,
  AppAssignment as AdminAppAssignment,
  OperatorAccount as AdminOperatorAccount,
  OrgEventCounter,
} from '../models';
import { computeEffectiveAccess } from '../lib/effectiveAccess';
import { PRODUCT_DEFS, DEFAULT_PLANS } from '../lib/productCatalog';
import { seedSystemRoles, seedPermissions } from '../lib/seed';
import { ROLES, UserRole as AdminUserRoleEnum } from '../constants/roles';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../../karbexa/backend/.env') });

// ── Zod Schemas & CLI Options ──────────────────────────────────────────────

const CliOptionsSchema = z.object({
  dryRun: z.boolean(),
  adminUri: z.string().min(1),
  monolithUri: z.string().min(1),
  companyName: z.string().optional(),
  companyId: z.string().optional(),
  verbose: z.boolean().default(false),
  reportDir: z.string().optional(),
});

export type CliOptions = z.infer<typeof CliOptionsSchema>;

export function parseArgs(args: string[]): CliOptions {
  const isReal = args.includes('--real');
  const isDryRun = args.includes('--dry-run') || !isReal;
  const isVerbose = args.includes('--verbose') || args.includes('-v');

  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  const adminUri =
    getArg('--admin-uri') ||
    process.env.ADMIN_MONGODB_URI ||
    process.env.MONGODB_URI ||
    'mongodb://localhost:27017/admin_center';

  const monolithUri =
    getArg('--monolith-uri') ||
    process.env.MONOLITH_MONGODB_URI ||
    process.env.MONOLITH_URI ||
    'mongodb://localhost:27017/karbexa';

  const companyName = getArg('--org-name') || getArg('--company-name');
  const companyId = getArg('--org-id') || getArg('--company-id');
  const reportDir = getArg('--report-dir');

  return CliOptionsSchema.parse({
    dryRun: isDryRun,
    adminUri,
    monolithUri,
    companyName,
    companyId,
    verbose: isVerbose,
    reportDir,
  });
}

// ── Monolith Schema Definitions (for reading monolith DB) ──────────────────

const MonolithCompanySchema = new Schema(
  {
    companyName: { type: String, required: true },
    slug: String,
    branches: [String],
    azureTenantId: String,
    timezone: String,
    currency: String,
    logo: String,
    companyLogo: String,
    isDeleted: { type: Boolean, default: false },
    platformOrgId: { type: String },
    platformStatus: { type: String },
  },
  { collection: 'companies', strict: false }
);

const MonolithDepartmentSchema = new Schema(
  {
    name: { type: String, required: true },
    company: { type: Schema.Types.ObjectId },
    isActive: { type: Boolean, default: true },
    platformDepartmentId: { type: String },
    deletedAt: Date,
  },
  { collection: 'departments', strict: false }
);

const MonolithUserSchema = new Schema(
  {
    name: String,
    fullName: String,
    email: { type: String, required: true },
    empID: String,
    empStatus: { type: String, enum: ['Active', 'Inactive', 'Pending'], default: 'Active' },
    empType: { type: String, default: 'Permanent' },
    role: String,
    companyRole: String,
    company: { type: Schema.Types.ObjectId },
    department: { type: Schema.Types.ObjectId },
    branch: { type: String, default: 'Main' },
    reportsTo: { type: Schema.Types.ObjectId },
    joiningDate: Date,
    endDate: Date,
    azureId: String,
    hasProjectPortalAccess: { type: Boolean, default: false },
    projectRole: String,
    hasSignPortalAccess: { type: Boolean, default: false },
    signRole: String,
    hasDeskPortalAccess: { type: Boolean, default: true },
    deskRole: String,
    isTechnician: { type: Boolean, default: false },
    platformMemberId: { type: String },
    platformIdentityId: { type: String },
    platformStatus: String,
  },
  { collection: 'users', strict: false }
);

const MonolithHolidaySchema = new Schema(
  {
    date: { type: Schema.Types.Mixed, required: true },
    holidayName: { type: String, required: true },
    holidayType: { type: String, default: 'National' },
    description: String,
    isRecurring: { type: Boolean, default: false },
  },
  { collection: 'holidays', strict: false }
);

const MonolithMemberAccessSchema = new Schema(
  {
    company: { type: Schema.Types.ObjectId, required: true, index: true },
    platformMemberId: { type: String, required: true, index: true },
    authzVer: { type: Number, default: 1 },
    products: { type: Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'memberaccesses', strict: false }
);

// ── Role & Attribute Normalizers (11 §2 S4, S5, S6) ─────────────────────────

export function mapEmploymentType(raw: string | null | undefined): 'full_time' | 'part_time' | 'contractor' | 'intern' {
  if (!raw) return 'full_time';
  const cleaned = String(raw).toLowerCase().replace(/[\s_-]+/g, '');
  if (cleaned.includes('part')) return 'part_time';
  if (cleaned.includes('contract')) return 'contractor';
  if (cleaned.includes('intern')) return 'intern';
  return 'full_time'; // 'Permanent' -> 'full_time'
}

export function mapLifecycleState(empStatus: string | null | undefined): 'active' | 'invited' | 'deactivated' {
  if (!empStatus) return 'active';
  const s = String(empStatus).toLowerCase();
  if (s === 'pending') return 'invited';
  if (s === 'inactive') return 'deactivated';
  return 'active';
}

export function mapOrgRole(companyRole: string | null | undefined): { primary: AdminUserRoleEnum; additional?: AdminUserRoleEnum } {
  if (!companyRole) return { primary: ROLES.EMPLOYEE };
  const cleaned = String(companyRole).toLowerCase().replace(/[\s_-]+/g, '');
  if (cleaned === 'superadmin') return { primary: ROLES.SUPER_ADMIN };
  if (cleaned === 'admin') return { primary: ROLES.IT_ADMIN, additional: ROLES.HR_ADMIN };
  if (cleaned === 'hr' || cleaned === 'hradmin') return { primary: ROLES.HR_ADMIN };
  if (cleaned === 'manager') return { primary: ROLES.MANAGER };
  return { primary: ROLES.EMPLOYEE };
}

export function normalizeProjectRole(rawRole: string | null | undefined, companyRole?: string | null): string {
  const cRole = companyRole ? String(companyRole).toLowerCase().replace(/[\s_-]+/g, '') : '';
  if (cRole === 'superadmin' || cRole === 'admin') return 'project_administrator';
  if (cRole === 'manager') return 'project_manager';

  if (!rawRole) return 'team_member';
  const cleaned = String(rawRole).toLowerCase().replace(/[\s_-]+/g, '');
  if (['none', 'revoked', 'noaccess', 'denied'].includes(cleaned)) return 'none';
  if (['projectadministrator', 'projectadmin', 'superadmin', 'admin'].includes(cleaned)) return 'project_administrator';
  if (['projectmanager', 'manager'].includes(cleaned)) return 'project_manager';
  if (['readonly', 'reader'].includes(cleaned)) return 'read_only';
  return 'team_member';
}

export function normalizeSignRole(rawRole: string | null | undefined, companyRole?: string | null): string {
  const cRole = companyRole ? String(companyRole).toLowerCase().replace(/[\s_-]+/g, '') : '';
  if (cRole === 'superadmin' || cRole === 'admin') return 'sign_administrator';

  if (!rawRole) return 'sign_user';
  const cleaned = String(rawRole).toLowerCase().replace(/[\s_-]+/g, '');
  if (['none', 'revoked', 'noaccess', 'denied'].includes(cleaned)) return 'none';
  if (['signadministrator', 'signadmin', 'superadmin', 'admin'].includes(cleaned)) return 'sign_administrator';
  if (['readonly', 'reader'].includes(cleaned)) return 'read_only';
  return 'sign_user';
}

export function normalizeDeskRole(
  rawRole: string | null | undefined,
  isTechnician?: boolean,
  companyRole?: string | null
): string {
  const cRole = companyRole ? String(companyRole).toLowerCase().replace(/[\s_-]+/g, '') : '';
  if (cRole === 'superadmin' || cRole === 'admin') return 'desk_admin';
  if (isTechnician) return 'technician';

  if (!rawRole) return 'requester';
  const cleaned = String(rawRole).toLowerCase().replace(/[\s_-]+/g, '');
  if (['none', 'revoked', 'noaccess', 'denied'].includes(cleaned)) return 'none';
  if (['deskadministrator', 'deskadmin', 'superadmin', 'admin'].includes(cleaned)) return 'desk_admin';
  if (['supportlead', 'lead'].includes(cleaned)) return 'support_lead';
  if (['technician', 'tech'].includes(cleaned)) return 'technician';
  if (['readonly', 'reader'].includes(cleaned)) return 'read_only';
  return 'requester';
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-');
}

// ── Reports & S5 Mapping Definitions ────────────────────────────────────────

export const S5_ROLE_MAPPINGS = [
  {
    monolithRole: 'Super Admin',
    primaryOrgRole: 'Super Admin',
    additionalOrgRoles: '',
    peopleRole: 'people_administrator',
    projectsRole: 'project_administrator',
    signRole: 'sign_administrator',
    deskRole: 'desk_admin',
  },
  {
    monolithRole: 'Admin',
    primaryOrgRole: 'IT Admin',
    additionalOrgRoles: 'HR Admin',
    peopleRole: 'people_administrator',
    projectsRole: 'project_administrator',
    signRole: 'sign_administrator',
    deskRole: 'desk_admin',
  },
  {
    monolithRole: 'HR',
    primaryOrgRole: 'HR Admin',
    additionalOrgRoles: '',
    peopleRole: 'hr',
    projectsRole: 'team_member (if portal access)',
    signRole: 'sign_user (if portal access)',
    deskRole: 'requester',
  },
  {
    monolithRole: 'HR Admin',
    primaryOrgRole: 'HR Admin',
    additionalOrgRoles: '',
    peopleRole: 'hr',
    projectsRole: 'team_member (if portal access)',
    signRole: 'sign_user (if portal access)',
    deskRole: 'requester',
  },
  {
    monolithRole: 'Manager',
    primaryOrgRole: 'Manager',
    additionalOrgRoles: '',
    peopleRole: 'employee',
    projectsRole: 'project_manager',
    signRole: 'sign_user (if portal access)',
    deskRole: 'requester',
  },
  {
    monolithRole: 'Technician',
    primaryOrgRole: 'Employee',
    additionalOrgRoles: '',
    peopleRole: 'employee',
    projectsRole: 'team_member (if portal access)',
    signRole: 'sign_user (if portal access)',
    deskRole: 'technician',
  },
  {
    monolithRole: 'Employee',
    primaryOrgRole: 'Employee',
    additionalOrgRoles: '',
    peopleRole: 'employee',
    projectsRole: 'team_member (if portal access)',
    signRole: 'sign_user (if portal access)',
    deskRole: 'requester',
  },
];

export function toCsv(rows: Array<Record<string, any>>, headers: string[]): string {
  const escapeCell = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.join(',');
  const lines = rows.map((row) => headers.map((h) => escapeCell(row[h])).join(','));
  return [headerLine, ...lines].join('\n');
}

export function writeE11Reports(params: {
  reportDir: string;
  diffs: CapabilityDiffItem[];
  unmapped: UnmappedIssue[];
}): void {
  const { reportDir, diffs, unmapped } = params;
  fs.mkdirSync(reportDir, { recursive: true });

  // 1. Unmapped users
  fs.writeFileSync(path.join(reportDir, 'unmapped_users.json'), JSON.stringify(unmapped, null, 2), 'utf8');
  fs.writeFileSync(path.join(reportDir, 'unmapped_users.csv'), toCsv(unmapped, ['type', 'details']), 'utf8');

  // 2. Duplicate emails
  const duplicates = unmapped.filter((u) => u.type === 'DUPLICATE_EMAIL');
  fs.writeFileSync(path.join(reportDir, 'duplicate_emails.json'), JSON.stringify(duplicates, null, 2), 'utf8');
  fs.writeFileSync(path.join(reportDir, 'duplicate_emails.csv'), toCsv(duplicates, ['type', 'details']), 'utf8');

  // 3. Role mapping table
  fs.writeFileSync(path.join(reportDir, 'role_mapping.json'), JSON.stringify(S5_ROLE_MAPPINGS, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(reportDir, 'role_mapping.csv'),
    toCsv(S5_ROLE_MAPPINGS, [
      'monolithRole',
      'primaryOrgRole',
      'additionalOrgRoles',
      'peopleRole',
      'projectsRole',
      'signRole',
      'deskRole',
    ]),
    'utf8'
  );

  // 4. Capability diff
  const diffRows = diffs.map((d) => ({
    email: d.email,
    fullName: d.fullName,
    monolithRole: d.monolithRole,
    monolithProjects: d.monolithPortals.projects,
    monolithSign: d.monolithPortals.sign,
    monolithDesk: d.monolithPortals.desk,
    seededOrgRole: d.seededOrgRole,
    seededPeople: d.seededProductRoles.people,
    seededProjects: d.seededProductRoles.projects,
    seededSign: d.seededProductRoles.sign,
    seededDesk: d.seededProductRoles.desk,
    loss: d.loss ? 'true' : 'false',
    lostCapabilities: d.lostCapabilities.join('; '),
    diffNotes: d.diffNotes,
  }));
  fs.writeFileSync(path.join(reportDir, 'capability_diff.json'), JSON.stringify(diffs, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(reportDir, 'capability_diff.csv'),
    toCsv(diffRows, [
      'email',
      'fullName',
      'monolithRole',
      'monolithProjects',
      'monolithSign',
      'monolithDesk',
      'seededOrgRole',
      'seededPeople',
      'seededProjects',
      'seededSign',
      'seededDesk',
      'loss',
      'lostCapabilities',
      'diffNotes',
    ]),
    'utf8'
  );
}

// ── Main Seeding Implementation ────────────────────────────────────────────

export interface CapabilityDiffItem {
  email: string;
  fullName: string;
  monolithRole: string;
  monolithPortals: { projects: string; sign: string; desk: string };
  seededOrgRole: string;
  seededProductRoles: { people: string; projects: string; sign: string; desk: string };
  diffNotes: string;
  loss: boolean;
  lostCapabilities: string[];
}

export interface UnmappedIssue {
  type: 'DUPLICATE_EMAIL' | 'MISSING_EMAIL' | 'UNMAPPED_BRANCH' | 'UNMAPPED_DEPT' | 'UNRESOLVED_MANAGER';
  details: string;
}

export async function runE11Seed(options: CliOptions): Promise<{
  diffs: CapabilityDiffItem[];
  unmapped: UnmappedIssue[];
  stats: Record<string, number>;
  reportDir: string;
}> {
  const { dryRun, adminUri, monolithUri, companyName, companyId, verbose } = options;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = options.reportDir
    ? path.resolve(options.reportDir)
    : path.resolve(process.cwd(), 'e11-reports', timestamp);

  console.log(`\n===============================================================`);
  console.log(` KARBEXA E11 SEEDING & CUTOVER SCRIPT (${dryRun ? 'DRY RUN' : 'REAL CUTOVER'})`);
  console.log(`===============================================================\n`);
  console.log(`Admin DB:    ${adminUri}`);
  console.log(`Monolith DB: ${monolithUri}\n`);

  // Establish connections
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(adminUri);
  }
  const monolithConn = await mongoose.createConnection(monolithUri).asPromise();

  // Instantiate models on connections
  const MonolithCompany = monolithConn.model('MonolithCompany', MonolithCompanySchema);
  const MonolithDepartment = monolithConn.model('MonolithDepartment', MonolithDepartmentSchema);
  const MonolithUser = monolithConn.model('MonolithUser', MonolithUserSchema);
  const MonolithHoliday = monolithConn.model('MonolithHoliday', MonolithHolidaySchema);
  const MonolithMemberAccess = monolithConn.model('MonolithMemberAccess', MonolithMemberAccessSchema);

  const stats: Record<string, number> = {
    apps: 0,
    productRoles: 0,
    plans: 0,
    operatorAccounts: 0,
    companies: 0,
    entitlements: 0,
    locations: 0,
    departments: 0,
    identities: 0,
    users: 0,
    entraLinks: 0,
    orgRoles: 0,
    appAccessRules: 0,
    holidays: 0,
    memberAccessProjected: 0,
  };

  const unmapped: UnmappedIssue[] = [];
  const diffs: CapabilityDiffItem[] = [];

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // S1: Admin: system apps, role catalogs, Plan "Internal", operator account
    // ──────────────────────────────────────────────────────────────────────────
    console.log(`[S1] Seeding Admin product registry, role catalogs & operator account...`);

    const adminAppMap = new Map<string, any>();

    for (const def of PRODUCT_DEFS) {
      const defaultRole = def.roles.find((r) => r.is_default)!;
      let app: any;
      if (!dryRun) {
        app = await AdminApp.findOneAndUpdate(
          { slug: def.slug, company_id: { $exists: false } },
          {
            $set: {
              name: def.name,
              app_type: 'karbexa_product',
              description: def.description,
              is_system_app: true,
              is_active: true,
              product_key: def.product_key,
              launch_url: process.env[def.env] || `http://localhost:${def.port}/${def.product_key}`,
              role_catalog_version: 1,
              default_role_key: defaultRole.key,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else {
        app = { _id: new Types.ObjectId(), product_key: def.product_key, name: def.name, slug: def.slug, default_role_key: defaultRole.key };
      }
      adminAppMap.set(def.product_key, app);
      stats.apps++;

      for (const r of def.roles) {
        if (!dryRun) {
          await AdminProductRole.findOneAndUpdate(
            { product_key: def.product_key, key: r.key },
            {
              $set: {
                name: r.name,
                rank: r.rank,
                is_default: !!r.is_default,
                assignable: true,
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
        stats.productRoles++;
      }
    }

    // Upsert Plan "Internal" with all 4 products
    if (!dryRun) {
      await AdminPlan.findOneAndUpdate(
        { key: 'internal' },
        {
          $set: {
            name: 'Internal',
            products: ['people', 'projects', 'sign', 'desk'],
            status: 'active',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    stats.plans++;

    // Operator account: credentials come only from the environment (same rules as seed-operator.ts).
    // An existing operator is left untouched, so re-running the seed never resets its password.
    const operatorEmail = process.env.OPERATOR_SEED_EMAIL?.trim().toLowerCase();
    const operatorPassword = process.env.OPERATOR_SEED_PASSWORD;
    if (!operatorEmail || !operatorPassword) {
      console.warn('[S1] OPERATOR_SEED_EMAIL / OPERATOR_SEED_PASSWORD not set: operator account not seeded.');
    } else {
      if (operatorPassword.length < 12) throw new Error('OPERATOR_SEED_PASSWORD must be at least 12 characters');
      if (!dryRun) {
        const opHash = await bcrypt.hash(operatorPassword, 12);
        await AdminOperatorAccount.updateOne(
          { email: operatorEmail },
          {
            $setOnInsert: {
              full_name: 'Platform Operator',
              password_hash: opHash,
              roles: ['platform_admin'],
              status: 'active',
            },
          },
          { upsert: true }
        );
      }
      stats.operatorAccounts++;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // S2: Admin Company from Monolith Company & Entitlements & Entra IdP
    // ──────────────────────────────────────────────────────────────────────────
    console.log(`[S2] Mapping monolith Company, product entitlements & Entra IdP connection...`);

    const companyQuery: any = { isDeleted: { $ne: true } };
    if (companyId) companyQuery._id = new Types.ObjectId(companyId);
    else if (companyName) companyQuery.companyName = new RegExp(`^${companyName}$`, 'i');

    const monolithOrg = await MonolithCompany.findOne(companyQuery).lean();
    if (!monolithOrg) {
      throw new Error(`Monolith Company not found using filter: ${JSON.stringify(companyQuery)}`);
    }

    console.log(`   Found Monolith Org: "${monolithOrg.companyName}" (${monolithOrg._id})`);

    const orgSlug = monolithOrg.slug || slugify(monolithOrg.companyName);
    let adminCompany: any;

    if (!dryRun) {
      adminCompany = await AdminCompany.findOneAndUpdate(
        { slug: orgSlug },
        {
          $set: {
            name: monolithOrg.companyName,
            slug: orgSlug,
            timezone: monolithOrg.timezone || 'UTC',
            currency: monolithOrg.currency || 'USD',
            logo: monolithOrg.logo || monolithOrg.companyLogo,
            plan: 'internal',
            status: 'active',
            is_active: true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Seed global permissions and system roles for this company
      await seedPermissions();
      await seedSystemRoles(adminCompany._id);

      // Write back to Monolith Company
      await MonolithCompany.updateOne(
        { _id: monolithOrg._id },
        { $set: { platformOrgId: String(adminCompany._id), platformStatus: 'active' } }
      );
    } else {
      adminCompany = {
        _id: new Types.ObjectId(),
        name: monolithOrg.companyName,
        slug: orgSlug,
      };
    }
    stats.companies++;

    // Seed Entitlements: active for all products
    const productKeysList = ['people', 'projects', 'sign', 'desk'] as const;
    for (const pk of productKeysList) {
      if (!dryRun) {
        await AdminEntitlement.findOneAndUpdate(
          { company_id: adminCompany._id, product_key: pk },
          {
            $set: {
              status: 'active',
              source: 'plan',
              plan_key: 'internal',
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
      stats.entitlements++;
    }

    // IdentityProviderConnection(entra)
    let entraConn: any;
    if (monolithOrg.azureTenantId) {
      if (!dryRun) {
        entraConn = await AdminIdpConnection.findOneAndUpdate(
          { company_id: adminCompany._id, type: 'entra' },
          {
            $set: {
              display_name: 'Microsoft Entra ID',
              status: 'draft',
              config: { tenant_id: monolithOrg.azureTenantId },
              domains: [{ domain: 'karbexa.com', verification_token: 'pending_dns' }],
              jit_provisioning: 'off',
              enforce_sso: false,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else {
        entraConn = { _id: new Types.ObjectId() };
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // S3: Locations & Departments
    // ──────────────────────────────────────────────────────────────────────────
    console.log(`[S3] Seeding Locations & Departments...`);

    // Collect branches from Company.branches and distinct User.branch
    const branchSet = new Set<string>();
    if (Array.isArray(monolithOrg.branches)) {
      monolithOrg.branches.forEach((b: string) => b && branchSet.add(b.trim()));
    }
    const userBranches = await MonolithUser.distinct('branch', { company: monolithOrg._id });
    userBranches.forEach((b: string) => b && branchSet.add(b.trim()));
    if (branchSet.size === 0) branchSet.add('Main');

    const locationMap = new Map<string, Types.ObjectId>();
    for (const bName of branchSet) {
      let locDoc: any;
      if (!dryRun) {
        locDoc = await AdminLocation.findOneAndUpdate(
          { company_id: adminCompany._id, name: bName },
          { $set: { is_active: true } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else {
        locDoc = { _id: new Types.ObjectId(), name: bName };
      }
      locationMap.set(bName, locDoc._id);
      stats.locations++;
    }

    // Departments
    const monolithDepts = await MonolithDepartment.find({
      $or: [{ company: monolithOrg._id }, { company: null }, { company: { $exists: false } }],
      deletedAt: { $exists: false },
    }).lean();

    const deptMap = new Map<string, Types.ObjectId>();
    for (const d of monolithDepts) {
      let adminDept: any;
      if (!dryRun) {
        adminDept = await AdminDepartment.findOneAndUpdate(
          { company_id: adminCompany._id, name: d.name },
          { $set: { is_active: d.isActive !== false } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Write back on monolith Department
        await MonolithDepartment.updateOne(
          { _id: d._id },
          { $set: { platformDepartmentId: String(adminDept._id) } }
        );
      } else {
        adminDept = { _id: new Types.ObjectId(), name: d.name };
      }
      deptMap.set(d._id.toString(), adminDept._id);
      stats.departments++;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // S4 & S5 & S6: Users, Identities, Entra Links, Org Roles, App Access Rules
    // ──────────────────────────────────────────────────────────────────────────
    console.log(`[S4-S6] Seeding Users, Identities, Org Roles & App Access Rules...`);

    const monolithUsers = await MonolithUser.find({
      $or: [{ company: monolithOrg._id }, { company: null }, { company: { $exists: false } }],
    }).lean();

    console.log(`   Found ${monolithUsers.length} monolith users to process.`);

    // Pre-load Admin System Roles for this company
    const adminRoles = !dryRun
      ? await AdminRole.find({ company_id: adminCompany._id, type: 'system' }).lean()
      : [
          { _id: new Types.ObjectId(), name: ROLES.SUPER_ADMIN },
          { _id: new Types.ObjectId(), name: ROLES.IT_ADMIN },
          { _id: new Types.ObjectId(), name: ROLES.HR_ADMIN },
          { _id: new Types.ObjectId(), name: ROLES.MANAGER },
          { _id: new Types.ObjectId(), name: ROLES.EMPLOYEE },
        ];
    const roleByName = new Map<string, any>(adminRoles.map((r: any) => [r.name, r]));

    const emailTracker = new Set<string>();
    const monolithIdToAdminUser = new Map<string, any>();
    let fallbackEmpCounter = 1;

    // First Pass: Create Identities, Users, Roles & direct App Access
    for (const mUser of monolithUsers) {
      const email = (mUser.email || '').trim().toLowerCase();
      if (!email) {
        unmapped.push({
          type: 'MISSING_EMAIL',
          details: `User _id:${mUser._id} has no email`,
        });
        continue;
      }

      if (emailTracker.has(email)) {
        unmapped.push({
          type: 'DUPLICATE_EMAIL',
          details: `Duplicate email ${email} for user _id:${mUser._id}`,
        });
        continue;
      }
      emailTracker.add(email);

      const fullName = (mUser.name || mUser.fullName || email.split('@')[0]).trim();
      const empType = mapEmploymentType(mUser.empType);
      const lifecycleState = mapLifecycleState(mUser.empStatus);
      const locationId = locationMap.get(mUser.branch?.trim() || 'Main') || locationMap.get('Main');
      const departmentId = mUser.department ? deptMap.get(mUser.department.toString()) : undefined;
      const employeeId = mUser.empID ? String(mUser.empID).trim() : `EMP-${String(fallbackEmpCounter++).padStart(5, '0')}`;

      if (mUser.branch && !locationMap.has(mUser.branch.trim())) {
        unmapped.push({
          type: 'UNMAPPED_BRANCH',
          details: `User ${email} has branch "${mUser.branch}" which was not mapped`,
        });
      }

      // S4: Identity + Federated Link
      let identityDoc: any;
      if (!dryRun) {
        const fedLinks = [];
        if (mUser.azureId && monolithOrg.azureTenantId && entraConn) {
          fedLinks.push({
            connection_id: entraConn._id,
            issuer: `https://login.microsoftonline.com/${monolithOrg.azureTenantId}/v2.0`,
            subject: mUser.azureId,
            linked_at: new Date(),
          });
          stats.entraLinks++;
        }

        identityDoc = await AdminIdentity.findOneAndUpdate(
          { email },
          {
            $set: {
              full_name: fullName,
              status: lifecycleState === 'deactivated' ? 'disabled' : 'active',
              email_verified_at: new Date(),
              ...(fedLinks.length ? { federated_links: fedLinks } : {}),
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else {
        identityDoc = { _id: new Types.ObjectId(), email, full_name: fullName };
        if (mUser.azureId) stats.entraLinks++;
      }
      stats.identities++;

      // S5: Org Role Mapping
      const orgRoleMapping = mapOrgRole(mUser.companyRole || mUser.role);
      const primaryRoleDoc = roleByName.get(orgRoleMapping.primary) || roleByName.get(ROLES.EMPLOYEE);

      // S4: Admin User (membership)
      let adminUserDoc: any;
      if (!dryRun) {
        adminUserDoc = await AdminUser.findOneAndUpdate(
          { company_id: adminCompany._id, email },
          {
            $set: {
              identity_id: identityDoc._id,
              employee_id: employeeId,
              full_name: fullName,
              role: orgRoleMapping.primary,
              employment_type: empType,
              lifecycle_state: lifecycleState,
              hire_date: mUser.joiningDate,
              termination_date: mUser.endDate,
              location_id: locationId,
              department_id: departmentId,
              authz_ver: 1,
              is_active: lifecycleState === 'active',
              password_hash: '$2b$12$unmigrated_seeded_password_placeholder', // Passwords not migrated (11 §2 S4)
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Assign UserRole (primary)
        if (primaryRoleDoc) {
          await AdminUserRole.findOneAndUpdate(
            { user_id: adminUserDoc._id, role_id: primaryRoleDoc._id },
            {
              $set: {
                company_id: adminCompany._id,
                assigned_by: adminUserDoc._id,
                assigned_at: new Date(),
              },
            },
            { upsert: true, new: true }
          );
        }

        // Additional role (e.g. hr_admin for Admin)
        if (orgRoleMapping.additional) {
          const addRoleDoc = roleByName.get(orgRoleMapping.additional);
          if (addRoleDoc) {
            await AdminUserRole.findOneAndUpdate(
              { user_id: adminUserDoc._id, role_id: addRoleDoc._id },
              {
                $set: {
                  company_id: adminCompany._id,
                  assigned_by: adminUserDoc._id,
                  assigned_at: new Date(),
                },
              },
              { upsert: true, new: true }
            );
          }
        }

        // Write back to Monolith User
        await MonolithUser.updateOne(
          { _id: mUser._id },
          {
            $set: {
              platformMemberId: String(adminUserDoc._id),
              platformIdentityId: String(identityDoc._id),
              platformStatus: lifecycleState,
            },
          }
        );
      } else {
        adminUserDoc = {
          _id: new Types.ObjectId(),
          email,
          full_name: fullName,
          role: orgRoleMapping.primary,
          authz_ver: 1,
        };
      }
      stats.users++;
      stats.orgRoles++;
      monolithIdToAdminUser.set(mUser._id.toString(), adminUserDoc);

      // S6: App Access Rules per Product
      const cRole = mUser.companyRole || mUser.role;

      // 1. People product role
      let peopleRole = 'employee';
      if (['Super Admin', 'Admin'].includes(cRole || '')) peopleRole = 'people_administrator';
      else if (['HR', 'HR Admin'].includes(cRole || '')) peopleRole = 'hr';

      // 2. Projects product role
      let projectsRole = '';
      if (mUser.hasProjectPortalAccess || ['Super Admin', 'Admin', 'Manager'].includes(cRole || '')) {
        projectsRole = normalizeProjectRole(mUser.projectRole, cRole);
      }

      // 3. Sign product role
      let signRole = '';
      if (mUser.hasSignPortalAccess || ['Super Admin', 'Admin'].includes(cRole || '')) {
        signRole = normalizeSignRole(mUser.signRole, cRole);
      }

      // 4. Desk product role
      let deskRole = '';
      if (mUser.hasDeskPortalAccess !== false) {
        deskRole = normalizeDeskRole(mUser.deskRole, mUser.isTechnician, cRole);
      }

      // Create direct assignments in Admin DB
      const assignmentsToCreate: Array<{ productKey: string; roleKey: string }> = [];
      if (peopleRole !== 'employee') assignmentsToCreate.push({ productKey: 'people', roleKey: peopleRole });
      if (projectsRole) assignmentsToCreate.push({ productKey: 'projects', roleKey: projectsRole });
      if (signRole) assignmentsToCreate.push({ productKey: 'sign', roleKey: signRole });
      if (deskRole) assignmentsToCreate.push({ productKey: 'desk', roleKey: deskRole });

      for (const a of assignmentsToCreate) {
        const app = adminAppMap.get(a.productKey);
        if (app) {
          if (!dryRun) {
            await AdminAppAssignment.findOneAndUpdate(
              {
                company_id: adminCompany._id,
                app_id: app._id,
                target_type: 'user',
                target_id: adminUserDoc._id,
              },
              {
                $set: {
                  product_role_key: a.roleKey,
                  is_active: true,
                  reason: 'Seeded from monolith legacy capability (E11)',
                },
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
          }
          stats.appAccessRules++;
        }
      }

      // Record Capability Diff item
      const legacyProjects = mUser.hasProjectPortalAccess
        ? (mUser.projectRole && mUser.projectRole !== 'none' ? mUser.projectRole : 'legacy_access')
        : (['Super Admin', 'Admin', 'Manager'].includes(cRole || '') ? 'role_default' : 'none');
      const legacySign = mUser.hasSignPortalAccess
        ? (mUser.signRole && mUser.signRole !== 'none' ? mUser.signRole : 'legacy_access')
        : (['Super Admin', 'Admin'].includes(cRole || '') ? 'role_default' : 'none');
      const legacyDesk = mUser.hasDeskPortalAccess !== false
        ? (mUser.deskRole && mUser.deskRole !== 'none' ? mUser.deskRole : (mUser.isTechnician ? 'technician' : 'requester'))
        : 'none';

      const seededP = projectsRole && projectsRole !== 'none' ? projectsRole : 'none';
      const seededS = signRole && signRole !== 'none' ? signRole : 'none';
      const seededD = deskRole && deskRole !== 'none' ? deskRole : 'none';

      const lostCapabilities: string[] = [];
      if (legacyProjects !== 'none' && seededP === 'none') {
        lostCapabilities.push('projects');
      }
      if (legacySign !== 'none' && seededS === 'none') {
        lostCapabilities.push('sign');
      }
      if (legacyDesk !== 'none' && seededD === 'none') {
        lostCapabilities.push('desk');
      }

      const loss = lostCapabilities.length > 0;
      const diffNotes = loss
        ? `Loss of legacy access: ${lostCapabilities.join(', ')}`
        : 'Capability preserved across all 4 products';

      diffs.push({
        email,
        fullName,
        monolithRole: cRole || 'Employee',
        monolithPortals: {
          projects: legacyProjects,
          sign: legacySign,
          desk: legacyDesk,
        },
        seededOrgRole: orgRoleMapping.primary,
        seededProductRoles: {
          people: peopleRole,
          projects: seededP,
          sign: seededS,
          desk: seededD,
        },
        diffNotes,
        loss,
        lostCapabilities,
      });
    }

    // Second Pass for reportsTo -> manager_id
    for (const mUser of monolithUsers) {
      if (mUser.reportsTo) {
        const adminMgr = monolithIdToAdminUser.get(mUser.reportsTo.toString());
        const adminUser = monolithIdToAdminUser.get(mUser._id.toString());
        if (adminMgr && adminUser && !dryRun) {
          await AdminUser.updateOne(
            { _id: adminUser._id },
            { $set: { manager_id: adminMgr._id } }
          );
        } else if (!adminMgr) {
          unmapped.push({
            type: 'UNRESOLVED_MANAGER',
            details: `User ${mUser.email} reportsTo manager ID ${mUser.reportsTo} not found in user list`,
          });
        }
      }
    }

    // S6: Org default rule People -> All Members -> employee
    const peopleApp = adminAppMap.get('people');
    if (peopleApp && !dryRun) {
      await AdminAppAssignment.findOneAndUpdate(
        {
          company_id: adminCompany._id,
          app_id: peopleApp._id,
          target_type: 'attribute',
          attribute_name: 'employment_type',
        },
        {
          $set: {
            attribute_value: 'full_time',
            product_role_key: 'employee',
            is_active: true,
            reason: 'Org default rule (People -> employee)',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      stats.appAccessRules++;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // S7: Admin holiday calendar for the org from global monolith holidays
    // ──────────────────────────────────────────────────────────────────────────
    console.log(`[S7] Seeding Holiday Calendar from monolith holidays...`);

    let holidayCalendar: any;
    if (!dryRun) {
      holidayCalendar = await AdminHolidayCalendar.findOneAndUpdate(
        { company_id: adminCompany._id, name: 'Default Company Holidays' },
        { $set: { is_active: true, description: 'Seeded from monolith holidays' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } else {
      holidayCalendar = { _id: new Types.ObjectId(), name: 'Default Company Holidays' };
    }

    const monolithHolidays = await MonolithHoliday.find({}).lean();
    for (const h of monolithHolidays) {
      const hDate = new Date(h.date);
      if (!dryRun) {
        await AdminHoliday.findOneAndUpdate(
          { calendar_id: holidayCalendar._id, name: h.holidayName, date: hDate },
          {
            $set: {
              recurring_type: h.isRecurring ? 'yearly' : 'custom',
              holiday_code: h.holidayType || 'National',
              is_observed: true,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
      stats.holidays++;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // S8: Monolith MemberAccess projection
    // ──────────────────────────────────────────────────────────────────────────
    // 11 §3 step 5: record the org's current seq S before S8, and start the monolith consumer at S, so the first
    // pull applies only Admin changes made after S (nothing skipped, no duplicate projections).
    console.log(`[S8] Projecting MemberAccess in monolith...`);
    const seqBeforeS8 = dryRun
      ? 0
      : ((await OrgEventCounter.findById(adminCompany._id).lean())?.seq ?? 0);

    for (const diff of diffs) {
      const adminUser = Array.from(monolithIdToAdminUser.values()).find((u) => u.email === diff.email);
      if (!adminUser) continue;

      if (!dryRun) {
        // 11 §2 S8: the projection comes from Admin's effective-access service, so lifecycle state, entitlements,
        // group/rule grants and org status are applied exactly as the live platform would apply them.
        const effective = await computeEffectiveAccess(adminCompany._id, adminUser._id);
        const products: Record<string, { role: string }> = {};
        for (const [productKey, grant] of Object.entries(effective.products)) products[productKey] = { role: grant.role };
        await MonolithMemberAccess.findOneAndUpdate(
          { company: monolithOrg._id, platformMemberId: String(adminUser._id) },
          { $set: { authzVer: effective.authz_ver, products, updatedAt: new Date() } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        stats.memberAccessProjected++;
        continue;
      }

      // Dry run: nothing exists in Admin yet, so report the projection the seeded roles would produce.
      const projectedProducts: Record<string, { role: string }> = {};
      if (diff.seededProductRoles.people && diff.seededProductRoles.people !== 'none') {
        projectedProducts.people = { role: diff.seededProductRoles.people };
      }
      if (diff.seededProductRoles.projects && diff.seededProductRoles.projects !== 'none') {
        projectedProducts.projects = { role: diff.seededProductRoles.projects };
      }
      if (diff.seededProductRoles.sign && diff.seededProductRoles.sign !== 'none') {
        projectedProducts.sign = { role: diff.seededProductRoles.sign };
      }
      if (diff.seededProductRoles.desk && diff.seededProductRoles.desk !== 'none') {
        projectedProducts.desk = { role: diff.seededProductRoles.desk };
      }
      if (verbose) console.log(`  [dry-run] ${diff.email}: ${JSON.stringify(projectedProducts)}`);
      stats.memberAccessProjected++;
    }

    if (!dryRun) {
      // $max: a re-run never moves the cursor backwards past what the pull worker has already applied.
      await monolithConn.collection('platformsyncstates').updateOne(
        { platformOrgId: String(adminCompany._id) },
        { $set: { company: monolithOrg._id }, $max: { lastAppliedSeq: seqBeforeS8, pendingSeq: seqBeforeS8 } },
        { upsert: true }
      );
      console.log(`[S8] Consumer cursor for org ${adminCompany._id} starts at seq ${seqBeforeS8}.`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Reports Output
    // ──────────────────────────────────────────────────────────────────────────

    console.log(`\n===============================================================`);
    console.log(` E11 SEEDING REPORT (${dryRun ? 'DRY-RUN' : 'REAL'})`);
    console.log(`===============================================================\n`);

    console.log(`SUMMARY STATS:`);
    console.table(stats);

    if (unmapped.length > 0) {
      console.log(`\nUNMAPPED REPORT (${unmapped.length} issue(s)):`);
      console.table(unmapped);
    } else {
      console.log(`\nUNMAPPED REPORT: 0 issues found.`);
    }

    console.log(`\nCAPABILITY DIFF REPORT (Sample of first 10 users):`);
    console.table(
      diffs.slice(0, 10).map((d) => ({
        Email: d.email,
        'Legacy Role': d.monolithRole,
        'Seeded Org Role': d.seededOrgRole,
        People: d.seededProductRoles.people,
        Projects: d.seededProductRoles.projects,
        Sign: d.seededProductRoles.sign,
        Desk: d.seededProductRoles.desk,
      }))
    );

    if (diffs.length > 10) {
      console.log(`(... and ${diffs.length - 10} more users mapped cleanly)`);
    }

    console.log(`\n===============================================================`);
    console.log(` RESULT: ${dryRun ? 'DRY-RUN COMPLETED SUCCESSFULLY' : 'REAL SEEDING COMPLETED SUCCESSFULLY'}`);
    console.log(`===============================================================\n`);
    writeE11Reports({ reportDir, diffs, unmapped });

    console.log(`\n===============================================================`);
    console.log(` REPORTS WRITTEN: ${reportDir}`);
    console.log(`===============================================================\n`);
  } finally {
    await monolithConn.close();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }

  return { diffs, unmapped, stats, reportDir };
}

// ── Standalone CLI Runner ──────────────────────────────────────────────────

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  runE11Seed(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\nE11 Seed Error:', err);
      process.exit(1);
    });
}
