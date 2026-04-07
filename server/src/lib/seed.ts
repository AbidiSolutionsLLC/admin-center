// server/src/lib/seed.ts
import { Permission } from '../models/Permission.model';
import { Role } from '../models/Role.model';
import { RolePermission } from '../models/RolePermission.model';
import { Types } from 'mongoose';

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
      name: 'Super Admin',
      description: 'Full system access - can manage all modules, users, and settings',
      type: 'system' as const,
    },
    {
      name: 'HR Admin',
      description: 'Manages people, lifecycle, roles, and org structure',
      type: 'system' as const,
    },
    {
      name: 'IT Admin',
      description: 'Manages apps, integrations, security policies, and technical settings',
      type: 'system' as const,
    },
    {
      name: 'Ops Admin',
      description: 'Manages workflows, policies, locations, and operational settings',
      type: 'system' as const,
    },
    {
      name: 'Manager',
      description: 'Can view and manage their department and team members',
      type: 'system' as const,
    },
    {
      name: 'Employee',
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
      { upsert: true, new: true }
    );

    if (role) {
      createdRoles[roleData.name] = role._id as Types.ObjectId;
    }
  }

  console.log(`✅ System roles created: ${Object.keys(createdRoles).length}`);

  // Assign permissions to roles
  await assignRolePermissions(createdRoles);

  console.log('✅ System role permissions assigned');
};

/**
 * Assigns permissions to system roles.
 * Defines what each role can do across all modules.
 */
async function assignRolePermissions(roles: { [key: string]: Types.ObjectId }): Promise<void> {
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
      { $setOnInsert: { role_id: roleId, permission_id: permId, granted } },
      { upsert: true }
    );
  };

  // ── SUPER ADMIN: Full access to everything ──
  if (roles['Super Admin']) {
    for (const [, permId] of permissionMap) {
      await assign(roles['Super Admin'], permId, true);
    }
  }

  // ── HR ADMIN: People, roles, org, audit logs ──
  if (roles['HR Admin']) {
    const modules = ['people', 'roles', 'organization', 'audit_logs'];
    const actions = ['create', 'read', 'update', 'delete', 'export'];

    for (const module of modules) {
      for (const action of actions) {
        await assign(roles['HR Admin'], getPerm(module, action, 'all'), true);
      }
    }
  }

  // ── IT ADMIN: Apps, integrations, security, data fields ──
  if (roles['IT Admin']) {
    const modules = ['apps', 'integrations', 'security', 'data_fields'];
    const actions = ['create', 'read', 'update', 'delete', 'export'];

    for (const module of modules) {
      for (const action of actions) {
        await assign(roles['IT Admin'], getPerm(module, action, 'all'), true);
      }
    }

    // IT Admin can also read people, org, audit logs
    await assign(roles['IT Admin'], getPerm('people', 'read', 'all'), true);
    await assign(roles['IT Admin'], getPerm('organization', 'read', 'all'), true);
    await assign(roles['IT Admin'], getPerm('audit_logs', 'read', 'all'), true);
  }

  // ── OPS ADMIN: Workflows, policies, locations, notifications ──
  if (roles['Ops Admin']) {
    const modules = ['workflows', 'policies', 'locations', 'notifications'];
    const actions = ['create', 'read', 'update', 'delete', 'export'];

    for (const module of modules) {
      for (const action of actions) {
        await assign(roles['Ops Admin'], getPerm(module, action, 'all'), true);
      }
    }

    // Ops Admin can also read people, org, audit logs
    await assign(roles['Ops Admin'], getPerm('people', 'read', 'all'), true);
    await assign(roles['Ops Admin'], getPerm('organization', 'read', 'all'), true);
    await assign(roles['Ops Admin'], getPerm('audit_logs', 'read', 'all'), true);
  }

  // ── MANAGER: Department-level access to people and org ──
  if (roles['Manager']) {
    // Can manage their department
    await assign(roles['Manager'], getPerm('people', 'read', 'department'), true);
    await assign(roles['Manager'], getPerm('people', 'update', 'department'), true);
    await assign(roles['Manager'], getPerm('organization', 'read', 'department'), true);
    await assign(roles['Manager'], getPerm('apps', 'read', 'all'), true);
    
    // Can read company-wide org structure and policies
    await assign(roles['Manager'], getPerm('organization', 'read', 'all'), true);
    await assign(roles['Manager'], getPerm('policies', 'read', 'all'), true);
  }

  // ── EMPLOYEE: Own data only ──
  if (roles['Employee']) {
    // Can read own profile
    await assign(roles['Employee'], getPerm('people', 'read', 'own'), true);
    await assign(roles['Employee'], getPerm('people', 'update', 'own'), true);

    // Can read company org structure (directory)
    await assign(roles['Employee'], getPerm('organization', 'read', 'all'), true);
    
    // Can read apps assigned to them
    await assign(roles['Employee'], getPerm('apps', 'read', 'own'), true);
    
    // Can read policies
    await assign(roles['Employee'], getPerm('policies', 'read', 'all'), true);
  }
}

/**
 * Complete database seeding: permissions + system roles for a company.
 * 
 * @param companyId - The company to seed roles for
 */
export const seedDatabase = async (companyId: string | Types.ObjectId): Promise<void> => {
  console.log('🌱 Starting database seed...');
  
  await seedPermissions();
  await seedSystemRoles(companyId);
  
  console.log('✅ Database seeding complete');
};
