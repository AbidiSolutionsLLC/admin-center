// server/src/lib/intelligence.ts
import { Types } from 'mongoose';
import { User, IUser } from '../models/User.model';
import { Department } from '../models/Department.model';
import { Team } from '../models/Team.model';
import { UserRole } from '../models/UserRole.model';
import { Role } from '../models/Role.model';
import { RolePermission } from '../models/RolePermission.model';
import { SecurityPolicy } from '../models/SecurityPolicy.model';
import { Insight } from '../models/Insight.model';
import { PolicyVersion } from '../models/PolicyVersion.model';
import { PolicyAssignment } from '../models/PolicyAssignment.model';
import { Location } from '../models/Location.model';
import { HolidayAssignment } from '../models/HolidayAssignment.model';
import { WorkScheduleAssignment } from '../models/WorkScheduleAssignment.model';
import { InAppNotification, IInAppNotification } from '../models/InAppNotification.model';
import { Company } from '../models/Company.model';
import { PERMISSION_GROUPS } from '../constants/roles';

// Type alias for external imports
export type IInsight = import('../models/Insight.model').IInsight;

const pendingRuns = new Set<string>();

/**
 * Triggers intelligence rules execution with a debounce mechanism.
 * Balances performance vs near real-time updates.
 */
export const triggerIntelligenceRules = (companyId: string | Types.ObjectId): void => {
  const idStr = companyId.toString();
  if (pendingRuns.has(idStr)) return;
  pendingRuns.add(idStr);

  setTimeout(() => {
    pendingRuns.delete(idStr);
    runIntelligenceRules(idStr).catch(err => {
      console.error('[Intelligence] Background rules execution failed:', err);
    });
  }, 2000); // 2 second delay to batch rapid changes (e.g. bulk imports)
};

/**
 * Helper to resolve targeted active users for a set of policy assignment rules.
 */
async function resolvePolicyTargetedUsers(
  companyId: Types.ObjectId,
  rules: Array<{ target_type: string; target_id: string }>,
  allActiveUsers: Array<IUser>
): Promise<Array<IUser>> {
  const targetedUserIds = new Set<string>();

  for (const rule of rules) {
    switch (rule.target_type) {
      case 'all':
        allActiveUsers.forEach((u) => targetedUserIds.add(u._id.toString()));
        break;
      case 'department':
        allActiveUsers
          .filter((u) => u.department_id?.toString() === rule.target_id)
          .forEach((u) => targetedUserIds.add(u._id.toString()));
        break;
      case 'role': {
        const userRoles = await UserRole.find({
          company_id: companyId,
          role_id: new Types.ObjectId(rule.target_id),
        }).lean();
        userRoles.forEach((ur) => targetedUserIds.add(ur.user_id.toString()));
        break;
      }
      case 'user':
        targetedUserIds.add(rule.target_id);
        break;
      case 'location':
        allActiveUsers
          .filter((u) => u.location_id?.toString() === rule.target_id)
          .forEach((u) => targetedUserIds.add(u._id.toString()));
        break;
      case 'group': {
        const { GroupMember } = await import('../models/GroupMember.model');
        const groupMembers = await GroupMember.find({
          group_id: new Types.ObjectId(rule.target_id),
        }).lean();
        groupMembers.forEach((gm) => targetedUserIds.add(gm.user_id.toString()));
        break;
      }
      default:
        break;
    }
  }

  return allActiveUsers.filter((u) => targetedUserIds.has(u._id.toString()));
}

/**
 * Runs all intelligence and misconfiguration detection rules for a given company.
 * Detects:
 * - Missing required configurations (Security policy, default location, calendar/schedules, empty org)
 * - Conflicting settings (overlapping policies, conflicting permissions, redundant roles)
 * - Incomplete setups (users without managers, users without roles, depts without managers, teams without leads)
 * Minimizes false positives by exempting top-level admins/CEOs and verifying real tenant data.
 * Notifies admins of newly detected issues.
 */
