// server/src/routes/__tests__/routeOrder.test.ts
// Regression: a parameterised route registered before a static one (e.g. '/:id' before '/assignments')
// silently captures the static path. Asks each Express router which route wins for a request.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Router } from 'express';
import workSchedulesRoutes from '../workSchedules.routes';
import holidaysRoutes from '../holidays.routes';

/** Path of the first route in `router` that handles `method path` (Express matches in registration order). */
function winningRoute(router: Router, method: string, path: string): string | undefined {
  for (const layer of (router as any).stack) {
    if (!layer.route) continue; // middleware such as requireAuth
    if (layer.match(path) && layer.route.methods[method.toLowerCase()]) return layer.route.path;
  }
  return undefined;
}

test('GET /work-schedules/assignments reaches the assignments route, not /:id', () => {
  assert.equal(winningRoute(workSchedulesRoutes, 'GET', '/assignments'), '/assignments');
  assert.equal(winningRoute(workSchedulesRoutes, 'GET', '/65f0c0ffee0000000000abcd'), '/:id');
});

test('DELETE /holidays/assignments/bulk reaches the bulk route, not /assignments/:id', () => {
  assert.equal(winningRoute(holidaysRoutes, 'DELETE', '/assignments/bulk'), '/assignments/bulk');
  assert.equal(winningRoute(holidaysRoutes, 'DELETE', '/assignments/65f0c0ffee0000000000abcd'), '/assignments/:id');
});
