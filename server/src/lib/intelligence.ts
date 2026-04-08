// server/src/lib/intelligence.ts
import { Types } from 'mongoose';
import { User } from '../models/User.model';
import { Department } from '../models/Department.model';
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
    const roleCount = await UserRole.countDocuments({ user_id: user._id });

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
  // RULE-05: Orphan team (type='team' with no parent)
  // ────────────────────────────────────────────────────────────────────────────

  const orphanTeams = await Department.find({
    company_id: companyObjectId,
    is_active: true,
    type: 'team',
    $or: [
      { parent_id: { $exists: false } },
      { parent_id: null }
    ]
  }).lean();

  for (const team of orphanTeams) {
    insightsToUpsert.push({
      company_id: companyObjectId,
      category: 'health',
      severity: 'warning',
      title: `${team.name} is an orphan team`,
      description: 'Teams should be nested under a parent department or division for proper organizational structure.',
      reasoning: `Team "${team.name}" has no parent_id set, making it disconnected from the organizational hierarchy.`,
      affected_object_type: 'Department',
      affected_object_id: team._id.toString(),
      affected_object_label: team.name,
      remediation_url: `/organization/${team._id}`,
      remediation_action: 'Assign this team to a parent department',
      is_resolved: false,
      detected_at: new Date(),
    });
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

  // Resolve RULE-05 insights where the team now has a parent
  const resolvedParentInsights = await Department.find({
    company_id: companyObjectId,
    is_active: true,
    type: 'team',
    parent_id: { $exists: true, $ne: null }
  }).lean();

  for (const team of resolvedParentInsights) {
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

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-resolve RULE-01 insights where user now has a role
  // ────────────────────────────────────────────────────────────────────────────

  const activeUsersWithRoles = await User.find({
    company_id: companyObjectId,
    lifecycle_state: 'active',
    is_active: true
  }).lean();

  for (const user of activeUsersWithRoles) {
    const roleCount = await UserRole.countDocuments({ user_id: user._id });

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
};

// Type alias for external imports
type IInsight = import('../models/Insight.model').IInsight;
