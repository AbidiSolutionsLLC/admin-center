import { AdminClaim } from '../lib/tokenService';

declare global {
  namespace Express {
    interface Request {
      user: AdminClaim;
    }
  }
}
