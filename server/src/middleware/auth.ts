import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/tokenService';
import { asyncHandler } from '../utils/asyncHandler';
import { User, UserRole, SecurityPolicy, GroupMember, Company, IpRestriction } from '../models';
import { isIpInRange } from '../utils/ipUtils';
import { rbacCache } from '../lib/rbacCache';
import { getAggregatedSecurityPolicy } from '../utils/securityPolicyUtils';
import { rankOf } from '../lib/roleHierarchy';

export const requireAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: 'Token invalid or expired', code: 'INVALID_TOKEN' });
  }

  // WI-09: company_id in the token must match the user's company (forged/stale tokens rejected)
  const user = await User.findById(decoded.userId).select('lifecycle_state is_active company_id department_id');
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });
  }
  if (!decoded.company_id || user.company_id?.toString() !== decoded.company_id.toString()) {
    return res.status(401).json({ error: 'Token invalid or expired', code: 'INVALID_TOKEN' });
  }

  if (user.lifecycle_state === 'deactivated' || user.lifecycle_state === 'archived' || user.lifecycle_state === 'terminated' || user.is_active === false) {
    return res.status(403).json({ error: 'Your account is currently inactive. Please contact support if you believe this is an error.', code: 'FORBIDDEN' });
  }

  // Fetch actual user role dynamically with caching
  const userIdStr = decoded.userId;
  let userRole: any = rbacCache.getUserRole(userIdStr);
  let userRoleId: any = rbacCache.getUserRoleId(userIdStr);
  if (!userRole || userRoleId === undefined) {
    // WI-09: users may hold several roles — use the highest-ranked one (was an arbitrary findOne)
    const assignments = await UserRole.find({ user_id: decoded.userId, company_id: user.company_id }).populate('role_id');
    const roles = assignments.map(a => a.role_id as any).filter(Boolean);
    roles.sort((a: any, b: any) => rankOf({ name: b.name, type: b.type }) - rankOf({ name: a.name, type: a.type }));
    userRole = roles[0]?.name || 'Employee';
    userRoleId = roles[0]?._id?.toString() || null;
    rbacCache.setUserRole(userIdStr, userRole);
    rbacCache.setUserRoleId(userIdStr, userRoleId || '');
  }

  let userGroups = rbacCache.getUserGroups(userIdStr);
  if (!userGroups) {
    const memberships = await GroupMember.find({ user_id: decoded.userId });
    userGroups = memberships.map(m => m.group_id.toString());
    rbacCache.setUserGroups(userIdStr, userGroups);
  }

  let userDepartment = rbacCache.getUserDepartment(userIdStr);
  if (userDepartment === undefined) {
    userDepartment = user.department_id ? user.department_id.toString() : null;
    rbacCache.setUserDepartment(userIdStr, userDepartment);
  }

  // IP Restriction Check (Portal & Applications) - ABAC Engine
  const company = await Company.findById(decoded.company_id).select('settings.ip_restrictions_enabled');
  if (company?.settings?.ip_restrictions_enabled) {
    const clientIp = req.ip || '127.0.0.1';
    
    // Extract potential app ID from normalized URL to prevent path traversal bypasses
    const normalizedPath = req.baseUrl + req.path;
    const appMatch = normalizedPath.match(/\/apps\/([a-fA-F0-9]{24})/);
    const targetAppId = appMatch ? appMatch[1] : null;

    const targetTypes = targetAppId ? ['all_apps', 'app'] : ['portal'];
    const restrictionsQuery: any = { 
      company_id: decoded.company_id, 
      is_enabled: true,
      target_type: { $in: targetTypes }
    };

    const allRestrictionsForTarget = await IpRestriction.find(restrictionsQuery);

    if (allRestrictionsForTarget.length > 0) {
      // Filter out rules that don't match the target exactly
      const targetRestrictions = allRestrictionsForTarget.filter(r => {
        if (r.target_type === 'portal') return !targetAppId;
        if (r.target_type === 'all_apps') return !!targetAppId;
        if (r.target_type === 'app') return r.target_id?.toString() === targetAppId;
        return false;
      });

      if (targetRestrictions.length > 0) {
        // Filter by Subject (Applicability)
        const applicableRestrictions = targetRestrictions.filter(r => {
          if (r.subject_type === 'all_users') return true;
          if (!r.subject_id) return false; // Should not happen, but safeguard
          
          const sid = r.subject_id.toString();
          if (r.subject_type === 'user') return sid === userIdStr;
          if (r.subject_type === 'group') return userGroups?.includes(sid);
          if (r.subject_type === 'role') return sid === userRoleId;
          if (r.subject_type === 'department') return sid === userDepartment;
          return false;
        });

        // Decision Tree Condition B
        if (applicableRestrictions.length === 0) {
          const { auditLogger } = require('../lib/auditLogger');
          await auditLogger.log({
            req,
            action: 'access.denied',
            module: 'security',
            object_type: targetAppId ? 'App' : 'Portal',
            object_id: targetAppId || 'portal',
            object_label: targetAppId ? `App ${targetAppId}` : 'Admin Portal',
            actor_override: { userId: decoded.userId, email: decoded.email || 'unknown', company_id: decoded.company_id },
            after_state: { reason: 'No applicable IP restrictions found for the user (Implicit Deny).' }
          });
          return res.status(403).json({ error: 'Access denied. You are not authorized by any IP restriction rule.', code: 'FORBIDDEN' });
        }

        // Decision Tree Condition C
        const isAllowed = applicableRestrictions.some(rule => isIpInRange(clientIp, rule.ip_address));
        
        const { auditLogger } = require('../lib/auditLogger');
        await auditLogger.log({
          req,
          action: isAllowed ? 'access.allowed' : 'access.denied',
          module: 'security',
          object_type: targetAppId ? 'App' : 'Portal',
          object_id: targetAppId || 'portal',
          object_label: targetAppId ? `App ${targetAppId}` : 'Admin Portal',
          actor_override: {
            userId: decoded.userId,
            email: decoded.email || 'unknown',
            company_id: decoded.company_id
          }
        });

        if (!isAllowed) {
          return res.status(403).json({ error: 'Access denied from this IP address based on Company IP Restrictions', code: 'FORBIDDEN' });
        }
      }
    }
  }

  // Legacy SecurityPolicy IP Restriction Check
  const policy = await getAggregatedSecurityPolicy(user);
  if (policy) {
    const clientIp = req.ip || '127.0.0.1';
    
    if (policy.settings.ip_whitelist_enabled && policy.settings.ip_whitelist && policy.settings.ip_whitelist.length > 0) {
      const isWhitelisted = policy.settings.ip_whitelist.some((range: string) => isIpInRange(clientIp, range));
      
      const { auditLogger } = require('../lib/auditLogger');
      await auditLogger.log({
        req,
        action: isWhitelisted ? 'access.allowed' : 'access.denied',
        module: 'security',
        object_type: 'LegacyPolicy',
        object_id: (policy as any)._id?.toString() || 'legacy-policy',
        object_label: 'Legacy IP Whitelist',
        actor_override: { userId: decoded.userId, email: decoded.email, company_id: decoded.company_id }
      });

      if (!isWhitelisted) {
        return res.status(403).json({ error: 'Access denied from this IP address', code: 'FORBIDDEN' });
      }
    }
    
    if (policy.settings.ip_blacklist_enabled && policy.settings.ip_blacklist && policy.settings.ip_blacklist.length > 0) {
      const isBlacklisted = policy.settings.ip_blacklist.some((range: string) => isIpInRange(clientIp, range));
      
      if (isBlacklisted) {
        const { auditLogger } = require('../lib/auditLogger');
        await auditLogger.log({
          req,
          action: 'access.denied',
          module: 'security',
          object_type: 'LegacyPolicy',
          object_id: (policy as any)._id?.toString() || 'legacy-policy',
          object_label: 'Legacy IP Blacklist',
          actor_override: { userId: decoded.userId, email: decoded.email, company_id: decoded.company_id }
        });
        return res.status(403).json({ error: 'Access denied from this IP address', code: 'FORBIDDEN' });
      }
    }
  }

  req.user = {
    ...decoded,
    user_role: userRole, // Override static claim with fresh database/cache role
  };
  next();
});