export const runIntelligenceRules = async (companyId: string | Types.ObjectId): Promise<void> => {
  const companyObjectId = typeof companyId === 'string' ? new Types.ObjectId(companyId) : companyId;

  const company = await Company.findById(companyObjectId).lean();
  if (!company || !company.is_active) {
    return;
  }

  const insightsToUpsert: Partial<IInsight>[] = [];

  // Fetch active users once for efficiency
  const activeUsers = await User.find({
    company_id: companyObjectId,
    lifecycle_state: 'active',
    is_active: true,
  }).lean();

  const totalActiveUsersCount = activeUsers.length;

  // ────────────────────────────────────────────────────────────────────────────
  // 1. INCOMPLETE SETUPS: Users Without Managers (RULE-26 / Incomplete Setup)
  // ────────────────────────────────────────────────────────────────────────────
  // False positive minimization:
  // - Exclude Super Admins / Company Admins
  // - Exclude primary managers of root Business Units (top executive/CEO)
  // - Exclude when the company has only 1 active user
  if (totalActiveUsersCount > 1) {
    // Find top-level Business Unit primary managers
    const rootBUs = await Department.find({
      company_id: companyObjectId,
      type: 'business_unit',
      is_active: true,
    }).select('primary_manager_id').lean();
    
    const rootManagerIds = new Set(
      rootBUs
        .map((bu) => bu.primary_manager_id?.toString())
        .filter((id): id is string => Boolean(id))
    );

    const adminRoleNames = ['super_admin', 'Super Admin', 'Owner', 'CEO'];

    for (const user of activeUsers) {
      const isSuperAdmin = adminRoleNames.includes(user.role) || (user as any).is_super_admin;
      const isRootManager = rootManagerIds.has(user._id.toString());

      if (!isSuperAdmin && !isRootManager && (!user.manager_id || user.manager_id === null)) {
        insightsToUpsert.push({
          company_id: companyObjectId,
          category: 'misconfiguration',
          severity: 'high',
          affected_area: 'Identity',
          title: `${user.full_name} has no manager assigned`,
          description: 'Active employee does not have a designated direct manager for reporting lines and approval workflows.',
          reasoning: `User "${user.full_name}" (${user.email}) is active with role "${user.role}" but has no manager_id assigned. Establishing reporting lines ensures clear accountability.`,
          affected_object_type: 'User',
          affected_object_id: user._id.toString(),
          affected_object_label: user.full_name,
          remediation_url: `/people/${user._id}`,
          remediation_action: 'Assign a direct manager to this user',
          recommendations: [
            { action: 'Assign a direct manager to this user', url: `/people/${user._id}` }
          ],
          is_resolved: false,
          detected_at: new Date(),
        });
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 2. INCOMPLETE SETUPS: RULE-01 Active User With No Role Assigned
  // ────────────────────────────────────────────────────────────────────────────
  for (const user of activeUsers) {
    const roleCount = await UserRole.countDocuments({ user_id: user._id, company_id: companyObjectId });

    if (roleCount === 0) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'health',
        severity: 'critical',
        affected_area: 'Identity',
        title: `${user.full_name} has no role assigned`,
        description: 'Active users without a role cannot access any module. Assign a role to restore access.',
        reasoning: `User "${user.full_name}" (${user.email}) is in 'active' lifecycle state but has 0 roles assigned.`,
        affected_object_type: 'User',
        affected_object_id: user._id.toString(),
        affected_object_label: user.full_name,
        remediation_url: `/people/${user._id}`,
          remediation_action: 'Assign a role to this user',
          recommendations: [
            { action: 'Assign a role to this user', url: `/people/${user._id}` }
          ],
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. INCOMPLETE SETUPS: RULE-02 Department With Headcount > 0 and No Manager
  // ────────────────────────────────────────────────────────────────────────────
  const deptsNoManager = await Department.find({
    company_id: companyObjectId,
    is_active: true,
    $or: [
      { primary_manager_id: { $exists: false } },
      { primary_manager_id: null },
    ],
  }).lean();

  for (const dept of deptsNoManager) {
    const headcount = await User.countDocuments({
      company_id: companyObjectId,
      department_id: dept._id,
      is_active: true,
    });

    if (headcount > 0) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'health',
        severity: 'critical',
        affected_area: 'Organization',
        title: `${dept.name} has no manager assigned`,
        description: 'Departments with active members must have a primary manager to ensure proper oversight and accountability.',
        reasoning: `Department "${dept.name}" has ${headcount} active member(s) but no primary_manager_id is set.`,
        affected_object_type: 'Department',
        affected_object_id: dept._id.toString(),
        affected_object_label: dept.name,
        remediation_url: `/organization/${dept._id}`,
          remediation_action: 'Assign a primary manager to this department',
          recommendations: [
            { action: 'Assign a primary manager to this department', url: `/organization/${dept._id}` }
          ],
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 4. INCOMPLETE SETUPS: RULE-08 Team With No Team Lead Assigned
  // ────────────────────────────────────────────────────────────────────────────
  const teamsWithoutLead = await Team.find({
    company_id: companyObjectId,
    is_active: true,
    $or: [
      { team_lead_id: { $exists: false } },
      { team_lead_id: null },
    ],
  }).lean();

  for (const team of teamsWithoutLead) {
    insightsToUpsert.push({
      company_id: companyObjectId,
      category: 'health',
      severity: 'medium',
      affected_area: 'Organization',
      title: `${team.name} has no team lead assigned`,
      description: 'Teams should have a team lead to ensure proper oversight and accountability.',
      reasoning: `Team "${team.name}" has no team_lead_id set.`,
      affected_object_type: 'Team',
      affected_object_id: team._id.toString(),
      affected_object_label: team.name,
      remediation_url: `/teams/${team._id}`,
          remediation_action: 'Assign a team lead to this team',
          recommendations: [
            { action: 'Assign a team lead to this team', url: `/teams/${team._id}` }
          ],
      is_resolved: false,
      detected_at: new Date(),
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 5. INCOMPLETE SETUPS: RULE-03 Active User With No Department
  // ────────────────────────────────────────────────────────────────────────────
  for (const user of activeUsers) {
    if (!user.department_id) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'health',
        severity: 'medium',
        affected_area: 'Identity',
        title: `${user.full_name} has no department`,
        description: 'Active users should be assigned to a department for proper organization and management.',
        reasoning: `User "${user.full_name}" (${user.email}) is in 'active' lifecycle state but has no department_id assigned.`,
        affected_object_type: 'User',
        affected_object_id: user._id.toString(),
        affected_object_label: user.full_name,
        remediation_url: `/people/${user._id}`,
          remediation_action: 'Assign this user to a department',
          recommendations: [
            { action: 'Assign this user to a department', url: `/people/${user._id}` }
          ],
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────────
  // 6. INCOMPLETE SETUPS: RULE-17 Active User With No Location
  // ────────────────────────────────────────────────────────────────────────────
  const defaultLocationId = (company.settings as any)?.default_location_id;
  for (const user of activeUsers) {
    if (!user.location_id) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'health',
        severity: 'medium',
        affected_area: 'Identity',
        title: `${user.full_name} has no location assigned`,
        description: 'Active users should be assigned to a primary location for proper timezone, holiday calendar, and policy inheritance.',
        reasoning: `User "${user.full_name}" (${user.email}) is in 'active' lifecycle state but has no location_id assigned. They will default to UTC timezone and may miss location-specific policies.`,
        affected_object_type: 'User',
        affected_object_id: user._id.toString(),
        affected_object_label: user.full_name,
        remediation_url: `/people/${user._id}`,
        remediation_action: 'Assign this user to a location',
        recommendations: [
          { action: 'Assign this user to a location', url: `/people/${user._id}` }
        ],
        ...(defaultLocationId && {
          auto_fix_available: true,
          auto_fix_action: 'ASSIGN_DEFAULT_LOCATION',
          auto_fix_payload: { location_id: defaultLocationId },
        }),
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 7. MISSING REQUIRED CONFIGURATION: RULE-21 Missing Company Security Policy
  // ────────────────────────────────────────────────────────────────────────────
  const securityPolicy = await SecurityPolicy.findOne({ company_id: companyObjectId }).lean();
  if (!securityPolicy || !securityPolicy.settings) {
    insightsToUpsert.push({
      company_id: companyObjectId,
      category: 'misconfiguration',
      severity: 'critical',
      affected_area: 'Security',
      title: 'Missing company security policy configuration',
      description: 'Your organization does not have an active security policy configured for password complexity, session timeouts, and authentication controls.',
      reasoning: `No active SecurityPolicy document found for company. Enterprise baseline requires defined password rules, session timeouts, and authentication standards.`,
      affected_object_type: 'Company',
      affected_object_id: companyObjectId.toString(),
      affected_object_label: company.name,
      remediation_url: '/security',
          remediation_action: 'Configure Security Policies',
          recommendations: [
            { action: 'Configure Security Policies', url: '/security' }
          ],
      is_resolved: false,
      detected_at: new Date(),
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 8. MISSING REQUIRED CONFIGURATION: RULE-18 No Default Location Configured
  // ────────────────────────────────────────────────────────────────────────────
  const hasDefaultLocation = Boolean((company.settings as any)?.default_location_id);
  const usersWithoutLocationCount = activeUsers.filter((u) => !u.location_id).length;

  if (!hasDefaultLocation && usersWithoutLocationCount > 0) {
    insightsToUpsert.push({
      company_id: companyObjectId,
      category: 'misconfiguration',
      severity: 'high',
      affected_area: 'Configuration',
      title: 'No default location configured',
      description: 'Configure a default location to ensure users without an assigned location still receive proper timezone, holiday calendar, policy, and app access settings.',
      reasoning: `${usersWithoutLocationCount} active user(s) have no location assigned and no company default location is set. These users will use UTC timezone and may miss location-specific configurations.`,
      affected_object_type: 'Company',
      affected_object_id: companyObjectId.toString(),
      affected_object_label: company.name,
      remediation_url: '/company/settings',
          remediation_action: 'Set a default location in Company Settings',
          recommendations: [
            { action: 'Set a default location in Company Settings', url: '/company/settings' }
          ],
      is_resolved: false,
      detected_at: new Date(),
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 9. MISSING REQUIRED CONFIGURATION: RULE-22 Locations Missing Holiday / Work Schedule
  // ────────────────────────────────────────────────────────────────────────────
  const activeLocations = await Location.find({ company_id: companyObjectId }).lean();
  for (const loc of activeLocations) {
    const locUsersCount = activeUsers.filter((u) => u.location_id?.toString() === loc._id.toString()).length;
    if (locUsersCount > 0) {
      // Check Holiday Calendar assignment
      const hasHoliday = await HolidayAssignment.exists({
        company_id: companyObjectId,
        location_id: loc._id,
      });

      if (!hasHoliday) {
        insightsToUpsert.push({
          company_id: companyObjectId,
          category: 'misconfiguration',
          severity: 'high',
          affected_area: 'Configuration',
          title: `Location "${loc.name}" missing holiday calendar`,
          description: `Active location "${loc.name}" has ${locUsersCount} assigned user(s) but no holiday calendar configured. Regional holidays will not be tracked.`,
          reasoning: `Location "${loc.name}" (${loc.type}) has active headcount but 0 holiday calendar assignments.`,
          affected_object_type: 'Location',
          affected_object_id: loc._id.toString(),
          affected_object_label: loc.name,
          remediation_url: `/locations/${loc._id}`,
          remediation_action: 'Assign a Holiday Calendar to this location',
          recommendations: [
            { action: 'Assign a Holiday Calendar to this location', url: `/locations/${loc._id}` }
          ],
          is_resolved: false,
          detected_at: new Date(),
        });
      }

      // Check Work Schedule assignment
      const hasWorkSchedule = await WorkScheduleAssignment.exists({
        company_id: companyObjectId,
        location_id: loc._id,
      });

      if (!hasWorkSchedule) {
        insightsToUpsert.push({
          company_id: companyObjectId,
          category: 'misconfiguration',
          severity: 'high',
          affected_area: 'Configuration',
          title: `Location "${loc.name}" missing work schedule`,
          description: `Active location "${loc.name}" has ${locUsersCount} assigned user(s) but no work schedule configured. Working days and hours will not be standardized.`,
          reasoning: `Location "${loc.name}" (${loc.type}) has active headcount but 0 work schedule assignments.`,
          affected_object_type: 'Location',
          affected_object_id: loc._id.toString(),
          affected_object_label: loc.name,
          remediation_url: `/locations/${loc._id}`,
          remediation_action: 'Assign a Work Schedule to this location',
          recommendations: [
            { action: 'Assign a Work Schedule to this location', url: `/locations/${loc._id}` }
          ],
          is_resolved: false,
          detected_at: new Date(),
        });
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 10. MISSING REQUIRED CONFIGURATION: RULE-24 Empty Organization Hierarchy
  // ────────────────────────────────────────────────────────────────────────────
  const allDepts = await Department.find({
    company_id: companyObjectId,
    is_active: true,
  }).lean();

  if (allDepts.length === 0) {
    insightsToUpsert.push({
      company_id: companyObjectId,
      category: 'misconfiguration',
      severity: 'critical',
      affected_area: 'Organization',
      title: 'Organization structure is empty',
      description: 'No active departments or business units have been created for your organization. Organizational hierarchy is required for management, reporting, and policy targeting.',
      reasoning: `Company has 0 active departments or business units configured.`,
      affected_object_type: 'Company',
      affected_object_id: companyObjectId.toString(),
      affected_object_label: company.name,
      remediation_url: '/organization',
          remediation_action: 'Create first Department or Business Unit',
          recommendations: [
            { action: 'Create first Department or Business Unit', url: '/organization' }
          ],
      is_resolved: false,
      detected_at: new Date(),
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 11. CONFLICTING SETTINGS: RULE-08 Overlapping & Conflicting Published Policies
  // ────────────────────────────────────────────────────────────────────────────
  const publishedPolicies = await PolicyVersion.find({
    company_id: companyObjectId,
    status: 'published',
    is_active: true,
  }).lean();

  // Group by category
  const policiesByCategory = new Map<string, typeof publishedPolicies>();
  for (const pol of publishedPolicies) {
    if (!policiesByCategory.has(pol.category)) {
      policiesByCategory.set(pol.category, []);
    }
    policiesByCategory.get(pol.category)!.push(pol);
  }

  // Map of policy_version_id -> targeted users
  const policyTargetedUsersMap = new Map<string, Array<IUser>>();
  for (const pol of publishedPolicies) {
    const assignments = await PolicyAssignment.find({
      company_id: companyObjectId,
      policy_version_id: pol._id,
    }).lean();

    if (assignments.length > 0) {
      const targeted = await resolvePolicyTargetedUsers(
        companyObjectId,
        assignments.map((a) => ({ target_type: a.target_type, target_id: a.target_id })),
        activeUsers
      );
      policyTargetedUsersMap.set(pol._id.toString(), targeted);
    } else {
      policyTargetedUsersMap.set(pol._id.toString(), []);
    }
  }

  // Check pairwise conflicts in each category
  for (const [category, policies] of policiesByCategory.entries()) {
    if (policies.length < 2) continue;

    for (let i = 0; i < policies.length; i++) {
      for (let j = i + 1; j < policies.length; j++) {
        const p1 = policies[i];
        const p2 = policies[j];

        if (p1.policy_key === p2.policy_key) continue; // Different versions of same policy handled separately

        const users1 = policyTargetedUsersMap.get(p1._id.toString()) || [];
        const users2 = policyTargetedUsersMap.get(p2._id.toString()) || [];

        const user2Ids = new Set(users2.map((u) => u._id.toString()));
        const overlappingUsers = users1.filter((u) => user2Ids.has(u._id.toString()));

        if (overlappingUsers.length > 0) {
          const sampleNames = overlappingUsers.slice(0, 3).map((u) => u.full_name).join(', ');
          const extraCount = overlappingUsers.length > 3 ? ` and ${overlappingUsers.length - 3} other(s)` : '';

          insightsToUpsert.push({
            company_id: companyObjectId,
            category: 'misconfiguration',
            severity: 'high',
            affected_area: 'Configuration',
            title: `Conflicting policy targeting: "${p1.title}" and "${p2.title}"`,
            description: `Two active ${category.toUpperCase()} policies target the same user population (${overlappingUsers.length} overlapping user(s)). Overlapping policies can cause contradictory rule enforcement and compliance ambiguity.`,
            reasoning: `Policies "${p1.title}" (v${p1.version_number}) and "${p2.title}" (v${p2.version_number}) both target ${overlappingUsers.length} active employee(s) (${sampleNames}${extraCount}). Consider refining assignment rules or merging policy scopes.`,
            affected_object_type: 'PolicyVersion',
            affected_object_id: p1._id.toString(),
            affected_object_label: p1.title,
            remediation_url: `/policies/${p1._id}`,
          remediation_action: 'Review and refine policy assignment rules',
          recommendations: [
            { action: 'Review and refine policy assignment rules', url: `/policies/${p1._id}` }
          ],
            is_resolved: false,
            detected_at: new Date(),
          });
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 12. CONFLICTING SETTINGS: RULE-14 Conflicting Permissions & RULE-15 Redundant Roles
  // ────────────────────────────────────────────────────────────────────────────
  const companyRolePerms = await RolePermission.find({ company_id: companyObjectId }).lean();
  const companyPermIds = [...new Set(companyRolePerms.map((rp) => rp.permission_id.toString()))];
  const { Permission } = await import('../models/Permission.model');
  const companyPerms = await Permission.find({ _id: { $in: companyPermIds } }).lean();
  const companyPermMap = new Map(companyPerms.map((p) => [p._id.toString(), p]));

  const rolePermDetailsMap = new Map<string, { key: string; granted: boolean; module: string; action: string; data_scope: string }[]>();
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
        data_scope: perm.data_scope,
      });
    }
  }

  const allUserRoles = await UserRole.find({ company_id: companyObjectId }).lean();
  const userRolesMap = new Map<string, string[]>();
  for (const ur of allUserRoles) {
    const uId = ur.user_id.toString();
    if (!userRolesMap.has(uId)) userRolesMap.set(uId, []);
    userRolesMap.get(uId)!.push(ur.role_id.toString());
  }

  const allRoles = await Role.find({ company_id: companyObjectId, is_active: true }).lean();
  const userMap = new Map(activeUsers.map((u) => [u._id.toString(), u]));
  const roleMap = new Map(allRoles.map((r) => [r._id.toString(), r]));

  for (const [uId, rIds] of userRolesMap.entries()) {
    if (rIds.length < 2) continue;
    const user = userMap.get(uId);
    if (!user) continue;

    // Check RULE-14 (Conflict: Allow vs Deny)
    const grantedKeys = new Map<string, string>();
    const deniedKeys = new Map<string, string>();

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
        severity: 'high',
        affected_area: 'Access',
        title: `Conflicting permissions for ${user.full_name}`,
        description: 'User has been assigned roles with conflicting permissions (one grants access, another explicitly denies it). Deny will override the grant.',
        reasoning: `Found ${conflicts.length} conflict(s). E.g., "${sampleConflict.key}" is granted by "${grantRoleName}" but denied by "${denyRoleName}".`,
        affected_object_type: 'User',
        affected_object_id: user._id.toString(),
        affected_object_label: user.full_name,
        remediation_url: `/people/${user._id}`,
          remediation_action: 'Review and adjust assigned roles',
          recommendations: [
            { action: 'Review and adjust assigned roles', url: `/people/${user._id}` }
          ],
        is_resolved: false,
        detected_at: new Date(),
      });
    }

    // Check RULE-15 (Overlapping role assignments)
    for (let i = 0; i < rIds.length; i++) {
      for (let j = i + 1; j < rIds.length; j++) {
        const r1 = rIds[i];
        const r2 = rIds[j];

        const perms1 = new Set((rolePermDetailsMap.get(r1) || []).filter((p) => p.granted).map((p) => p.key));
        const perms2 = new Set((rolePermDetailsMap.get(r2) || []).filter((p) => p.granted).map((p) => p.key));

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
            severity: 'low',
            affected_area: 'Access',
            title: `Redundant role assignment for ${user.full_name}`,
            description: 'User is assigned multiple roles where one role provides access that is fully encompassed by another.',
            reasoning: `Role "${redundantRole}" is fully covered by permissions in Role "${dominantRole}". Removing the redundant role is recommended.`,
            affected_object_type: 'User',
            affected_object_id: user._id.toString(),
            affected_object_label: user.full_name,
            remediation_url: `/people/${user._id}`,
          remediation_action: 'Remove redundant role assignment',
          recommendations: [
            { action: 'Remove redundant role assignment', url: `/people/${user._id}` }
          ],
            is_resolved: false,
            detected_at: new Date(),
          });
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 13. CONFLICTING / OVER-PRIVILEGED: RULE-06 Over-permissioned Role
  // ────────────────────────────────────────────────────────────────────────────
  for (const role of allRoles) {
    const grantedPerms = await RolePermission.find({
      role_id: role._id,
      company_id: companyObjectId,
      granted: true,
    }).lean();

    const permIds = grantedPerms.map((rp) => rp.permission_id);
    const perms = await Permission.find({ _id: { $in: permIds } }).lean();

    const highRiskCount = perms.filter(
      (p) => (p.action === 'delete' || p.action === 'export') && p.data_scope === 'all'
    ).length;

    if (highRiskCount > 10) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'misconfiguration',
        severity: 'high',
        affected_area: 'Access',
        title: `${role.name} is over-permissioned`,
        description: `This role has ${highRiskCount} high-risk permissions (delete/export with 'all' scope). Review and reduce to follow least-privilege principle.`,
        reasoning: `Role "${role.name}" has ${grantedPerms.length} total permissions, including ${highRiskCount} high-risk ones. Consider reducing scope to 'department' or 'own' where possible.`,
        affected_object_type: 'Role',
        affected_object_id: role._id.toString(),
        affected_object_label: role.name,
        remediation_url: `/roles/${role._id}`,
          remediation_action: 'Review and reduce role permissions',
          recommendations: [
            { action: 'Review and reduce role permissions', url: `/roles/${role._id}` }
          ],
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 14. INCOMPLETE / ORPHAN HIERARCHY: RULE-05 Orphan Teams & RULE-11 Orphan Departments
  // ────────────────────────────────────────────────────────────────────────────
  const deptIdSet = new Set(allDepts.map((d) => d._id.toString()));

  const allTeams = await Team.find({ company_id: companyObjectId, is_active: true }).lean();
  for (const team of allTeams) {
    const deptId = team.department_id?.toString();
    if (!deptId || !deptIdSet.has(deptId)) {
      insightsToUpsert.push({
        company_id: companyObjectId,
        category: 'health',
        severity: 'medium',
        affected_area: 'Organization',
        title: `${team.name} is an orphan team`,
        description: 'Teams should be nested under a parent department or division for proper organizational structure.',
        reasoning: `Team "${team.name}" has no valid parent department (department_id: ${deptId ?? 'null'}). It is disconnected from the organizational hierarchy.`,
        affected_object_type: 'Team',
        affected_object_id: team._id.toString(),
        affected_object_label: team.name,
        remediation_url: `/teams/${team._id}`,
          remediation_action: 'Assign this team to a valid parent department',
          recommendations: [
            { action: 'Assign this team to a valid parent department', url: `/teams/${team._id}` }
          ],
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  const orphanDepts = allDepts.filter((d) => d.type !== 'business_unit' && (!d.parent_id || !deptIdSet.has(d.parent_id.toString())));
  for (const dept of orphanDepts) {
    insightsToUpsert.push({
      company_id: companyObjectId,
      category: 'health',
      severity: 'medium',
      affected_area: 'Organization',
      title: `${dept.name} is an orphan department`,
      description: 'Departments (other than Business Units) should be nested under a parent for proper organizational structure.',
      reasoning: `Department "${dept.name}" of type ${dept.type.replace(/_/g, ' ')} has no valid parent department.`,
      affected_object_type: 'Department',
      affected_object_id: dept._id.toString(),
      affected_object_label: dept.name,
      remediation_url: `/organization/${dept._id}`,
          remediation_action: 'Assign this department to a parent',
          recommendations: [
            { action: 'Assign this department to a parent', url: `/organization/${dept._id}` }
          ],
      is_resolved: false,
      detected_at: new Date(),
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 15. INCOMPLETE PROFILE: RULE-13 Incomplete Profile
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
        severity: 'medium',
        affected_area: 'Identity',
        title: `Incomplete profile: ${user.full_name}`,
        description: `This user profile is missing critical information: ${missingFields.join(', ')}. Maintaining complete user data is essential for payroll, compliance, and communication.`,
        reasoning: `User "${user.full_name}" is in 'active' state but has empty values for: ${missingFields.join(', ')}.`,
        affected_object_type: 'User',
        affected_object_id: user._id.toString(),
        affected_object_label: user.full_name,
        remediation_url: `/people/${user._id}`,
          remediation_action: 'Complete the user profile',
          recommendations: [
            { action: 'Complete the user profile', url: `/people/${user._id}` }
          ],
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 16. DATA CONSISTENCY: RULE-10 Duplicate Users by Name or Phone
  // ────────────────────────────────────────────────────────────────────────────
  const nameUserMap = new Map<string, typeof activeUsers>();
  const phoneUserMap = new Map<string, typeof activeUsers>();

  for (const user of activeUsers) {
    const normalizedName = user.full_name.toLowerCase().trim();
    if (!nameUserMap.has(normalizedName)) nameUserMap.set(normalizedName, []);
    nameUserMap.get(normalizedName)!.push(user);

    if (user.phone) {
      const normalizedPhone = user.phone.replace(/\D/g, '');
      if (normalizedPhone.length >= 10) {
        if (!phoneUserMap.has(normalizedPhone)) phoneUserMap.set(normalizedPhone, []);
        phoneUserMap.get(normalizedPhone)!.push(user);
      }
    }
  }

  for (const [name, users] of nameUserMap.entries()) {
    if (users.length > 1) {
      for (const user of users) {
        const duplicateEmails = users.map((u) => u.email).join(', ');
        insightsToUpsert.push({
          company_id: companyObjectId,
          category: 'data_consistency',
          severity: 'medium',
          affected_area: 'Identity',
          title: `Potential duplicate user (Name): "${user.full_name}"`,
          description: `Multiple user accounts exist with the same full name "${user.full_name}". This may indicate duplicate accounts that should be merged or reviewed.`,
          reasoning: `Found ${users.length} user(s) with name "${user.full_name}". Emails: ${duplicateEmails}. Verify if these are separate individuals or duplicate accounts.`,
          affected_object_type: 'User',
          affected_object_id: user._id.toString(),
          affected_object_label: user.full_name,
          remediation_url: `/people/${user._id}`,
          remediation_action: 'Review and merge duplicate user accounts if necessary',
          recommendations: [
            { action: 'Review and merge duplicate user accounts if necessary', url: `/people/${user._id}` }
          ],
          is_resolved: false,
          detected_at: new Date(),
        });
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 17. SECURITY: RULE-07 Admin Account with MFA Disabled
  // ────────────────────────────────────────────────────────────────────────────
  const adminUsersWithoutMfa = activeUsers.filter((u) => {
    const isAdmin = ['super_admin', 'Super Admin', 'hr_admin', 'HR Admin', 'it_admin', 'IT Admin', 'ops_admin', 'Ops Admin'].includes(u.role);
    return isAdmin && !u.mfa_enabled;
  });

  for (const user of adminUsersWithoutMfa) {
    insightsToUpsert.push({
      company_id: companyObjectId,
      category: 'health',
      severity: 'critical',
      affected_area: 'Security',
      title: `${user.full_name} (admin) has MFA disabled`,
      description: 'Admin users without MFA are a security risk. Enable MFA to protect against unauthorized access.',
      reasoning: `User "${user.full_name}" (${user.email}) has administrative role "${user.role}" but MFA is not enabled.`,
      affected_object_type: 'User',
      affected_object_id: user._id.toString(),
      affected_object_label: user.full_name,
      remediation_url: `/people/${user._id}`,
          remediation_action: 'Enable MFA for this user',
          recommendations: [
            { action: 'Enable MFA for this user', url: `/people/${user._id}` }
          ],
      is_resolved: false,
      detected_at: new Date(),
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 18. FAILED WORKFLOWS: RULE-20 Failed Workflow Runs
  // ────────────────────────────────────────────────────────────────────────────
  const { WorkflowRun } = await import('../models/WorkflowRun.model');
  const { Workflow } = await import('../models/Workflow.model');
  const sevenDaysAgoForWf = new Date();
  sevenDaysAgoForWf.setDate(sevenDaysAgoForWf.getDate() - 7);

  const failedWorkflowRuns = await WorkflowRun.find({
    company_id: companyObjectId,
    status: 'failure',
    created_at: { $gte: sevenDaysAgoForWf },
  }).sort({ created_at: -1 }).lean();

  const failedWfMap = new Map<string, typeof failedWorkflowRuns>();
  for (const run of failedWorkflowRuns) {
    const wfId = run.workflow_id?.toString();
    if (wfId) {
      if (!failedWfMap.has(wfId)) failedWfMap.set(wfId, []);
      failedWfMap.get(wfId)!.push(run);
    }
  }

  for (const [wfId, runs] of failedWfMap.entries()) {
    const workflow = await Workflow.findById(wfId).lean();
    const wfName = workflow?.name || 'Automated Workflow';
    const latestRun = runs[0];

    insightsToUpsert.push({
      company_id: companyObjectId,
      category: 'health',
      severity: 'medium',
      affected_area: 'Workflow',
      title: `Workflow execution failure: ${wfName}`,
      description: `Workflow "${wfName}" encountered ${runs.length} failed execution(s) in the last 7 days. Check workflow run logs to diagnose failure.`,
      reasoning: `Latest error: "${latestRun.error_message || 'Step execution failure'}". Triggered by ${latestRun.triggered_by_label || 'event'}.`,
      affected_object_type: 'Workflow',
      affected_object_id: wfId,
      affected_object_label: wfName,
      remediation_url: `/workflows`,
          remediation_action: 'Inspect workflow execution logs',
          recommendations: [
            { action: 'Inspect workflow execution logs', url: `/workflows` }
          ],
      is_resolved: false,
      detected_at: new Date(),
    });
  }

  // Filter insights based on sensitivity
  const sensitivity = (company.settings as any)?.insight_sensitivity || 'medium';
  let filteredInsights = insightsToUpsert;
  if (sensitivity === 'low') {
    filteredInsights = insightsToUpsert.filter(i => i.severity === 'critical' || i.severity === 'high');
  } else if (sensitivity === 'medium') {
    filteredInsights = insightsToUpsert.filter(i => i.severity === 'critical' || i.severity === 'high' || i.severity === 'medium');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Upsert Insights & Identify Newly Detected Misconfigurations
  // ────────────────────────────────────────────────────────────────────────────
  const newlyCreatedInsights: Partial<IInsight>[] = [];

  for (const insight of filteredInsights) {
    const existing = await Insight.findOne({
      company_id: companyObjectId,
      affected_object_id: insight.affected_object_id,
      title: insight.title,
    });

    if (existing) {
      if (existing.is_dismissed) {
        // User previously dismissed it. Check if it was more than 7 days ago.
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (existing.dismissed_at && existing.dismissed_at < sevenDaysAgo) {
          existing.is_dismissed = false;
          existing.dismissed_at = undefined;
          existing.detected_at = new Date();
          await existing.save();
          newlyCreatedInsights.push(existing.toObject());
        }
        continue;
      }
      if (existing.is_resolved) {
        // If it was resolved but still detected, reopen the existing one instead of duplicating
        existing.is_resolved = false;
        existing.resolved_at = undefined;
        existing.detected_at = new Date();
        await existing.save();
        newlyCreatedInsights.push(existing.toObject());
      }
      // If already exists and active, do nothing
    } else {
      const created = await Insight.create(insight);
      newlyCreatedInsights.push(created.toObject());
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Admin Notification Dispatch for Detected Issues
  // ────────────────────────────────────────────────────────────────────────────
  if (newlyCreatedInsights.length > 0) {
    // Find Company Admins to notify
    const adminRecipients = await User.find({
      company_id: companyObjectId,
      role: { $in: ['super_admin', 'Super Admin', 'it_admin', 'IT Admin', ...PERMISSION_GROUPS.SUPER_ADMINS] as IUser['role'][] },
      is_active: true,
    }).lean();

    const { sendInsightAlert } = await import('./notificationEngine');

    for (const insight of newlyCreatedInsights) {
      if (insight.severity === 'critical') {
        // Use Notification Engine for Critical Insights (Satisfies User Story)
        await sendInsightAlert(
          companyObjectId.toString(),
          insight.title || 'Unknown',
          `${insight.description}\n\n${insight.reasoning || ''}`,
          insight._id?.toString() || ''
        );
      } else {
        // Legacy fallback: directly create InAppNotifications for non-critical
        for (const admin of adminRecipients) {
          // Prevent duplicate in-app notification spam
          const recentNotifExists = await InAppNotification.exists({
            company_id: companyObjectId,
            user_id: admin._id,
            title: `Misconfiguration Detected: ${insight.title}`,
            created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          });

          if (!recentNotifExists) {
            await InAppNotification.create({
              company_id: companyObjectId,
              user_id: admin._id,
              title: `Misconfiguration Detected: ${insight.title}`,
              message: `${insight.description}\n\n${insight.reasoning || ''}`,
              severity: insight.severity as unknown as IInAppNotification['severity'], // Insight and notification severity enums differ (pre-existing)
              status: 'unread',
              link_url: insight.remediation_url || '/overview',
            });
          }
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // AUTO-RESOLUTION: Resolve insights when conditions are satisfied
  // ────────────────────────────────────────────────────────────────────────────

  // Auto-resolve RULE-26 (Users who now have managers assigned)
  const usersWithManagers = activeUsers.filter((u) => Boolean(u.manager_id));
  for (const user of usersWithManagers) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: user._id.toString(),
        title: `${user.full_name} has no manager assigned`,
        is_resolved: false,
      },
      {
        $set: { is_resolved: true, resolved_at: new Date() },
      }
    );
  }

  // Auto-resolve RULE-01 (Users who now have roles)
  for (const user of activeUsers) {
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
          $set: { is_resolved: true, resolved_at: new Date() },
        }
      );
    }
  }

  // Auto-resolve RULE-02 (Departments that now have managers)
  const deptsWithManagers = await Department.find({
    company_id: companyObjectId,
    is_active: true,
    primary_manager_id: { $exists: true, $ne: null },
  }).lean();

  for (const dept of deptsWithManagers) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: dept._id.toString(),
        title: `${dept.name} has no manager assigned`,
        is_resolved: false,
      },
      {
        $set: { is_resolved: true, resolved_at: new Date() },
      }
    );
  }

  // Auto-resolve RULE-08 (Teams that now have leads)
  const teamsWithLeads = await Team.find({
    company_id: companyObjectId,
    is_active: true,
    team_lead_id: { $exists: true, $ne: null },
  }).lean();

  for (const team of teamsWithLeads) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: team._id.toString(),
        title: `${team.name} has no team lead assigned`,
        is_resolved: false,
      },
      {
        $set: { is_resolved: true, resolved_at: new Date() },
      }
    );
  }

  // Auto-resolve RULE-03 (Users who now have departments)
  const usersWithDepts = activeUsers.filter((u) => Boolean(u.department_id));
  for (const user of usersWithDepts) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: user._id.toString(),
        title: `${user.full_name} has no department`,
        is_resolved: false,
      },
      {
        $set: { is_resolved: true, resolved_at: new Date() },
      }
    );
  }

  // Auto-resolve RULE-17 (Users who now have locations)
  const usersWithLocs = activeUsers.filter((u) => Boolean(u.location_id));
  for (const user of usersWithLocs) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        affected_object_id: user._id.toString(),
        title: `${user.full_name} has no location assigned`,
        is_resolved: false,
      },
      {
        $set: { is_resolved: true, resolved_at: new Date() },
      }
    );
  }

  // Auto-resolve RULE-21 (Security Policy configured)
  if (securityPolicy && securityPolicy.settings) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        title: 'Missing company security policy configuration',
        is_resolved: false,
      },
      {
        $set: { is_resolved: true, resolved_at: new Date() },
      }
    );
  }

  // Auto-resolve RULE-18 (Default Location set or no users without location)
  if (hasDefaultLocation || usersWithoutLocationCount === 0) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        title: 'No default location configured',
        is_resolved: false,
      },
      {
        $set: { is_resolved: true, resolved_at: new Date() },
      }
    );
  }

  // Auto-resolve RULE-24 (Departments created)
  if (allDepts.length > 0) {
    await Insight.updateMany(
      {
        company_id: companyObjectId,
        title: 'Organization structure is empty',
        is_resolved: false,
      },
      {
        $set: { is_resolved: true, resolved_at: new Date() },
      }
    );
  }

  // Auto-resolve RULE-08 (Policy Conflicts resolved)
  const activeConflictTitles = new Set(
    insightsToUpsert
      .filter((i) => i.title?.startsWith('Conflicting policy targeting:'))
      .map((i) => i.title)
  );

  const existingPolicyConflictInsights = await Insight.find({
    company_id: companyObjectId,
    title: { $regex: /^Conflicting policy targeting:/ },
    is_resolved: false,
  }).lean();

  for (const insight of existingPolicyConflictInsights) {
    if (!activeConflictTitles.has(insight.title)) {
      await Insight.updateOne(
        { _id: insight._id },
        { $set: { is_resolved: true, resolved_at: new Date() } }
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Final Sync: Update is_flagged status on User model
  // ────────────────────────────────────────────────────────────────────────────
  const usersWithActiveInsights = await Insight.distinct('affected_object_id', {
    company_id: companyObjectId,
    affected_object_type: 'User',
    is_resolved: false,
  });

  await User.updateMany(
    { company_id: companyObjectId, _id: { $in: usersWithActiveInsights } },
    { $set: { is_flagged: true } }
  );

  await User.updateMany(
    { company_id: companyObjectId, _id: { $nin: usersWithActiveInsights } },
    { $set: { is_flagged: false } }
  );
};

/**
 * Runs intelligence and misconfiguration detection across ALL active companies in the system.
 * Designed for background automated jobs / scheduled execution.
 */
export const runIntelligenceRulesForAllCompanies = async (): Promise<void> => {
  try {
    const companies = await Company.find({ is_active: true }).select('_id name').lean();
    for (const comp of companies) {
      try {
        await runIntelligenceRules(comp._id);
      } catch (compErr) {
        console.error(`[IntelligenceEngine] Error running intelligence for company ${comp.name} (${comp._id}):`, compErr);
      }
    }
  } catch (err) {
    console.error('[IntelligenceEngine] Error fetching companies for background scan:', err);
  }
};
