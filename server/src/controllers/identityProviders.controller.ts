// server/src/controllers/identityProviders.controller.ts
import { Request, Response } from 'express';
import crypto from 'crypto';
import dns from 'dns';
import { asyncHandler } from '../utils/asyncHandler';
import { IdentityProviderConnection } from '../models/IdentityProviderConnection.model';
import { AppError } from '../utils/AppError';
import { auditLogger } from '../lib/auditLogger';

export type DnsTxtResolver = (domain: string) => Promise<string[][]>;
let dnsTxtResolver: DnsTxtResolver = dns.promises.resolveTxt;

export function setDnsTxtResolver(resolver: DnsTxtResolver): void {
  dnsTxtResolver = resolver;
}

export function resetDnsTxtResolver(): void {
  dnsTxtResolver = dns.promises.resolveTxt;
}

/**
 * GET /api/v1/security/identity-providers
 * List identity provider connections for the authenticated company.
 * Never exposes client_secret_ref or verification tokens of other orgs.
 */
export const getIdentityProviders = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const connections = await IdentityProviderConnection.find({ company_id: companyId })
    .select('-config.client_secret_ref')
    .sort({ created_at: -1 })
    .lean();

  res.status(200).json({ success: true, data: connections });
});

/**
 * POST /api/v1/security/identity-providers
 * Create an Entra identity provider connection in draft status.
 * Generates a 32-byte hex verification token per domain.
 */
export const createIdentityProvider = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const { display_name, tenant_id, domains } = req.body;

  if (!display_name || typeof display_name !== 'string' || !display_name.trim()) {
    throw new AppError('display_name is required', 400, 'VALIDATION_ERROR');
  }

  const rawDomains: string[] = Array.isArray(domains) ? domains : [];
  const normalizedDomains: string[] = Array.from(
    new Set(rawDomains.map(d => String(d).trim().toLowerCase()).filter(Boolean))
  );

  const domainObjects = normalizedDomains.map(d => ({
    domain: d,
    verification_token: crypto.randomBytes(32).toString('hex'),
  }));

  const connection = await IdentityProviderConnection.create({
    company_id: companyId,
    type: 'entra',
    display_name: display_name.trim(),
    status: 'draft',
    config: {
      tenant_id: tenant_id ? String(tenant_id).trim().toLowerCase() : undefined,
    },
    domains: domainObjects,
    jit_provisioning: 'off',
    enforce_sso: false,
  });

  await auditLogger.log({
    req,
    action: 'identity_provider.created',
    module: 'Security',
    category: 'Security',
    object_type: 'IdentityProviderConnection',
    object_id: connection._id.toString(),
    object_label: connection.display_name,
    before_state: null,
    after_state: connection.toObject(),
  });

  res.status(201).json({ success: true, data: connection });
});

/**
 * PATCH /api/v1/security/identity-providers/:id
 * Update display_name, jit_provisioning, enforce_sso, status.
 * status: 'active' requires >= 1 verified domain.
 */
