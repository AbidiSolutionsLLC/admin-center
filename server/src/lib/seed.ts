// server/src/lib/seed.ts
import { Permission } from '../models/Permission.model';
import { Role } from '../models/Role.model';
import { RolePermission } from '../models/RolePermission.model';
import { SecurityPolicy } from '../models/SecurityPolicy.model';
import { Types } from 'mongoose';
import { ROLES } from '../constants/roles';

/**
 * Seeds all permissions into the database.
 * Permissions are global (not company-scoped) and define the available actions.
 * 
 * Permission structure: (module, action, data_scope)
 * - Modules: organization, people, roles, apps, policies, workflows, locations, security, data_fields, notifications, integrations, audit_logs
 * - Actions: create, read, update, delete, export
 * - Data scopes: own (own records), department (department records), all (company-wide)
 */
export const seedPermissions = async (): Promise<void> => {
  console.log('🌱 Seeding permissions...');

  const modules = [
    'organization',
    'people',
    'roles',
    'apps',
    'policies',
    'workflows',
    'locations',
    'security',
    'data_fields',
    'notifications',
    'integrations',
    'audit_logs',
    'insights',
  ];

  const actions: Array<'create' | 'read' | 'update' | 'delete' | 'export'> = [
    'create',
    'read',
    'update',
    'delete',
    'export',
  ];

  const dataScopes: Array<'own' | 'department' | 'all'> = [
    'own',
    'department',
    'all',
  ];

  const permissions: Array<{ module: string; action: typeof actions[number]; data_scope: typeof dataScopes[number] }> = [];

  // Generate all permission combinations
  for (const module of modules) {
    for (const action of actions) {
      for (const data_scope of dataScopes) {
        permissions.push({ module, action, data_scope });
      }
    }
  }

  // Upsert all permissions (avoid duplicates)
  for (const perm of permissions) {
    await Permission.updateOne(
      { module: perm.module, action: perm.action, data_scope: perm.data_scope },
      { $setOnInsert: perm },
      { upsert: true }
    );
  }

  const count = await Permission.countDocuments();
  console.log(`✅ Permissions seeded: ${count} total`);
};

/**
 * Seeds system roles for a specific company.
 * System roles: super_admin, hr_admin, it_admin, ops_admin, manager, employee
 * 
 * Each role gets specific permissions assigned based on their function.
 * 
 * @param companyId - The company to seed roles for
 */
