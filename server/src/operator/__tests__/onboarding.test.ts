// Plan 2.6: the stage of a first-admin invitation. Pure function, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onboardingStage } from '../onboarding';

const now = new Date('2026-11-16T12:00:00Z');
const inv = (state: string, hoursFromNow = 24) => ({ state, expires_at: new Date(now.getTime() + hoursFromNow * 3600e3) }) as any;
const admin = (lifecycle_state = 'invited') => ({ lifecycle_state }) as any;

test('no first admin, no invitation', () => {
  assert.equal(onboardingStage(null, null, null, now), 'no_first_admin');
  assert.equal(onboardingStage(admin(), null, null, now), 'no_invitation');
});

test('an accepted invitation or an active admin is complete', () => {
  assert.equal(onboardingStage(admin('active'), inv('pending'), null, now), 'complete');
  assert.equal(onboardingStage(admin(), inv('accepted'), null, now), 'complete');
});

test('pending invitation: sending, failed delivery, or awaiting acceptance', () => {
  assert.equal(onboardingStage(admin(), inv('pending'), { status: 'queued' }, now), 'sending');
  assert.equal(onboardingStage(admin(), inv('pending'), { status: 'sending' }, now), 'sending');
  assert.equal(onboardingStage(admin(), inv('pending'), { status: 'failed' }, now), 'delivery_failed');
  assert.equal(onboardingStage(admin(), inv('pending'), { status: 'sent' }, now), 'awaiting_acceptance');
  assert.equal(onboardingStage(admin(), inv('pending'), null, now), 'awaiting_acceptance');
});

test('expired (derived from the date) and revoked', () => {
  assert.equal(onboardingStage(admin(), inv('pending', -1), { status: 'sent' }, now), 'expired');
  assert.equal(onboardingStage(admin(), inv('revoked'), null, now), 'revoked');
});
