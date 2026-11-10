// server/src/identity/index.ts
// Embedded identity service (E1): tenant + services realms on the Admin Express server.
import type { Express } from 'express';
import { assertRequireModule, getIdentityConfig } from './config';
import { initProviders, getTenantProvider, getServicesProvider } from './providers';
import { registerTenantInteractions } from './interactions';

/** Keys, adapter indexes and providers. Call after connectDB and before mountIdentity. */
export async function initIdentity(): Promise<void> {
  assertRequireModule();
  getIdentityConfig();
  await initProviders();
}

/**
 * Mount `/realms/*`. Must run BEFORE cors/helmet/body parsers: the provider parses its own bodies
 * and sets its own CORS; our interaction routes are registered before the provider callback.
 */
export function mountIdentity(app: Express): void {
  const tenant = getTenantProvider();
  registerTenantInteractions(app, tenant);
  app.use('/realms/tenant', tenant.callback());
  app.use('/realms/services', getServicesProvider().callback());
}
