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

  // Group users by full_name
  const nameUserMap = new Map<string, typeof allUsers>();
  for (const user of allUsers) {
    const normalizedName = user.full_name.toLowerCase().trim();
    if (!nameUserMap.has(normalizedName)) {
      nameUserMap.set(normalizedName, []);
    }
    nameUserMap.get(normalizedName)!.push(user);
  }

  // Flag users with duplicate names
  for (const [name, users] of nameUserMap.entries()) {
    if (users.length > 1) {
      // Create an insight for each duplicate user
      for (const user of users) {
        const duplicateEmails = users.map(u => u.email).join(', ');
        insightsToUpsert.push({
          company_id: companyObjectId,
          category: 'data_consistency',
          severity: 'warning',
          title: `Potential duplicate user: "${user.full_name}"`,
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

  // Resolve insights for users that no longer have duplicates
  for (const [name, users] of nameUserMapForResolve.entries()) {
    if (users.length === 1) {
      // Only one user with this name - resolve any duplicate insights
      await Insight.updateMany(
        {
          company_id: companyObjectId,
          affected_object_id: users[0]._id.toString(),
          title: { $regex: /^Potential duplicate user:/ },
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
};

// Type alias for external imports
type IInsight = import('../models/Insight.model').IInsight;
