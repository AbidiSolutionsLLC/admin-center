import { Types } from 'mongoose';
import { SecurityPolicy } from '../models/SecurityPolicy.model';
import { UserRole } from '../models/UserRole.model';
import { GroupMember } from '../models/GroupMember.model';
import { IUser } from '../models/User.model';

export const getAggregatedSecurityPolicy = async (user: IUser) => {
  // Fetch all enabled policies for the company
  const allPolicies = await SecurityPolicy.find({ 
    company_id: user.company_id, 
    is_enabled: true 
  }).lean();

  if (!allPolicies.length) return null;

  // Find user's role and groups
  const userRoleAssignment = await UserRole.findOne({ user_id: user._id }).populate('role_id');
  const roleId = userRoleAssignment?.role_id ? (userRoleAssignment.role_id as any)._id.toString() : null;
  const groupMemberships = await GroupMember.find({ user_id: user._id }).lean();
  const groupIds = groupMemberships.map(g => g.group_id.toString());
  const deptId = user.department_id ? user.department_id.toString() : null;

  // Filter policies that apply to this user
  const applicablePolicies = allPolicies.filter(p => {
    if (p.target_type === 'all') return true;
    if (p.target_type === 'user' && p.target_id === user._id.toString()) return true;
    if (p.target_type === 'role' && roleId && p.target_id === roleId) return true;
    if (p.target_type === 'department' && deptId && p.target_id === deptId) return true;
    if (p.target_type === 'group' && groupIds.includes(p.target_id)) return true;
    return false;
  });

  if (!applicablePolicies.length) return null;

  // Aggregate settings (Most restrictive wins)
  const aggregatedSettings = applicablePolicies.reduce((acc, policy) => {
    const s = policy.settings;
    if (!s) return acc;
    
    // IP Whitelist / Blacklist: Merge all
    if (s.ip_whitelist_enabled) {
      acc.ip_whitelist_enabled = true;
      acc.ip_whitelist = [...(acc.ip_whitelist || []), ...(s.ip_whitelist || [])];
    }
    if (s.ip_blacklist_enabled) {
      acc.ip_blacklist_enabled = true;
      acc.ip_blacklist = [...(acc.ip_blacklist || []), ...(s.ip_blacklist || [])];
    }

    // MFA: True if any policy requires it
    if (s.require_mfa) acc.require_mfa = true;

    // Session / Login constraints (lower is more restrictive)
    if (s.max_failed_login_attempts) {
      acc.max_failed_login_attempts = Math.min(acc.max_failed_login_attempts || Infinity, s.max_failed_login_attempts);
    }
    if (s.session_timeout_minutes) {
      acc.session_timeout_minutes = Math.min(acc.session_timeout_minutes || Infinity, s.session_timeout_minutes);
    }
    if (s.max_concurrent_sessions) {
      acc.max_concurrent_sessions = Math.min(acc.max_concurrent_sessions || Infinity, s.max_concurrent_sessions);
    }

    // Lockout duration (higher is more restrictive)
    if (s.lockout_duration_minutes) {
      acc.lockout_duration_minutes = Math.max(acc.lockout_duration_minutes || 0, s.lockout_duration_minutes);
    }
    
    // Password Expiry (lower is more restrictive)
    if (s.password_expiry_days) {
      acc.password_expiry_days = Math.min(acc.password_expiry_days || Infinity, s.password_expiry_days);
    }

    return acc;
  }, {} as any);

  // Return formatted policy object
  return {
    settings: {
      ...applicablePolicies[0].settings, // Base settings
      ...aggregatedSettings // Overrides
    }
  };
};
