// server/src/controllers/__tests__/notBuiltFeatures.test.ts
// Code audit 2026-11-27: features that looked finished but did nothing now say so. Integration sync invented random
// results (production refuses with 501); unbuilt workflow actions were counted as successful (now skipped).
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncIntegration } from '../integrations.controller';
import { NOT_BUILT_ACTIONS } from '../../lib/workflowEngine';

test('integration sync answers 501 SYNC_NOT_AVAILABLE in production', async () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    let err: any;
    await (syncIntegration as any)({ params: { id: 'x' }, user: { company_id: 'c1' } }, {}, (e: unknown) => { err = e; });
    assert.equal(err?.statusCode, 501);
    assert.equal(err?.code, 'SYNC_NOT_AVAILABLE');
  } finally {
    process.env.NODE_ENV = saved;
  }
});

test('the unbuilt workflow actions are listed (recorded as skipped, not success)', () => {
  for (const a of ['assign_role', 'revoke_access', 'update_field', 'create_task', 'webhook']) assert.ok(NOT_BUILT_ACTIONS.has(a), a);
  assert.ok(!NOT_BUILT_ACTIONS.has('send_email'));
  assert.ok(!NOT_BUILT_ACTIONS.has('require_approval'));
});