export const seedSystemRoles = async (companyId: string | Types.ObjectId): Promise<void> => {
  console.log(`🌱 Seeding system roles for company ${companyId}...`);

  const companyObjectId = typeof companyId === 'string' ? new Types.ObjectId(companyId) : companyId;

  const systemRoles = [
    {
      name: ROLES.SUPER_ADMIN,
      description: 'Full system access - can manage all modules, users, and settings',
      type: 'system' as const,
    },
    {
      name: ROLES.HR_ADMIN,
      description: 'Manages people, lifecycle, roles, and org structure',
      type: 'system' as const,
    },
    {
      name: ROLES.IT_ADMIN,
      description: 'Manages apps, integrations, security policies, and technical settings',
      type: 'system' as const,
    },
    {
      name: ROLES.OPS_ADMIN,
      description: 'Manages workflows, policies, locations, and operational settings',
      type: 'system' as const,
    },
    {
      name: ROLES.MANAGER,
      description: 'Can view and manage their department and team members',
      type: 'system' as const,
    },
    {
      name: ROLES.EMPLOYEE,
      description: 'Basic user - can view own profile and company directory',
      type: 'system' as const,
    },
  ];

  // Create roles
  const createdRoles: { [key: string]: Types.ObjectId } = {};

  for (const roleData of systemRoles) {
    const role = await Role.findOneAndUpdate(
      { company_id: companyObjectId, name: roleData.name },
      {
        $setOnInsert: {
          company_id: companyObjectId,
          name: roleData.name,
          description: roleData.description,
          type: roleData.type,
          is_active: true,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    if (role) {
      createdRoles[roleData.name] = role._id as Types.ObjectId;
    }
  }

  console.log(`✅ System roles created: ${Object.keys(createdRoles).length}`);

  // Assign permissions to roles
  await assignRolePermissions(createdRoles, companyObjectId);

  console.log('✅ System role permissions assigned');
};

/**
 * Assigns permissions to system roles.
 * Defines what each role can do across all modules.
 */
async function assignRolePermissions(
  roles: { [key: string]: Types.ObjectId },
  companyId: Types.ObjectId
): Promise<void> {
  // Get all permissions from DB
  const allPermissions = await Permission.find({}).lean();
  const permissionMap = new Map<string, Types.ObjectId>();

  allPermissions.forEach((p) => {
    const key = `${p.module}:${p.action}:${p.data_scope}`;
    permissionMap.set(key, p._id as Types.ObjectId);
  });

  // Helper to get permission ID
  const getPerm = (module: string, action: string, scope: string): Types.ObjectId | undefined => {
    return permissionMap.get(`${module}:${action}:${scope}`);
  };

  // Helper to assign permission
  const assign = async (roleId: Types.ObjectId, permId: Types.ObjectId | undefined, granted: boolean = true) => {
    if (!permId) return;
    await RolePermission.updateOne(
      { role_id: roleId, permission_id: permId },
      { 
        $set: { granted },
        $setOnInsert: { role_id: roleId, permission_id: permId, company_id: companyId } 
      },
      { upsert: true }
    );
  };

  // ── SUPER ADMIN: Full access to everything ──
  if (roles[ROLES.SUPER_ADMIN]) {
    for (const [, permId] of permissionMap) {
      await assign(roles[ROLES.SUPER_ADMIN], permId, true);
    }
  }

  // ── HR ADMIN: People, roles, org, audit logs, insights ──
  if (roles[ROLES.HR_ADMIN]) {
    const modules = ['people', 'roles', 'organization', 'audit_logs', 'insights'];
    const actions = ['create', 'read', 'update', 'delete', 'export'];

    for (const module of modules) {
      for (const action of actions) {
        await assign(roles[ROLES.HR_ADMIN], getPerm(module, action, 'all'), true);
      }
    }
  }

  // ── IT ADMIN: Apps, integrations, security, data fields ──
  if (roles[ROLES.IT_ADMIN]) {
    const modules = ['apps', 'integrations', 'security', 'data_fields'];
    const actions = ['create', 'read', 'update', 'delete', 'export'];

    for (const module of modules) {
      for (const action of actions) {
        await assign(roles[ROLES.IT_ADMIN], getPerm(module, action, 'all'), true);
      }
    }

    // IT Admin can also read people, org, audit logs, insights
    await assign(roles[ROLES.IT_ADMIN], getPerm('people', 'read', 'all'), true);
    await assign(roles[ROLES.IT_ADMIN], getPerm('organization', 'read', 'all'), true);
    await assign(roles[ROLES.IT_ADMIN], getPerm('audit_logs', 'read', 'all'), true);
    await assign(roles[ROLES.IT_ADMIN], getPerm('insights', 'read', 'all'), true);
    await assign(roles[ROLES.IT_ADMIN], getPerm('insights', 'update', 'all'), true);
  }

  // ── OPS ADMIN: Workflows, policies, locations, notifications ──
  if (roles[ROLES.OPS_ADMIN]) {
    const modules = ['workflows', 'policies', 'locations', 'notifications'];
    const actions = ['create', 'read', 'update', 'delete', 'export'];

    for (const module of modules) {
      for (const action of actions) {
        await assign(roles[ROLES.OPS_ADMIN], getPerm(module, action, 'all'), true);
      }
    }

    // Ops Admin can also read people, org, audit logs, insights
    await assign(roles[ROLES.OPS_ADMIN], getPerm('people', 'read', 'all'), true);
    await assign(roles[ROLES.OPS_ADMIN], getPerm('organization', 'read', 'all'), true);
    await assign(roles[ROLES.OPS_ADMIN], getPerm('audit_logs', 'read', 'all'), true);
    await assign(roles[ROLES.OPS_ADMIN], getPerm('insights', 'read', 'all'), true);
  }

  // ── MANAGER: Department-level access to people and org ──
  if (roles[ROLES.MANAGER]) {
    // Can manage their department
    await assign(roles[ROLES.MANAGER], getPerm('people', 'read', 'department'), true);
    await assign(roles[ROLES.MANAGER], getPerm('people', 'update', 'department'), true);
    await assign(roles[ROLES.MANAGER], getPerm('organization', 'read', 'department'), true);
    await assign(roles[ROLES.MANAGER], getPerm('apps', 'read', 'all'), true);

    // Can read company-wide org structure and policies
    await assign(roles[ROLES.MANAGER], getPerm('organization', 'read', 'all'), true);
    await assign(roles[ROLES.MANAGER], getPerm('policies', 'read', 'all'), true);

    // Can read insights
    await assign(roles[ROLES.MANAGER], getPerm('insights', 'read', 'department'), true);
  }

  // ── EMPLOYEE: Own data only ──
  if (roles[ROLES.EMPLOYEE]) {
    // Can read own profile
    await assign(roles[ROLES.EMPLOYEE], getPerm('people', 'read', 'own'), true);
    await assign(roles[ROLES.EMPLOYEE], getPerm('people', 'update', 'own'), true);

    // Can read company org structure (directory)
    await assign(roles[ROLES.EMPLOYEE], getPerm('organization', 'read', 'all'), true);
    
    // Can read apps assigned to them
    await assign(roles[ROLES.EMPLOYEE], getPerm('apps', 'read', 'own'), true);
    
    // Can read policies
    await assign(roles[ROLES.EMPLOYEE], getPerm('policies', 'read', 'all'), true);

    // Can read insights assigned to them
    await assign(roles[ROLES.EMPLOYEE], getPerm('insights', 'read', 'own'), true);
  }
}

/**
 * Seeds default SecurityPolicy for a company.
 * Creates a default security policy with standard settings if one doesn't exist.
 *
 * @param companyId - The company to seed security policy for
 */
export const seedSecurityPolicy = async (companyId: string | Types.ObjectId): Promise<void> => {
  console.log(`🌱 Seeding security policy for company ${companyId}...`);

  const companyObjectId = typeof companyId === 'string' ? new Types.ObjectId(companyId) : companyId;

  // Check if policy already exists
  const existingPolicy = await SecurityPolicy.findOne({ company_id: companyObjectId });
  if (existingPolicy) {
    console.log('Security policy already exists.');
    return;
  }

  // Create default security policy
  await SecurityPolicy.create({
    company_id: companyObjectId,
    policy_name: 'Default Security Policy',
    description: 'Default security policy with standard protection settings',
    is_enabled: true,
    settings: {
      max_failed_login_attempts: 5,
      lockout_duration_minutes: 30,
      session_timeout_minutes: 480, // 8 hours
      require_mfa: false,
      password_min_length: 8,
      password_require_uppercase: true,
      password_require_lowercase: true,
      password_require_numbers: true,
      password_require_special_chars: true,
      password_expiry_days: 90,
      ip_whitelist_enabled: false,
      ip_whitelist: [],
    },
  });

  console.log('✅ Security policy seeded');
};

/**
 * Complete database seeding: permissions + system roles + security policy for a company.
 *
 * @param companyId - The company to seed roles for
 */
export const seedDatabase = async (companyId: string | Types.ObjectId): Promise<void> => {
  console.log('🌱 Starting database seed...');

  await seedPermissions();
  await seedSystemRoles(companyId);
  await seedSecurityPolicy(companyId);

  console.log('✅ Database seeding complete');
};
