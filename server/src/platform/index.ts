// server/src/platform/index.ts — Platform API (05 §2), mounted at /platform/v1
import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Company } from '../models/Company.model';
import { User } from '../models/User.model';
import { platformReadRouter } from './readApi';
import { OrganizationEntitlement } from '../models/OrganizationEntitlement.model';
import { computeEffectiveAccess } from '../lib/effectiveAccess';
import { requireServiceToken, authenticateService } from './requireServiceToken';
import { listLaunchers } from '../lib/standalonePortals';
import { platformAuthFailureLimiter, platformRateLimiter } from './rateLimit';

export const platformRouter = Router();

platformRouter.use((req: Request, res: Response, next: NextFunction) => {
  const cid = req.headers['x-correlation-id'];
  if (typeof cid === 'string' && cid) res.setHeader('X-Correlation-Id', cid);
  next();
});

// M4: authenticate once at router level, then rate-limit per service client (the global per-IP limiter skips /platform/v1).
platformRouter.use(platformAuthFailureLimiter, authenticateService, platformRateLimiter);

platformRouter.use(platformReadRouter);

const notFound = (res: Response) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });

platformRouter.get('/orgs/:orgId', requireServiceToken('platform.org.read'), async (req, res, next) => {
  try {
    const orgId = req.params.orgId as string;
    if (!Types.ObjectId.isValid(orgId)) return notFound(res);
    const company: any = await Company.findById(orgId).lean();
    if (!company) return notFound(res);
    const ents = await OrganizationEntitlement.find({ company_id: company._id }).lean();
    res.json({
      id: company._id,
      slug: company.slug,
      name: company.name,
      status: company.status ?? 'active',
      settings: company.settings ?? {},
      branding: company.branding ?? {},
      entitlements: ents.map(e => ({ product_key: e.product_key, status: e.status })),
    });
  } catch (err) { next(err); }
});

// W2-LAUNCH: standalone portals the organisation holds an active entitlement to (launcher tiles; no secrets).
platformRouter.get('/orgs/:orgId/launchers', requireServiceToken('platform.org.read'), async (req, res, next) => {
  try {
    const orgId = req.params.orgId as string;
    if (!Types.ObjectId.isValid(orgId)) return notFound(res);
    if (!(await Company.exists({ _id: orgId }))) return notFound(res);
    res.setHeader('Cache-Control', 'no-store');
    res.json(await listLaunchers(orgId));
  } catch (err) { next(err); }
});

platformRouter.get('/orgs/:orgId/members/:memberId/effective-access', requireServiceToken('platform.access.read'), async (req, res, next) => {
  try {
    const { orgId, memberId } = req.params as Record<string, string>;
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(memberId)) return notFound(res);
    if (!(await User.exists({ _id: memberId, company_id: orgId }))) return notFound(res);
    const access = await computeEffectiveAccess(orgId, memberId);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      member_id: access.member_id,
      authz_ver: access.authz_ver,
      products: Object.fromEntries(Object.entries(access.products).map(([k, v]) => [k, { role: v.role }])),
    });
  } catch (err) { next(err); }
});
