// server/src/lib/intelligence.ts
import { Types } from 'mongoose';
import { User } from '../models/User.model';
import { Department } from '../models/Department.model';
import { Team } from '../models/Team.model';
import { UserRole } from '../models/UserRole.model';
import { Role } from '../models/Role.model';
import { RolePermission } from '../models/RolePermission.model';
import { SecurityPolicy } from '../models/SecurityPolicy.model';
import { Insight } from '../models/Insight.model';

/**
 * Runs all intelligence rules for a given company.
 * Detects health issues, misconfigurations, and data inconsistencies.
 * Upserts insights to avoid duplicates.
 *
 * Rules implemented:
 * - RULE-01: Active user with no role assigned
 * - RULE-02: Department with headcount > 0 and no primary_manager_id
 * - RULE-03: Active user with no department
 * - RULE-04: User last_login > 90 days and still active
 * - RULE-05: Team (type='team') with no parent department (orphan)
 * - RULE-06: Role with excessive permissions (over-permissioned)
 * - RULE-07: Admin user with MFA disabled (security risk)
 * - RULE-08: Team with no team lead assigned
 * - RULE-09: Business Unit with no child departments
 * - RULE-10: Duplicate users (same full_name in the same company)
 * - RULE-10: Setup progress < 50% after 7 days (company onboarding)
 */
