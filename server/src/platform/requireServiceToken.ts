// server/src/platform/requireServiceToken.ts — services-realm RS256 service tokens (03 §3, 05 §2)
import { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';
import { getPublicJwks } from '../identity/keys';
import { getIdentityConfig, PLATFORM_API_AUDIENCE } from '../identity/config';

let servicesJwks: ReturnType<typeof jose.createLocalJWKSet> | undefined;
const servicesKeySet = () => (servicesJwks ??= jose.createLocalJWKSet(getPublicJwks('services')));

export interface ServiceClaims { client_id: string; scopes: string[] }

declare module 'express-serve-static-core' {
  interface Request { service?: ServiceClaims }
}

export function requireServiceToken(scope: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });
    let claims: jose.JWTPayload;
    try {
      ({ payload: claims } = await jose.jwtVerify(token, servicesKeySet(), {
        issuer: getIdentityConfig().servicesIssuer,
        audience: PLATFORM_API_AUDIENCE,
        algorithms: ['RS256'],
      }));
    } catch {
      return res.status(401).json({ error: 'Token invalid or expired', code: 'INVALID_TOKEN' });
    }
    if (claims.token_use !== 'service') {
      return res.status(401).json({ error: 'Token invalid or expired', code: 'INVALID_TOKEN' });
    }
    const scopes = typeof claims.scope === 'string' ? claims.scope.split(' ') : [];
    if (!scopes.includes(scope)) {
      return res.status(403).json({ error: 'Insufficient scope', code: 'INSUFFICIENT_SCOPE' });
    }
    req.service = { client_id: String(claims.client_id ?? claims.sub ?? ''), scopes };
    next();
  };
}
