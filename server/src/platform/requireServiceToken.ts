// server/src/platform/requireServiceToken.ts — services-realm RS256 service tokens (03 §3, 05 §2)
import { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';
import { getPublicJwks } from '../identity/keys';
import { getIdentityConfig, getClientAllowedProducts, PLATFORM_API_AUDIENCE, PRODUCTS_BACKEND_CLIENT_ID } from '../identity/config';

const JWKS_TTL_MS = 5 * 60 * 1000;
let servicesJwks: { set: ReturnType<typeof jose.createLocalJWKSet>; at: number } | undefined;
// Re-created every 5 minutes so key rotation is picked up without a restart.
const servicesKeySet = () => {
  if (!servicesJwks || Date.now() - servicesJwks.at > JWKS_TTL_MS) servicesJwks = { set: jose.createLocalJWKSet(getPublicJwks('services')), at: Date.now() };
  return servicesJwks.set;
};

/** Defence in depth: the services realm only issues tokens to known clients; reject anything else (e.g. after a client is removed). */
const isRegisteredClient = (clientId: string): boolean =>
  clientId === PRODUCTS_BACKEND_CLIENT_ID || getClientAllowedProducts(clientId).length > 0;

export interface ServiceClaims { client_id: string; scopes: string[] }

/** True when the calling service client may act on productKey (allow-list read per request). */
export const serviceMayAccessProduct = (req: Request, productKey: string): boolean =>
  !!req.service && getClientAllowedProducts(req.service.client_id).includes(productKey);

declare module 'express-serve-static-core' {
  interface Request { service?: ServiceClaims }
}

const invalidToken = (res: Response) => res.status(401).json({ error: 'Token invalid or expired', code: 'INVALID_TOKEN' });

/**
 * Router-level authentication: verifies the services-realm token (signature, issuer, audience, age, token_use,
 * registered client) and sets req.service. Scope checks stay per route (requireServiceToken). Needed before the
 * per-client rate limit so the limit key is the authenticated client_id.
 */
export async function authenticateService(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });
  let claims: jose.JWTPayload;
  try {
    ({ payload: claims } = await jose.jwtVerify(token, servicesKeySet(), {
      issuer: getIdentityConfig().servicesIssuer,
      audience: PLATFORM_API_AUDIENCE,
      algorithms: ['RS256'],
      maxTokenAge: '15m',
      requiredClaims: ['exp', 'iat'],
    }));
  } catch {
    return invalidToken(res);
  }
  if (claims.token_use !== 'service') return invalidToken(res);
  const clientId = String(claims.client_id ?? claims.sub ?? '');
  if (!isRegisteredClient(clientId)) return invalidToken(res);
  const scopes = typeof claims.scope === 'string' ? claims.scope.split(' ') : [];
  req.service = { client_id: clientId, scopes };
  next();
}

/** Per-route scope gate. Authenticates itself when no router-level authenticateService ran before it. */
export function requireServiceToken(scope: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const check = () => {
      if (!req.service!.scopes.includes(scope)) return res.status(403).json({ error: 'Insufficient scope', code: 'INSUFFICIENT_SCOPE' });
      next();
    };
    if (req.service) return check();
    return authenticateService(req, res, () => check());
  };
}
