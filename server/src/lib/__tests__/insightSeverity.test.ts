// Plan 0.7e: severities written by intelligence.ts and workflowEngine.ts must match their schemas.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notificationSeverityFor } from '../intelligence';
import { Insight } from '../../models/Insight.model';
import { InAppNotification } from '../../models/InAppNotification.model';

const INSIGHT_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
const notificationEnum = (): string[] => (InAppNotification.schema.path('severity') as unknown as { enumValues: string[] }).enumValues;

test('every Insight severity maps to a value the notification schema accepts', () => {
  for (const s of INSIGHT_SEVERITIES) assert.ok(notificationEnum().includes(notificationSeverityFor(s)), s);
  assert.deepEqual(INSIGHT_SEVERITIES.map(notificationSeverityFor), ['critical', 'warning', 'warning', 'info']);
});

test('the workflow-rejected insight (severity medium) validates against the Insight schema; "warning" does not', () => {
  const base = { company_id: new (require('mongoose').Types.ObjectId)(), category: 'health', title: 't', description: 'd' };
  assert.equal(new Insight({ ...base, severity: 'medium' }).validateSync()?.errors?.severity, undefined);
  assert.ok(new Insight({ ...base, severity: 'warning' }).validateSync()?.errors?.severity);
});
