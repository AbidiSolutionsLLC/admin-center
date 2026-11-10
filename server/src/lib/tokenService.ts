// server/src/lib/tokenService.ts
// E2: the HS256 access/refresh/MFA token helpers were retired — Admin API tokens are RS256 JWTs
// issued by the tenant realm (src/identity) and verified in middleware/auth.ts. Only the request
// principal type remains.
import { ROLES } from '../constants/roles';

export type UserRole = typeof ROLES[keyof typeof ROLES];

export interface AdminClaim {
  userId: string; // token `sub` (membership User._id)
  email: string;
  user_role: UserRole;
  company_id: string; // token `org`
  sid: string; // Session._id
  identity_id: string; // token `idn`
}
