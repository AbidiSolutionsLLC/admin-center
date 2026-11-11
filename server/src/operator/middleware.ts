// server/src/operator/middleware.ts
// `requireOperator`: verifies an operator-realm access token locally (own issuer, audience, key set).
// A tenant token fails signature/issuer/audience checks and is rejected with 401 (09 §8.1).
import { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';
import { getPublicJwks } from '../identity/keys';
import { getIdentityConfig, OPERATOR_AUDIENCE } from '../identity/config';
import { isIpInRange } from '../utils/ipUtils';
import { asyncHandler } from '../utils/asyncHandler';
import { IOperatorAccount } from '../models/OperatorAccount.model';
import { findOperatorAccount } from './accounts';

declare global {
  namespace Express {
    interface Request {
      operator?: IOperatorAccount;
    }
  }
}

const INVALID = { success: false, error: 'Token invalid or expired', code: 'INVALID_TOKEN' };

let operatorJwks: ReturnType<typeof jose.createLocalJWKSet> | undefined;
const keySet = () => (operatorJwks ??= jose.createLocalJWKSet(getPublicJwks('operator')));

const FORBIDDEN = { success: false, error: 'Forbidden', code: 'FORBIDDEN' };

/**
 * OPERATOR_IP_ALLOWLIST (comma-separated IPs/CIDRs, read per request). Non-empty: only listed IPs pass.
 * Empty: allowed outside production; in production it fails closed (D-4) so the operator surface is never open by omission.
 */
function operatorIpAllowed(req: Request): boolean {
  const allow = (process.env.OPERATOR_IP_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allow.length === 0) return process.env.NODE_ENV !== 'production';
  return allow.some((r) => isIpInRange(req.ip || '', r));
}

/** IP allow-list gate; mounted in front of /realms/operator and applied again by requireOperator. */
export function requireOperatorIp(req: Request, res: Response, next: NextFunction) {
  if (!operatorIpAllowed(req)) return res.status(403).json(FORBIDDEN);
  next();
}

export const requireOperator = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (!operatorIpAllowed(req)) return res.status(403).json(FORBIDDEN);
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized', code: 'NO_TOKEN' });

  let claims: jose.JWTPayload;
  try {
    ({ payload: claims } = await jose.jwtVerify(token, keySet(), {
      issuer: getIdentityConfig().operatorIssuer,
      audience: OPERATOR_AUDIENCE,
      algorithms: ['RS256'],
      typ: 'at+jwt',
    }));
  } catch {
    return res.status(401).json(INVALID);
  }
  if (claims.token_use !== 'access' || typeof claims.sub !== 'string') return res.status(401).json(INVALID);

  const operator = await findOperatorAccount(claims.sub);
  if (!operator) return res.status(401).json(INVALID);
  req.operator = operator;
  next();
});
