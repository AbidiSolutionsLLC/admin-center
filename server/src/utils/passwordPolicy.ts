import bcrypt from 'bcryptjs';
import { ROLES } from '../constants/roles';

export const validatePasswordAgainstPolicy = async (
  password: string,
  policySettings: any,
  user: any
): Promise<{ isValid: boolean; error?: string }> => {
  // Stricter controls: Admin users must follow stricter password rules
  const adminRoles = [ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.IT_ADMIN, ROLES.OPS_ADMIN, ROLES.ADMIN];
  const isAdmin = user && adminRoles.includes(user.role);

  const effectiveSettings = policySettings ? { ...policySettings } : {};
  
  if (isAdmin) {
    effectiveSettings.password_min_length = Math.max(12, effectiveSettings.password_min_length || 12);
    effectiveSettings.password_require_uppercase = true;
    effectiveSettings.password_require_lowercase = true;
    effectiveSettings.password_require_numbers = true;
    effectiveSettings.password_require_special_chars = true;
    effectiveSettings.password_history_count = Math.max(5, effectiveSettings.password_history_count || 5);
  }

  if (!effectiveSettings || Object.keys(effectiveSettings).length === 0) return { isValid: true };

  // 1. Length
  if (effectiveSettings.password_min_length && password.length < effectiveSettings.password_min_length) {
    return { isValid: false, error: `Password must be at least ${effectiveSettings.password_min_length} characters long.` };
  }

  // 2. Complexity
  if (effectiveSettings.password_require_uppercase && !/[A-Z]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one uppercase letter.' };
  }
  if (effectiveSettings.password_require_lowercase && !/[a-z]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one lowercase letter.' };
  }
  if (effectiveSettings.password_require_numbers && !/\d/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one number.' };
  }
  if (effectiveSettings.password_require_special_chars && !/[^A-Za-z0-9]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one special character.' };
  }

  // 3. History (Reuse Prevention)
  if (user && effectiveSettings.password_history_count > 0) {
    const hashesToCheck = [user.password_hash, ...(user.previous_password_hashes || [])].filter(Boolean);
    const hashesToCompare = hashesToCheck.slice(0, effectiveSettings.password_history_count);

    for (const hash of hashesToCompare) {
      const isMatch = await bcrypt.compare(password, hash);
      if (isMatch) {
        return { isValid: false, error: `Password cannot be the same as any of your last ${effectiveSettings.password_history_count} passwords.` };
      }
    }
  }

  return { isValid: true };
};
