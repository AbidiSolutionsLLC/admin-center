// Plan 4.2: category, redaction, list filter and CSV encoding. Pure functions, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { buildAuditFilter, categoryOf, csvField, csvRow, redact } from '../audit';

test('categoryOf maps action prefixes; unknown is system', () => {
  assert.equal(categoryOf('org.suspended'), 'tenant');
  assert.equal(categoryOf('identity_provider.tenant_approved'), 'tenant');
  assert.equal(categoryOf('plan.updated'), 'plan');
  assert.equal(categoryOf('entitlement.updated'), 'entitlement');
  assert.equal(categoryOf('onboarding.invite_resent'), 'onboarding');
  assert.equal(categoryOf('operator.created'), 'operator');
  assert.equal(categoryOf('audit.exported'), 'security');
  assert.equal(categoryOf('something.else'), 'system');
});

test('redact hides secret-looking values, keeps booleans and ids', () => {
  const id = new Types.ObjectId();
  const out: any = redact({ password: 'x', password_changed: true, nested: { api_token: 'abc', keep: 1 }, list: [{ secret: 's' }], id });
  assert.equal(out.password, '[redacted]');
  assert.equal(out.password_changed, true);
  assert.equal(out.nested.api_token, '[redacted]');
  assert.equal(out.nested.keep, 1);
  assert.equal(out.list[0].secret, '[redacted]');
  assert.equal(out.id, id);
  assert.equal(redact(undefined), undefined);
});

test('buildAuditFilter: valid and invalid input', () => {
  const id = new Types.ObjectId().toString();
  const f: any = buildAuditFilter({ action: 'org.suspended', operator_id: id, category: 'tenant', from: '2026-11-01T00:00:00Z', to: '2026-11-30T00:00:00Z' });
  assert.equal(f.action, 'org.suspended');
  assert.equal(String(f.operator_id), id);
  assert.equal(f.category, 'tenant');
  assert.ok(f.created_at.$gte instanceof Date && f.created_at.$lte instanceof Date);
  assert.deepEqual(buildAuditFilter({}), {});
  assert.throws(() => buildAuditFilter({ category: 'nope' }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => buildAuditFilter({ operator_id: 'x' }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => buildAuditFilter({ from: 'not a date' }), { code: 'VALIDATION_ERROR' });
});

test('csvField quotes, doubles quotes, neutralises formulas', () => {
  assert.equal(csvField(null), '');
  assert.equal(csvField('a,"b"'), '"a,""b"""');
  assert.equal(csvField('=SUM(A1)'), `"'=SUM(A1)"`);
  assert.equal(csvField('@x'), `"'@x"`);
  assert.equal(csvField({ a: 1 }), '"{""a"":1}"');
  assert.equal(csvField(new Date('2026-11-16T00:00:00Z')), '"2026-11-16T00:00:00.000Z"');
  assert.equal(csvRow(['a', 'b']), '"a","b"\r\n');
});