export const runIntelligenceRules = async (companyId: string | Types.ObjectId): Promise<void> => {
  const companyObjectId = typeof companyId === 'string' ? new Types.ObjectId(companyId) : companyId;

  const insightsToUpsert: Partial<IInsight>[] = [];

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-01: Active user with no role assigned
  // ────────────────────────────────────────────────────────────────────────────

  const activeUsers = await User.find({
    company_id: companyObjectId,
    lifecycle_state: 'active',
    is_active: true
  }).lean();

  for (const user of activeUsers) {
    const roleCount = await UserRole.countDocuments({ user_id: user._id, company_id: companyObjectId });

    if (roleCount === 0) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'health',
        severity: 'critical',
        title: `${user.full_name} has no role assigned`,
        description: 'Active users without a role cannot access any module. Assign a role to restore access.',
        reasoning: `User "${user.full_name}" (${user.email}) is in 'active' lifecycle state but has 0 roles assigned.`,
        affected_object_type: 'User',
        affected_object_id: user._id.toString(),
        affected_object_label: user.full_name,
        remediation_url: `/people/${user._id}`,
        remediation_action: 'Assign a role to this user',
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-02: Department with headcount > 0 and no manager
  // ────────────────────────────────────────────────────────────────────────────
  
  const deptsNoManager = await Department.find({
    company_id: companyObjectId,
    is_active: true,
    $or: [
      { primary_manager_id: { $exists: false } },
      { primary_manager_id: null }
    ]
  }).lean();

  for (const dept of deptsNoManager) {
    // Count active users in this department
    const headcount = await User.countDocuments({
      company_id: companyObjectId,
      department_id: dept._id,
      is_active: true
    });

    if (headcount > 0) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'health',
        severity: 'critical',
        title: `${dept.name} has no manager assigned`,
        description: 'Departments with active members must have a primary manager to ensure proper oversight and accountability.',
        reasoning: `Department "${dept.name}" has ${headcount} active member(s) but no primary_manager_id is set.`,
        affected_object_type: 'Department',
        affected_object_id: dept._id.toString(),
        affected_object_label: dept.name,
        remediation_url: `/organization/${dept._id}`,
        remediation_action: 'Assign a primary manager to this department',
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-17: Active user with no location assigned
  // ────────────────────────────────────────────────────────────────────────────

  for (const user of activeUsers) {
    if (!user.location_id) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'health',
        severity: 'warning',
        title: `${user.full_name} has no location assigned`,
        description: 'Active users should be assigned to a primary location for proper timezone, holiday calendar, and policy inheritance.',
        reasoning: `User "${user.full_name}" (${user.email}) is in 'active' lifecycle state but has no location_id assigned. They will default to UTC timezone and may miss location-specific policies.`,
        affected_object_type: 'User',
        affected_object_id: user._id.toString(),
        affected_object_label: user.full_name,
        remediation_url: `/people/${user._id}`,
        remediation_action: 'Assign this user to a location',
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-05: Orphan team (Team model with department_id pointing to non-existent dept)
  // ────────────────────────────────────────────────────────────────────────────

  // Get all active teams
  const allTeams = await Team.find({
    company_id: companyObjectId,
    is_active: true,
  }).lean();

  // Get all active department IDs for RULE-05
  const allDeptsForRule05 = await Department.find({
    company_id: companyObjectId,
    is_active: true,
  }).lean();

  const deptIdSet = new Set(allDeptsForRule05.map((d) => d._id.toString()));

  for (const team of allTeams) {
    const deptId = team.department_id?.toString();
    if (!deptId || !deptIdSet.has(deptId)) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'health',
        severity: 'warning',
        title: `${team.name} is an orphan team`,
        description: 'Teams should be nested under a parent department or division for proper organizational structure.',
        reasoning: `Team "${team.name}" has no valid parent department (department_id: ${deptId ?? 'null'}). It is disconnected from the organizational hierarchy.`,
        affected_object_type: 'Team',
        affected_object_id: team._id.toString(),
        affected_object_label: team.name,
        remediation_url: `/teams/${team._id}`,
        remediation_action: 'Assign this team to a valid parent department',
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-06: Over-permissioned role (role with delete + export on all modules/scopes)
  // ────────────────────────────────────────────────────────────────────────────

  const allRoles = await Role.find({
    company_id: companyObjectId,
    is_active: true,
  }).lean();

  for (const role of allRoles) {
    const grantedPerms = await RolePermission.find({
      role_id: role._id,
      company_id: companyObjectId,
      granted: true,
    }).lean();

    // Get full permission details
    const permIds = grantedPerms.map((rp) => rp.permission_id);
    const { Permission } = await import('../models/Permission.model');
    const perms = await Permission.find({ _id: { $in: permIds } }).lean();

    // Count high-risk permissions (delete or export with 'all' scope)
    const highRiskCount = perms.filter(
      (p) => (p.action === 'delete' || p.action === 'export') && p.data_scope === 'all'
    ).length;

    // Flag if role has more than 10 high-risk permissions
    if (highRiskCount > 10) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'misconfiguration',
        severity: 'warning',
        title: `${role.name} is over-permissioned`,
        description: `This role has ${highRiskCount} high-risk permissions (delete/export with 'all' scope). Review and reduce to follow least-privilege principle.`,
        reasoning: `Role "${role.name}" has ${grantedPerms.length} total permissions, including ${highRiskCount} high-risk ones. Consider reducing scope to 'department' or 'own' where possible.`,
        affected_object_type: 'Role',
        affected_object_id: role._id.toString(),
        affected_object_label: role.name,
        remediation_url: `/roles/${role._id}`,
        remediation_action: 'Review and reduce role permissions',
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-07: Admin user with MFA disabled (security risk)
  // ────────────────────────────────────────────────────────────────────────────

  // Get security policy to check if MFA is required
  const securityPolicy = await SecurityPolicy.findOne({ company_id: companyObjectId }).lean();
  const mfaRequired = securityPolicy?.settings.require_mfa ?? false;

  // Only flag if MFA is required by policy OR if user has admin-level roles
  if (mfaRequired) {
    // Find all users with admin roles who don't have MFA enabled
    const adminRoles = await Role.find({
      company_id: companyObjectId,
      name: { $in: ['super_admin', 'hr_admin', 'it_admin', 'ops_admin'] },
      is_active: true,
    }).lean();

    const adminRoleIds = adminRoles.map((r) => r._id);

    if (adminRoleIds.length > 0) {
      const adminUserIds = await UserRole.distinct('user_id', {
        role_id: { $in: adminRoleIds },
      });

      const adminUsersWithoutMfa = await User.find({
        _id: { $in: adminUserIds },
        mfa_enabled: false,
        is_active: true,
      }).lean();

      for (const user of adminUsersWithoutMfa) {
        insightsToUpsert.push({
          company_id: companyObjectId,
          category: 'health',
          severity: 'critical',
          title: `${user.full_name} (admin) has MFA disabled`,
          description: 'Admin users without MFA are a security risk. Enable MFA to protect against unauthorized access.',
          reasoning: `User "${user.full_name}" (${user.email}) has admin-level access but MFA is not enabled. Security policy requires MFA for all admin accounts.`,
          affected_object_type: 'User',
          affected_object_id: user._id.toString(),
          affected_object_label: user.full_name,
          remediation_url: `/people/${user._id}`,
          remediation_action: 'Enable MFA for this user',
          is_resolved: false,
          detected_at: new Date(),
        });
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-08: Team with no team lead assigned
  // ────────────────────────────────────────────────────────────────────────────

  const teamsWithoutLead = await Team.find({
    company_id: companyObjectId,
    is_active: true,
    $or: [
      { team_lead_id: { $exists: false } },
      { team_lead_id: null }
    ]
  }).lean();

  for (const team of teamsWithoutLead) {
    insightsToUpsert.push({
      company_id: companyObjectId,
      category: 'health',
      severity: 'warning',
      title: `${team.name} has no team lead assigned`,
      description: 'Teams should have a team lead to ensure proper oversight and accountability.',
      reasoning: `Team "${team.name}" has no team_lead_id set.`,
      affected_object_type: 'Team',
      affected_object_id: team._id.toString(),
      affected_object_label: team.name,
      remediation_url: `/teams/${team._id}`,
      remediation_action: 'Assign a team lead to this team',
      is_resolved: false,
      detected_at: new Date(),
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-09: Business Unit with no child departments
  // ────────────────────────────────────────────────────────────────────────────

  const allDepts = await Department.find({
    company_id: companyObjectId,
    is_active: true,
  }).lean();

  const bus = allDepts.filter((d) => d.type === 'business_unit');

  for (const bu of bus) {
    const hasChildren = allDepts.some((d) => d.parent_id?.toString() === bu._id.toString());

    if (!hasChildren) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'misconfiguration',
        severity: 'info',
        title: `${bu.name} has no child departments`,
        description: 'Business Units should contain at least one child department or division.',
        reasoning: `Business Unit "${bu.name}" has no departments assigned to it. Consider adding departments to organize the hierarchy.`,
        affected_object_type: 'Department',
        affected_object_id: bu._id.toString(),
        affected_object_label: bu.name,
        remediation_url: `/organization/${bu._id}`,
        remediation_action: 'Add a department under this Business Unit',
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-11: Orphan Departments (not BU, no parent)
  // ────────────────────────────────────────────────────────────────────────────

  const orphanDepts = allDepts.filter((d) => d.type !== 'business_unit' && (!d.parent_id || !deptIdSet.has(d.parent_id.toString())));

  for (const dept of orphanDepts) {
    insightsToUpsert.push({
      company_id: companyObjectId,
      category: 'health',
      severity: 'warning',
      title: `${dept.name} is an orphan department`,
      description: 'Departments (other than Business Units) should be nested under a parent for proper organizational structure.',
      reasoning: `Department "${dept.name}" of type ${dept.type.replace(/_/g, ' ')} has no valid parent department.`,
      affected_object_type: 'Department',
      affected_object_id: dept._id.toString(),
      affected_object_label: dept.name,
      remediation_url: `/organization/${dept._id}`,
      remediation_action: 'Assign this department to a parent',
      is_resolved: false,
      detected_at: new Date(),
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-12: Imbalanced Structure (High headcount without secondary managers)
  // ────────────────────────────────────────────────────────────────────────────
  
  const deptHeadcountsAgg = await User.aggregate([
    { $match: { company_id: companyObjectId, is_active: true, department_id: { $exists: true, $ne: null } } },
    { $group: { _id: '$department_id', count: { $sum: 1 } } }
  ]);
  const deptHeadcountMap = new Map<string, number>(deptHeadcountsAgg.map(h => [h._id.toString(), h.count]));

  for (const dept of allDepts) {
    const headcount = deptHeadcountMap.get(dept._id.toString()) || 0;
    if (headcount > 15 && (!dept.secondary_manager_ids || dept.secondary_manager_ids.length === 0)) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'recommendation',
        severity: 'info',
        title: `${dept.name} has a high span of control`,
        description: 'Departments with more than 15 active members should ideally have secondary managers to distribute management responsibilities.',
        reasoning: `Department "${dept.name}" has ${headcount} members but no secondary managers assigned.`,
        affected_object_type: 'Department',
        affected_object_id: dept._id.toString(),
        affected_object_label: dept.name,
        remediation_url: `/organization/${dept._id}`,
        remediation_action: 'Assign secondary managers to this department',
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-10: Duplicate users (same full_name in the same company)
  // ────────────────────────────────────────────────────────────────────────────

  const allUsers = await User.find({
    company_id: companyObjectId,
    is_active: true,
  }).lean();

  // Group users by full_name and phone
  const nameUserMap = new Map<string, typeof allUsers>();
  const phoneUserMap = new Map<string, typeof allUsers>();

  for (const user of allUsers) {
    // Name check
    const normalizedName = user.full_name.toLowerCase().trim();
    if (!nameUserMap.has(normalizedName)) {
      nameUserMap.set(normalizedName, []);
    }
    nameUserMap.get(normalizedName)!.push(user);

    // Phone check
    if (user.phone) {
      const normalizedPhone = user.phone.replace(/\D/g, '');
      if (normalizedPhone.length >= 10) { // Only check if it looks like a valid phone
        if (!phoneUserMap.has(normalizedPhone)) {
          phoneUserMap.set(normalizedPhone, []);
        }
        phoneUserMap.get(normalizedPhone)!.push(user);
      }
    }
  }

  // Flag users with duplicate names
  for (const [name, users] of nameUserMap.entries()) {
    if (users.length > 1) {
      for (const user of users) {
        const duplicateEmails = users.map(u => u.email).join(', ');
        insightsToUpsert.push({
          company_id: companyObjectId,
          category: 'data_consistency',
          severity: 'warning',
          title: `Potential duplicate user (Name): "${user.full_name}"`,
          description: `Multiple user accounts exist with the same full name "${user.full_name}". This may indicate duplicate accounts that should be merged or reviewed.`,
          reasoning: `Found ${users.length} user(s) with name "${user.full_name}". Emails: ${duplicateEmails}. Verify if these are separate individuals or duplicate accounts.`,
          affected_object_type: 'User',
          affected_object_id: user._id.toString(),
          affected_object_label: user.full_name,
          remediation_url: `/people/${user._id}`,
          remediation_action: 'Review and merge duplicate user accounts if necessary',
          is_resolved: false,
          detected_at: new Date(),
        });
      }
    }
  }

  // Flag users with duplicate phone numbers
  for (const [phone, users] of phoneUserMap.entries()) {
    if (users.length > 1) {
      for (const user of users) {
        const duplicateEmails = users.map(u => u.email).join(', ');
        insightsToUpsert.push({
          company_id: companyObjectId,
          category: 'data_consistency',
          severity: 'warning',
          title: `Potential duplicate user (Phone): ${user.phone}`,
          description: `Multiple user accounts share the same phone number "${user.phone}". This often indicates duplicate identity records or shared accounts.`,
          reasoning: `Found ${users.length} user(s) with phone number "${user.phone}". Emails: ${duplicateEmails}. Ensure each user has a unique primary contact number.`,
          affected_object_type: 'User',
          affected_object_id: user._id.toString(),
          affected_object_label: user.full_name,
          remediation_url: `/people/${user._id}`,
          remediation_action: 'Review and resolve phone number conflict',
          is_resolved: false,
          detected_at: new Date(),
        });
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-13: Incomplete Profile (missing critical fields)
  // ────────────────────────────────────────────────────────────────────────────

  for (const user of activeUsers) {
    const missingFields: string[] = [];
    if (!user.phone) missingFields.push('Phone Number');
    if (!user.hire_date) missingFields.push('Hire Date');
    if (!user.employment_type) missingFields.push('Employment Type');

    if (missingFields.length > 0) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'data_consistency',
        severity: 'warning',
        title: `Incomplete profile: ${user.full_name}`,
        description: `This user profile is missing critical information: ${missingFields.join(', ')}. Maintaining complete user data is essential for payroll, compliance, and communication.`,
        reasoning: `User "${user.full_name}" is in 'active' state but has empty values for: ${missingFields.join(', ')}.`,
        affected_object_type: 'User',
        affected_object_id: user._id.toString(),
        affected_object_label: user.full_name,
        remediation_url: `/people/${user._id}`,
        remediation_action: 'Complete the user profile',
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-03: Active user with no department
  // ────────────────────────────────────────────────────────────────────────────

  for (const user of activeUsers) {
    if (!user.department_id) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'health',
        severity: 'warning',
        title: `${user.full_name} has no department`,
        description: 'Active users should be assigned to a department for proper organization and management.',
        reasoning: `User "${user.full_name}" (${user.email}) is in 'active' lifecycle state but has no department_id assigned.`,
        affected_object_type: 'User',
        affected_object_id: user._id.toString(),
        affected_object_label: user.full_name,
        remediation_url: `/people/${user._id}`,
        remediation_action: 'Assign this user to a department',
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-04: User last_login > 90 days and still active
  // ────────────────────────────────────────────────────────────────────────────

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const inactiveActiveUsers = await User.find({
    company_id: companyObjectId,
    lifecycle_state: 'active',
    is_active: true,
    last_login: { $lte: ninetyDaysAgo }
  }).lean();

  for (const user of inactiveActiveUsers) {
    const daysSinceLogin = Math.floor(
      (Date.now() - new Date(user.last_login!).getTime()) / (1000 * 60 * 60 * 24)
    );

    insightsToUpsert.push({
      company_id: companyObjectId,
      category: 'health',
      severity: 'warning',
      title: `${user.full_name} inactive for ${daysSinceLogin} days`,
      description: 'Active users who haven\'t logged in for over 90 days may need review or offboarding.',
      reasoning: `User "${user.full_name}" (${user.email}) last logged in ${daysSinceLogin} days ago but remains in 'active' state.`,
      affected_object_type: 'User',
      affected_object_id: user._id.toString(),
      affected_object_label: user.full_name,
      remediation_url: `/people/${user._id}`,
      remediation_action: 'Review user activity or consider offboarding',
      is_resolved: false,
      detected_at: new Date(),
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-10: Setup progress < 50% after 7 days (company not completing onboarding)
  // ────────────────────────────────────────────────────────────────────────────

  const { Company } = await import('../models/Company.model');
  const companies = await Company.find({
    _id: companyObjectId,
    is_active: true,
  }).lean();

  for (const company of companies) {
    // Calculate setup progress percentage
    const modules = ['org', 'users', 'roles', 'apps', 'security'] as const;
    const completedModules = modules.filter(
      (m) => company.setup_progress?.[m] === true
    ).length;
    const progressPercentage = (completedModules / modules.length) * 100;

    // Check if company is older than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const companyOlderThan7Days = company.created_at <= sevenDaysAgo;

    if (companyOlderThan7Days && progressPercentage < 50) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'recommendation',
        severity: 'info',
        title: `Setup is ${progressPercentage.toFixed(0)}% complete after 7+ days`,
        description: 'Your Admin Center setup is less than 50% complete. Finish configuring all modules to unlock the full potential of the platform.',
        reasoning: `Company "${company.name}" was created on ${company.created_at.toISOString().split('T')[0]} (${Math.floor((Date.now() - company.created_at.getTime()) / (1000 * 60 * 60 * 24))} days ago). Setup progress: ${completedModules}/${modules.length} modules completed (${(['org', 'users', 'roles', 'apps', 'security'] as const).filter(m => !company.setup_progress?.[m]).join(', ')} remaining).`,
        affected_object_type: 'Company',
        affected_object_id: company._id.toString(),
        affected_object_label: company.name,
        remediation_url: '/overview',
        remediation_action: 'Complete setup from Overview page',
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-14: Conflicting permissions (Allow vs Deny)
  // RULE-15: Overlapping role assignments
  // ────────────────────────────────────────────────────────────────────────────

  // Efficiently fetch all roles and their permissions
  const companyRolePerms = await RolePermission.find({ company_id: companyObjectId }).lean();
  const companyPermIds = [...new Set(companyRolePerms.map(rp => rp.permission_id.toString()))];
  const { Permission } = await import('../models/Permission.model');
  const companyPerms = await Permission.find({ _id: { $in: companyPermIds } }).lean();
  const companyPermMap = new Map(companyPerms.map(p => [p._id.toString(), p]));

  // Build role permission maps
  const rolePermDetailsMap = new Map<string, { key: string, granted: boolean, module: string, action: string, data_scope: string }[]>();
  for (const rp of companyRolePerms) {
    const rId = rp.role_id.toString();
    if (!rolePermDetailsMap.has(rId)) rolePermDetailsMap.set(rId, []);
    
    const perm = companyPermMap.get(rp.permission_id.toString());
    if (perm) {
      rolePermDetailsMap.get(rId)!.push({
        key: `${perm.module}:${perm.action}:${perm.data_scope}`,
        granted: rp.granted,
        module: perm.module,
        action: perm.action,
        data_scope: perm.data_scope
      });
    }
  }

  // Get all user roles to find multiple assignments
  const allUserRoles = await UserRole.find({ company_id: companyObjectId }).lean();
  const userRolesMap = new Map<string, string[]>();
  for (const ur of allUserRoles) {
    const uId = ur.user_id.toString();
    if (!userRolesMap.has(uId)) userRolesMap.set(uId, []);
    userRolesMap.get(uId)!.push(ur.role_id.toString());
  }

  // Build a lookup for user objects and role objects for nice labels
  const userMap = new Map(activeUsers.map(u => [u._id.toString(), u]));
  const roleMap = new Map(allRoles.map(r => [r._id.toString(), r]));

  for (const [uId, rIds] of userRolesMap.entries()) {
    if (rIds.length < 2) continue; // Only relevant for users with multiple roles
    const user = userMap.get(uId);
    if (!user) continue;

    // --- Check RULE-14 (Conflict: Allow vs Deny) ---
    const grantedKeys = new Map<string, string>(); // perm_key -> role_id
    const deniedKeys = new Map<string, string>();  // perm_key -> role_id

    for (const rId of rIds) {
      const perms = rolePermDetailsMap.get(rId) || [];
      for (const p of perms) {
        if (p.granted) grantedKeys.set(p.key, rId);
        else deniedKeys.set(p.key, rId);
      }
    }

    const conflicts = [];
    for (const [key, grantRoleId] of grantedKeys.entries()) {
      if (deniedKeys.has(key)) {
        conflicts.push({
          key,
          grantRoleId,
          denyRoleId: deniedKeys.get(key)!,
        });
      }
    }

    if (conflicts.length > 0) {
      const sampleConflict = conflicts[0];
      const grantRoleName = roleMap.get(sampleConflict.grantRoleId)?.name || 'Unknown Role';
      const denyRoleName = roleMap.get(sampleConflict.denyRoleId)?.name || 'Unknown Role';

      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'misconfiguration',
        severity: 'warning',
        title: `Conflicting permissions for ${user.full_name}`,
        description: 'User has been assigned roles with conflicting permissions (one grants access, another explicitly denies it). Deny will override the grant.',
        reasoning: `Found ${conflicts.length} conflict(s). E.g., "${sampleConflict.key}" is granted by "${grantRoleName}" but denied by "${denyRoleName}".`,
        affected_object_type: 'User',
        affected_object_id: user._id.toString(),
        affected_object_label: user.full_name,
        remediation_url: `/people/${user._id}`,
        remediation_action: 'Review and adjust assigned roles',
        is_resolved: false,
        detected_at: new Date(),
      });
    }

    // --- Check RULE-15 (Overlapping role assignments) ---
    for (let i = 0; i < rIds.length; i++) {
      for (let j = i + 1; j < rIds.length; j++) {
        const r1 = rIds[i];
        const r2 = rIds[j];

        const perms1 = new Set((rolePermDetailsMap.get(r1) || []).filter(p => p.granted).map(p => p.key));
        const perms2 = new Set((rolePermDetailsMap.get(r2) || []).filter(p => p.granted).map(p => p.key));

        if (perms1.size === 0 && perms2.size === 0) continue;

        let isSubset = true;
        for (const k of perms1) {
          if (!perms2.has(k)) { isSubset = false; break; }
        }

        let isSuperset = true;
        for (const k of perms2) {
          if (!perms1.has(k)) { isSuperset = false; break; }
        }

        if (isSubset || isSuperset) {
          const role1Name = roleMap.get(r1)?.name || 'Unknown Role';
          const role2Name = roleMap.get(r2)?.name || 'Unknown Role';
          const [redundantRole, dominantRole] = isSubset ? [role1Name, role2Name] : [role2Name, role1Name];

          insightsToUpsert.push({
            company_id: companyObjectId,
            category: 'misconfiguration',
            severity: 'info',
            title: `Redundant role assignment for ${user.full_name}`,
            description: 'User is assigned multiple roles where one role provides access that is fully encompassed by another.',
            reasoning: `Role "${redundantRole}" is fully covered by permissions in Role "${dominantRole}". Removing the redundant role is recommended.`,
            affected_object_type: 'User',
            affected_object_id: user._id.toString(),
            affected_object_label: user.full_name,
            remediation_url: `/people/${user._id}`,
            remediation_action: 'Remove redundant role assignment',
            is_resolved: false,
            detected_at: new Date(),
          });
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-16: Over-permissioned user (user with effective permissions having > 10 delete/export on 'all' scope)
  // ────────────────────────────────────────────────────────────────────────────
  for (const user of activeUsers) {
    const rIds = userRolesMap.get(user._id.toString()) || [];
    if (rIds.length === 0) continue;

    // Calculate effective permissions for this user
    const userPermMap = new Map<string, boolean>();

    // First pass: collect all grants
    for (const rId of rIds) {
      const perms = rolePermDetailsMap.get(rId) || [];
      for (const p of perms) {
        if (p.granted) {
          if (!userPermMap.has(p.key)) {
            userPermMap.set(p.key, true);
          }
        }
      }
    }

    // Second pass: apply denies (deny overrides grant)
    for (const rId of rIds) {
      const perms = rolePermDetailsMap.get(rId) || [];
      for (const p of perms) {
        if (!p.granted) {
          userPermMap.set(p.key, false);
        }
      }
    }

    // Count high-risk permissions (delete or export with 'all' scope)
    let highRiskCount = 0;
    for (const [key, granted] of userPermMap.entries()) {
      if (!granted) continue;
      const parts = key.split(':');
      if (parts.length >= 3) {
        const action = parts[1];
        const scope = parts[2];
        if ((action === 'delete' || action === 'export') && scope === 'all') {
          highRiskCount++;
        }
      }
    }

    if (highRiskCount > 10) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'misconfiguration',
        severity: 'warning',
        title: `${user.full_name} is over-permissioned`,
        description: `This user has ${highRiskCount} high-risk permissions (delete/export with 'all' scope) across assigned roles. Review and reduce to follow least-privilege principle.`,
        reasoning: `User "${user.full_name}" has ${userPermMap.size} effective permissions, including ${highRiskCount} high-risk ones. Consider removing unnecessary role assignments or reducing role permission scopes.`,
        affected_object_type: 'User',
        affected_object_id: user._id.toString(),
        affected_object_label: user.full_name,
        remediation_url: `/people/${user._id}`,
        remediation_action: 'Review and adjust user role assignments',
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Upsert insights (avoid duplicates)
  // ────────────────────────────────────────────────────────────────────────────
  
  for (const insight of insightsToUpsert) {
    // Match on company + affected object + title + unresolved status
    // This ensures we don't create duplicate insights for the same issue
    await Insight.updateOne(
      {
        company_id: companyObjectId,
        affected_object_id: insight.affected_object_id,
        title: insight.title,
        is_resolved: false,
      },
      {
        $setOnInsert: insight,
      },
      { upsert: true }
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve insights that no longer apply
  // ────────────────────────────────────────────────────────────────────────────
  
  // Resolve RULE-02 insights where the department now has a manager
  const resolvedManagerInsights = await Department.find({
    company_id: companyObjectId,
    is_active: true,
    primary_manager_id: { $exists: true, $ne: null }
  }).lean();

  for (const dept of resolvedManagerInsights) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: dept._id.toString(),
        title: `${dept.name} has no manager assigned`,
        is_resolved: false,
      },
      {
        $set: {
          is_resolved: true,
          resolved_at: new Date(),
        }
      }
    );
  }

  // Resolve RULE-05 insights where the team now has a valid parent department
  const resolvedParentInsights = await Team.find({
    company_id: companyObjectId,
    is_active: true,
    department_id: { $exists: true, $ne: null }
  }).lean();

  // Get valid department IDs
  const validDeptIds = await Department.find({
    company_id: companyObjectId,
    is_active: true,
  }).distinct('_id');

  const validDeptIdSet = new Set(validDeptIds.map((id) => id.toString()));

  for (const team of resolvedParentInsights) {
    const deptId = team.department_id?.toString();
    if (deptId && validDeptIdSet.has(deptId)) {
      await Insight.updateMany(
        {
          company_id: companyObjectId,
          affected_object_id: team._id.toString(),
          title: `${team.name} is an orphan team`,
          is_resolved: false,
        },
        {
          $set: {
            is_resolved: true,
            resolved_at: new Date(),
          }
        }
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-01 insights where user now has a role
  // ────────────────────────────────────────────────────────────────────────────

  const activeUsersWithRoles = await User.find({
    company_id: companyObjectId,
    lifecycle_state: 'active',
    is_active: true
  }).lean();

  for (const user of activeUsersWithRoles) {
    const roleCount = await UserRole.countDocuments({ user_id: user._id, company_id: companyObjectId });

    if (roleCount > 0) {
      await Insight.updateMany(
        {
          company_id: companyObjectId,
          affected_object_id: user._id.toString(),
          title: `${user.full_name} has no role assigned`,
          is_resolved: false,
        },
        {
          $set: {
            is_resolved: true,
            resolved_at: new Date(),
          }
        }
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-03 insights where user now has a department
  // ────────────────────────────────────────────────────────────────────────────

  const usersWithDepartments = await User.find({
    company_id: companyObjectId,
    lifecycle_state: 'active',
    is_active: true,
    department_id: { $exists: true, $ne: null }
  }).lean();

  for (const user of usersWithDepartments) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: user._id.toString(),
        title: `${user.full_name} has no department`,
        is_resolved: false,
      },
      {
        $set: {
          is_resolved: true,
          resolved_at: new Date(),
        }
      }
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-04 insights where user logged in recently
  // ────────────────────────────────────────────────────────────────────────────

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentlyActiveUsers = await User.find({
    company_id: companyObjectId,
    lifecycle_state: 'active',
    is_active: true,
    last_login: { $gt: thirtyDaysAgo }
  }).lean();

  for (const user of recentlyActiveUsers) {
    // Use regex to match any insight title containing "inactive for X days"
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: user._id.toString(),
        title: { $regex: /^.*inactive for \d+ days$/ },
        is_resolved: false,
      },
      {
        $set: {
          is_resolved: true,
          resolved_at: new Date(),
        }
      }
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-17 insights where user now has a location
  // ────────────────────────────────────────────────────────────────────────────

  const usersWithLocation = await User.find({
    company_id: companyObjectId,
    lifecycle_state: 'active',
    is_active: true,
    location_id: { $exists: true, $ne: null },
  }).lean();

  for (const user of usersWithLocation) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: user._id.toString(),
        title: `${user.full_name} has no location assigned`,
        is_resolved: false,
      },
      {
        $set: {
          is_resolved: true,
          resolved_at: new Date(),
        }
      }
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-06 insights where role permissions reduced
  // ────────────────────────────────────────────────────────────────────────────

  for (const role of allRoles) {
    const grantedPerms = await RolePermission.find({
      role_id: role._id,
      company_id: companyObjectId,
      granted: true,
    }).lean();

    const permIds = grantedPerms.map((rp) => rp.permission_id);
    const { Permission } = await import('../models/Permission.model');
    const perms = await Permission.find({ _id: { $in: permIds } }).lean();

    const highRiskCount = perms.filter(
      (p) => (p.action === 'delete' || p.action === 'export') && p.data_scope === 'all'
    ).length;

    if (highRiskCount <= 10) {
      await Insight.updateMany(
        {
          company_id: companyObjectId,
          affected_object_id: role._id.toString(),
          title: `${role.name} is over-permissioned`,
          is_resolved: false,
        },
        {
          $set: {
            is_resolved: true,
            resolved_at: new Date(),
          }
        }
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-07 insights where admin user enabled MFA
  // ────────────────────────────────────────────────────────────────────────────

  const adminUsersWithMfa = await User.find({
    company_id: companyObjectId,
    mfa_enabled: true,
    is_active: true,
  }).lean();

  for (const user of adminUsersWithMfa) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: user._id.toString(),
        title: { $regex: /^.*\(admin\) has MFA disabled$/ },
        is_resolved: false,
      },
      {
        $set: {
          is_resolved: true,
          resolved_at: new Date(),
        }
      }
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-08 insights where team now has a lead
  // ────────────────────────────────────────────────────────────────────────────

  const teamsWithLead = await Team.find({
    company_id: companyObjectId,
    is_active: true,
    team_lead_id: { $exists: true, $ne: null }
  }).lean();

  for (const team of teamsWithLead) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: team._id.toString(),
        title: `${team.name} has no team lead assigned`,
        is_resolved: false,
      },
      {
        $set: {
          is_resolved: true,
          resolved_at: new Date(),
        }
      }
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-09 insights where BU now has child departments
  // ────────────────────────────────────────────────────────────────────────────

  const allDeptsForResolve = await Department.find({
    company_id: companyObjectId,
    is_active: true,
  }).lean();

  const busForResolve = allDeptsForResolve.filter((d) => d.type === 'business_unit');

  for (const bu of busForResolve) {
    const hasChildren = allDeptsForResolve.some(
      (d) => d.parent_id?.toString() === bu._id.toString()
    );

    if (hasChildren) {
      await Insight.updateMany(
        {
          company_id: companyObjectId,
          affected_object_id: bu._id.toString(),
          title: `${bu.name} has no child departments`,
          is_resolved: false,
        },
        {
          $set: {
            is_resolved: true,
            resolved_at: new Date(),
          }
        }
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-11 insights where department is no longer orphan
  // ────────────────────────────────────────────────────────────────────────────

  for (const dept of allDeptsForResolve) {
    if (dept.type === 'business_unit' || (dept.parent_id && validDeptIdSet.has(dept.parent_id.toString()))) {
      await Insight.updateMany(
        {
          company_id: companyObjectId,
          affected_object_id: dept._id.toString(),
          title: `${dept.name} is an orphan department`,
          is_resolved: false,
        },
        {
          $set: {
            is_resolved: true,
            resolved_at: new Date(),
          }
        }
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-12 insights where department structure is balanced
  // ────────────────────────────────────────────────────────────────────────────

  const headcountsResolve = await User.aggregate([
    { $match: { company_id: companyObjectId, is_active: true, department_id: { $exists: true, $ne: null } } },
    { $group: { _id: '$department_id', count: { $sum: 1 } } }
  ]);
  const headcountResolveMap = new Map<string, number>(headcountsResolve.map(h => [h._id.toString(), h.count]));

  for (const dept of allDeptsForResolve) {
    const headcount = headcountResolveMap.get(dept._id.toString()) || 0;
    if (headcount <= 15 || (dept.secondary_manager_ids && dept.secondary_manager_ids.length > 0)) {
      await Insight.updateMany(
        {
          company_id: companyObjectId,
          affected_object_id: dept._id.toString(),
          title: `${dept.name} has a high span of control`,
          is_resolved: false,
        },
        {
          $set: {
            is_resolved: true,
            resolved_at: new Date(),
          }
        }
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-10 insights where duplicate users no longer exist
  // ────────────────────────────────────────────────────────────────────────────

  // Re-fetch users to check for resolved duplicates
  const allUsersForResolve = await User.find({
    company_id: companyObjectId,
    is_active: true,
  }).lean();

  // Group users by full_name again
  const nameUserMapForResolve = new Map<string, typeof allUsersForResolve>();
  for (const user of allUsersForResolve) {
    const normalizedName = user.full_name.toLowerCase().trim();
    if (!nameUserMapForResolve.has(normalizedName)) {
      nameUserMapForResolve.set(normalizedName, []);
    }
    nameUserMapForResolve.get(normalizedName)!.push(user);
  }

  // Resolve insights for users that no longer have duplicates (Name)
  for (const [name, users] of nameUserMapForResolve.entries()) {
    if (users.length === 1) {
      await Insight.updateMany(
        {
          company_id: companyObjectId,
          affected_object_id: users[0]._id.toString(),
          title: { $regex: /^Potential duplicate user \(Name\):/ },
          is_resolved: false,
        },
        {
          $set: {
            is_resolved: true,
            resolved_at: new Date(),
          }
        }
      );
    }
  }

  // Resolve insights for users that no longer have duplicates (Phone)
  const phoneUserMapForResolve = new Map<string, typeof allUsersForResolve>();
  for (const user of allUsersForResolve) {
    if (user.phone) {
      const normalizedPhone = user.phone.replace(/\D/g, '');
      if (normalizedPhone.length >= 10) {
        if (!phoneUserMapForResolve.has(normalizedPhone)) {
          phoneUserMapForResolve.set(normalizedPhone, []);
        }
        phoneUserMapForResolve.get(normalizedPhone)!.push(user);
      }
    }
  }

  for (const [phone, users] of phoneUserMapForResolve.entries()) {
    if (users.length === 1) {
      await Insight.updateMany(
        {
          company_id: companyObjectId,
          affected_object_id: users[0]._id.toString(),
          title: { $regex: /^Potential duplicate user \(Phone\):/ },
          is_resolved: false,
        },
        {
          $set: {
            is_resolved: true,
            resolved_at: new Date(),
          }
        }
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-13 insights where profile is now complete
  // ────────────────────────────────────────────────────────────────────────────

  for (const user of allUsersForResolve) {
    if (user.phone && user.hire_date && user.employment_type) {
      await Insight.updateMany(
        {
          company_id: companyObjectId,
          affected_object_id: user._id.toString(),
          title: { $regex: /^Incomplete profile:/ },
          is_resolved: false,
        },
        {
          $set: {
            is_resolved: true,
            resolved_at: new Date(),
          }
        }
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-10 insights where setup progress is now >= 50%
  // ────────────────────────────────────────────────────────────────────────────

  const companiesForResolve10 = await Company.find({
    _id: companyObjectId,
    is_active: true,
  }).lean();

  for (const company of companiesForResolve10) {
    const modules = ['org', 'users', 'roles', 'apps', 'security'] as const;
    const completedModules = modules.filter(
      (m) => company.setup_progress?.[m] === true
    ).length;
    const progressPercentage = (completedModules / modules.length) * 100;

    if (progressPercentage >= 50) {
      await Insight.updateMany(
        {
          company_id: companyObjectId,
          affected_object_id: company._id.toString(),
          title: { $regex: /^Setup is \d+% complete after 7\+ days$/ },
          is_resolved: false,
        },
        {
          $set: {
            is_resolved: true,
            resolved_at: new Date(),
          }
        }
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RULE-18: Company has no default location configured with users lacking location
  // ────────────────────────────────────────────────────────────────────────────

  const companyForRule18 = await Company.findById(companyObjectId).select('settings.default_location_id').lean();
  const hasDefaultLocation = !!companyForRule18?.settings?.default_location_id;

  if (!hasDefaultLocation) {
    const usersWithoutLocationCount = await User.countDocuments({
      company_id: companyObjectId,
      lifecycle_state: 'active',
      is_active: true,
      $or: [
        { location_id: { $exists: false } },
        { location_id: null },
      ],
    });

    if (usersWithoutLocationCount > 0) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'recommendation',
        severity: 'info',
        title: 'No default location configured',
        description: 'Configure a default location to ensure users without an assigned location still receive proper timezone, holiday calendar, policy, and app access settings.',
        reasoning: `${usersWithoutLocationCount} active user(s) have no location assigned and no company default location is set. These users will use UTC timezone and may miss location-specific configurations.`,
        affected_object_type: 'Company',
        affected_object_id: companyForRule18!._id.toString(),
        affected_object_label: 'Company Settings',
        remediation_url: '/company/settings',
        remediation_action: 'Set a default location in Company Settings',
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-18 insight when default location is set
  // ────────────────────────────────────────────────────────────────────────────

  if (hasDefaultLocation) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: companyForRule18!._id.toString(),
        title: 'No default location configured',
        is_resolved: false,
      },
      {
        $set: {
          is_resolved: true,
          resolved_at: new Date(),
        }
      }
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-14 & RULE-15 insights
  // ────────────────────────────────────────────────────────────────────────────
  
  // Find which users actually triggered RULE-14/15 this run
  const flaggedForConflict = new Set(
    insightsToUpsert
      .filter(i => i.title?.startsWith('Conflicting permissions for '))
      .map(i => i.affected_object_id)
  );

  const flaggedForRedundancy = new Set(
    insightsToUpsert
      .filter(i => i.title?.startsWith('Redundant role assignment for '))
      .map(i => i.affected_object_id)
  );

  // Auto-resolve RULE-14
  const activeConflictInsights = await Insight.find({
    company_id: companyObjectId,
    title: { $regex: /^Conflicting permissions for / },
    is_resolved: false
  }).lean();

  for (const insight of activeConflictInsights) {
    if (insight.affected_object_id && !flaggedForConflict.has(insight.affected_object_id)) {
      await Insight.updateOne(
        { _id: insight._id },
        { $set: { is_resolved: true, resolved_at: new Date() } }
      );
    }
  }

  // Auto-resolve RULE-15
  const activeRedundancyInsights = await Insight.find({
    company_id: companyObjectId,
    title: { $regex: /^Redundant role assignment for / },
    is_resolved: false
  }).lean();

  for (const insight of activeRedundancyInsights) {
    if (insight.affected_object_id && !flaggedForRedundancy.has(insight.affected_object_id)) {
      await Insight.updateOne(
        { _id: insight._id },
        { $set: { is_resolved: true, resolved_at: new Date() } }
      );
    }
  }

  // Auto-resolve RULE-16
  const flaggedForOverPermission = new Set(
    insightsToUpsert
      .filter(i => i.title?.endsWith(' is over-permissioned'))
      .map(i => i.affected_object_id)
  );

  const activeOverPermissionInsights = await Insight.find({
    company_id: companyObjectId,
    title: { $regex: / is over-permissioned$/ },
    is_resolved: false
  }).lean();

  for (const insight of activeOverPermissionInsights) {
    if (insight.affected_object_id && !flaggedForOverPermission.has(insight.affected_object_id)) {
      await Insight.updateOne(
        { _id: insight._id },
        { $set: { is_resolved: true, resolved_at: new Date() } }
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Final Sync: Update is_flagged status on User model
  // ────────────────────────────────────────────────────────────────────────────
  
  // Find all unresolved insights affecting users in this company
  const usersWithActiveInsights = await Insight.distinct('affected_object_id', {
    company_id: companyObjectId,
    affected_object_type: 'User',
    is_resolved: false,
  });

  // Bulk update users: flag those with insights, unflag those without
  // We only target users in the current company
  await User.updateMany(
    { company_id: companyObjectId, _id: { $in: usersWithActiveInsights } },
    { $set: { is_flagged: true } }
  );

  await User.updateMany(
    { company_id: companyObjectId, _id: { $nin: usersWithActiveInsights } },
    { $set: { is_flagged: false } }
  );
};

// Type alias for external imports
type IInsight = import('../models/Insight.model').IInsight;
