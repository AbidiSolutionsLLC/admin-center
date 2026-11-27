// Tests for scripts/tenant-scope-gate.cjs (roadmap 2.2). Pure functions only: no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const gate = require(path.resolve(__dirname, '../../../scripts/tenant-scope-gate.cjs'));

const models = new Set(['User', 'Group', 'Company']);

test('flags findById and _id-only filters on tenant models', () => {
  const src = [
    'const u = await User.findById(req.params.id);',
    'await Group.updateOne({ _id: id }, { $set: { name } });',
    'const g = await Group.findOne({\n  _id: id,\n});',
  ].join('\n');
  const hits = gate.findUnscoped(src, models);
  assert.deepEqual(hits.map((h: { model: string; method: string; line: number }) => `${h.line}:${h.model}.${h.method}`), [
    '1:User.findById', '2:Group.updateOne', '3:Group.findOne',
  ]);
});

test('passes calls whose arguments mention company_id, across lines', () => {
  const src = [
    'await User.findOne({ _id: id, company_id: req.user.company_id });',
    'await Group.find({\n  company_id: companyId,\n  status: "active",\n});',
    'await Company.findById(req.user.company_id).lean();',
    'await User.updateOne({ _id: id, company_id: cid }, { $set: { note: "a ) paren" } });',
  ].join('\n');
  assert.equal(gate.findUnscoped(src, models).length, 0);
});

test('a filter variable declared just above with company_id counts as scoped; one without it does not', () => {
  const scoped = [
    'export const list = async (req: any) => {',
    '  const filter: UserFilter = {',
    '    company_id: req.user.company_id,',
    '    is_active: true,',
    '  };',
    '  if (req.query.q) filter.name = req.query.q;',
    '  const rows = await User.find(filter).lean();',
    '  const n = await User.countDocuments(filter as never);',
    '};',
  ].join('\n');
  assert.equal(gate.findUnscoped(scoped, models).length, 0);

  const unscoped = [
    '  const filter: any = {',
    '    _id: req.params.id,',
    '  };',
    '  const user = await User.findOne(filter);',
  ].join('\n');
  assert.equal(gate.findUnscoped(unscoped, models).length, 1);

  // An undeclared variable (parameter, import) is not trusted.
  assert.equal(gate.findUnscoped('async function f(q: any) { return User.find(q); }', models).length, 1);
});

test('tenant-scope-ok on the line or the line above exempts a call', () => {
  const src = [
    '// tenant-scope-ok: id comes from a group loaded with company_id above',
    'const owner = await User.findById(group.owner_id);',
    'const app = await User.findById(x); // tenant-scope-ok: seeded platform user',
  ].join('\n');
  assert.equal(gate.findUnscoped(src, models).length, 0);
});

test('ignores models that are not tenant models', () => {
  assert.equal(gate.findUnscoped('await Identity.findById(id); await Plan.findOne({ key });', models).length, 0);
});

test('compare: more calls than the baseline fail, fewer are reported as reducible', () => {
  const current = { 'src/a.ts': [{}, {}], 'src/new.ts': [{}], 'src/b.ts': [{}] };
  const baseline = { 'src/a.ts': 1, 'src/b.ts': 3 };
  const { added, reduced } = gate.compare(current, baseline);
  assert.deepEqual(added.map((a: { file: string }) => a.file).sort(), ['src/a.ts', 'src/new.ts']);
  assert.deepEqual(reduced, ['src/b.ts']);
});

test('tenantModels reads company_id from the real model files', () => {
  const names: Set<string> = gate.tenantModels();
  for (const m of ['User', 'Group', 'Role', 'Company']) assert.ok(names.has(m), m);
  for (const m of ['Identity', 'Plan', 'OperatorAccount']) assert.ok(!names.has(m), m);
});
