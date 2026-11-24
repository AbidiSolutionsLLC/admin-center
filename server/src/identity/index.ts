// server/src/identity/index.ts
// Embedded identity service (E1): tenant + services realms on the Admin Express server.
import type { Express } from 'express';
import { assertRequireModule, getIdentityConfig } from './config';
import { initProviders, getTenantProvider, getServicesProvider, getOperatorProvider } from './providers';
import { registerOperatorInteractions } from '../operator/interactions';
import { registerTenantInteractions } from './interactions';
import { registerAccountRoutes } from './account';
import { listStandaloneApps } from '../lib/standalonePortals';

/** Keys, adapter indexes and providers. Call after connectDB and before mountIdentity. */
export async function initIdentity(): Promise<void> {
  assertRequireModule();
  getIdentityConfig();
  await initProviders();
  // The hosted pages' form-action list needs the standalone portals' origins before the first page is rendered, and
  // follows registry changes made on other instances (the registry cache is 10 s, so this is a cheap, bounded poll).
  await listStandaloneApps().catch((e) => console.error('[identity] standalone registry not loaded', e));
  setInterval(() => { void listStandaloneApps().catch(() => undefined); }, 10_000).unref();
}

/**
 * Mount `/realms/*`. Must run BEFORE cors/helmet/body parsers: the provider parses its own bodies
 * and sets its own CORS; our interaction routes are registered before the provider callback.
 */
export function mountIdentity(app: Express): void {
  const tenant = getTenantProvider();
  registerTenantInteractions(app, tenant);
  registerAccountRoutes(app, tenant);
  const operator = getOperatorProvider();
  registerOperatorInteractions(app, operator);
  app.use('/realms/tenant', tenant.callback());
  app.use('/realms/operator', operator.callback());
  app.use('/realms/services', getServicesProvider().callback());
}
