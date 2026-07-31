import { Types } from 'mongoose';
import { DataGovernancePolicy } from '../models/DataGovernancePolicy.model';
import { UserRole } from '../models/UserRole.model';
import { AdminClaim } from './tokenService';

type DataItem = Record<string, any>;

/**
 * Mask a string value based on pattern.
 * If pattern is not provided, defaults to showing only last 4 characters.
 */
const maskValue = (val: string, type: 'mask' | 'encrypt' | 'hide', pattern?: string): any => {
  if (type === 'hide') return undefined;
  if (type === 'encrypt') return '***ENCRYPTED***';
  
  if (!val || typeof val !== 'string') return val;
  
  // Custom mask pattern like "***-**-####"
  if (pattern && pattern.includes('#')) {
    let masked = '';
    let valIdx = 0;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === '#') {
        masked += val[valIdx] ?? '';
      } else {
        masked += pattern[i];
      }
      valIdx++;
    }
    return masked;
  }
  
  // Default partial mask: show last 4 chars
  if (val.length > 4) {
    return '*'.repeat(val.length - 4) + val.slice(-4);
  }
  return '*'.repeat(val.length);
};

const getProp = (obj: any, path: string): any => {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

const setProp = (obj: any, path: string, value: any) => {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  if (value === undefined) {
    delete current[parts[parts.length - 1]];
  } else {
    current[parts[parts.length - 1]] = value;
  }
};

/**
 * Gets the roles assigned to a user.
 */
const getUserRoles = async (userId: string, companyId: string): Promise<string[]> => {
  const userRoles = await UserRole.find({ user_id: userId, company_id }).lean();
  return userRoles.map(ur => ur.role_id.toString());
};

/**
 * Applies data governance policies to read operations.
 * Masks or hides fields the user is not authorized to see.
 */
export const applyDataGovernanceRead = async (
  user: AdminClaim,
  resourceName: string,
  data: DataItem | DataItem[]
): Promise<any> => {
  if (!data) return data;
  
  const companyId = user.company_id;
  const isArray = Array.isArray(data);
  const items: DataItem[] = isArray ? data : [data];

  if (items.length === 0) return data;

  const policies = await DataGovernancePolicy.find({ 
    company_id: companyId, 
    resource: resourceName,
    is_active: true
  }).lean();

  if (policies.length === 0) return data;

  const userRoleIds = await getUserRoles(user.userId, companyId);
  const isSuperAdmin = user.user_role === 'super_admin';

  for (const item of items) {
    for (const policy of policies) {
      const targetRoles = policy.applied_to?.roles?.map(r => r.toString()) || [];
      
      let isAuthorized = false;
      
      if (isSuperAdmin) {
        isAuthorized = true;
      } else if (targetRoles.length === 0) {
        isAuthorized = false; // Restrict if no roles explicitly allowed
      } else {
        isAuthorized = userRoleIds.some(roleId => targetRoles.includes(roleId));
      }

      if (isAuthorized) continue; 

      for (const rule of policy.rules) {
        if (policy.granularity === 'column' && rule.fields) {
          for (const field of rule.fields) {
            const val = getProp(item, field);
            if (val !== undefined) {
              setProp(item, field, maskValue(val, rule.action, rule.mask_pattern));
            }
          }
        }
      }
    }
  }

  return isArray ? items : items[0];
};

/**
 * Applies data governance policies to write operations.
 * Strips out any fields the user is not authorized to edit so they are ignored.
 */
export const applyDataGovernanceWrite = async (
  user: AdminClaim,
  resourceName: string,
  data: DataItem
): Promise<DataItem> => {
  if (!data) return data;

  const companyId = user.company_id;
  const policies = await DataGovernancePolicy.find({ 
    company_id: companyId, 
    resource: resourceName,
    is_active: true
  }).lean();

  if (policies.length === 0) return data;

  const userRoleIds = await getUserRoles(user.userId, companyId);
  const isSuperAdmin = user.user_role === 'super_admin';

  for (const policy of policies) {
    const targetRoles = policy.applied_to?.roles?.map(r => r.toString()) || [];
    let isAuthorized = false;
    
    if (isSuperAdmin) {
      isAuthorized = true;
    } else if (targetRoles.length === 0) {
      isAuthorized = false;
    } else {
      isAuthorized = userRoleIds.some(roleId => targetRoles.includes(roleId));
    }

    if (isAuthorized) continue;

    for (const rule of policy.rules) {
      if (policy.granularity === 'column' && rule.fields) {
        for (const field of rule.fields) {
          setProp(data, field, undefined);
        }
      }
    }
  }

  return data;
};