export const updateIdentityProvider = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const connection = await IdentityProviderConnection.findOne({ _id: id, company_id: companyId });
  if (!connection) {
    throw new AppError('Identity provider connection not found', 404, 'NOT_FOUND');
  }

  const beforeState = connection.toObject();

  if (req.body.display_name !== undefined) {
    if (typeof req.body.display_name !== 'string' || !req.body.display_name.trim()) {
      throw new AppError('display_name must be a non-empty string', 400, 'VALIDATION_ERROR');
    }
    connection.display_name = req.body.display_name.trim();
  }

  if (req.body.jit_provisioning !== undefined) {
    if (!['off', 'create_member'].includes(req.body.jit_provisioning)) {
      throw new AppError('Invalid jit_provisioning value: must be off or create_member', 400, 'VALIDATION_ERROR');
    }
    connection.jit_provisioning = req.body.jit_provisioning;
  }

  if (req.body.enforce_sso !== undefined) {
    connection.enforce_sso = Boolean(req.body.enforce_sso);
  }

  if (Array.isArray(req.body.domains)) {
    const existingMap = new Map(connection.domains.map(d => [d.domain.toLowerCase(), d]));
    const updatedDomains: Array<{ domain: string; verification_token: string; verified_at?: Date }> = [];
    for (const d of req.body.domains) {
      const norm = String(d).trim().toLowerCase();
      if (!norm) continue;
      const existing = existingMap.get(norm);
      if (existing) {
        updatedDomains.push(existing);
      } else {
        updatedDomains.push({
          domain: norm,
          verification_token: crypto.randomBytes(32).toString('hex'),
        });
      }
    }
    connection.domains = updatedDomains;
  }

  if (req.body.status !== undefined) {
    if (!['draft', 'active', 'disabled'].includes(req.body.status)) {
      throw new AppError('Invalid status: must be draft, active, or disabled', 400, 'VALIDATION_ERROR');
    }

    if (req.body.status === 'active') {
      const hasVerifiedDomain = connection.domains.some(d => !!d.verified_at);
      if (!hasVerifiedDomain) {
        throw new AppError('Cannot activate identity provider: at least one verified domain is required', 400, 'NO_VERIFIED_DOMAINS');
      }
    }

    connection.status = req.body.status;
  }

  await connection.save();

  await auditLogger.log({
    req,
    action: 'identity_provider.updated',
    module: 'Security',
    category: 'Security',
    object_type: 'IdentityProviderConnection',
    object_id: connection._id.toString(),
    object_label: connection.display_name,
    before_state: beforeState,
    after_state: connection.toObject(),
  });

  res.status(200).json({ success: true, data: connection });
});

/**
 * POST /api/v1/security/identity-providers/:id/domains/:domain/verify
 * DNS TXT check: karbexa-verification=<token>
 * Domain verified by another org -> 409 DOMAIN_TAKEN
 * DNS TXT not found / mismatch -> 422 DNS_RECORD_NOT_FOUND
 */
export const verifyDomain = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user.company_id;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { domain } = req.params;

  const connection = await IdentityProviderConnection.findOne({ _id: id, company_id: companyId });
  if (!connection) {
    throw new AppError('Identity provider connection not found', 404, 'NOT_FOUND');
  }

  const domainParam = Array.isArray(domain) ? domain[0] : domain;
  const targetDomain = decodeURIComponent(domainParam || '').trim().toLowerCase();
  const domainEntry = connection.domains.find(d => d.domain.toLowerCase() === targetDomain);
  if (!domainEntry) {
    throw new AppError('Domain not found in this connection', 404, 'DOMAIN_NOT_FOUND');
  }

  // 03 §2: verified domain is unique platform-wide
  const otherVerified = await IdentityProviderConnection.findOne({
    _id: { $ne: connection._id },
    domains: {
      $elemMatch: {
        domain: targetDomain,
        verified_at: { $exists: true, $ne: null },
      },
    },
  });

  if (otherVerified) {
    throw new AppError('This domain is already verified by another organization', 409, 'DOMAIN_TAKEN');
  }

  let records: string[][];
  try {
    records = await dnsTxtResolver(targetDomain);
  } catch {
    throw new AppError('DNS TXT record not found for domain', 422, 'DNS_RECORD_NOT_FOUND');
  }

  const expectedRecord = `karbexa-verification=${domainEntry.verification_token}`;
  const matched = Array.isArray(records) && records.some(chunks => {
    const full = Array.isArray(chunks) ? chunks.join('').trim() : String(chunks).trim();
    return full === expectedRecord;
  });

  if (!matched) {
    throw new AppError('DNS TXT record karbexa-verification=<token> not found for domain', 422, 'DNS_RECORD_NOT_FOUND');
  }

  domainEntry.verified_at = new Date();
  await connection.save();

  await auditLogger.log({
    req,
    action: 'identity_provider.domain_verified',
    module: 'Security',
    category: 'Security',
    object_type: 'IdentityProviderConnection',
    object_id: connection._id.toString(),
    object_label: `${connection.display_name} (${targetDomain})`,
    before_state: { domain: targetDomain, verified: false },
    after_state: { domain: targetDomain, verified: true, verified_at: domainEntry.verified_at },
  });

  res.status(200).json({ success: true, data: connection });
});
