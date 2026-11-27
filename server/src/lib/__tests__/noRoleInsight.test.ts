// server/src/lib/__tests__/noRoleInsight.test.ts
// Owner decision B-6 (2026-11-27): "X has no role assigned" is low, not critical. An Admin Center role only opens Karbexa
// Admin pages; most employees never need one. Open rows raised as critical before the change are lowered on the next scan.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runIntelligenceRules } from '../intelligence';
import { User } from '../../models/User.model';
import { Insight } from '../../models/Insight.model';
import { Company } from '../../models/Company.model';

let mongo: MongoMemoryServer;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'no_role_insight' });
});
after(async () => { await mongoose.disconnect(); await mongo.stop(); });

async function orgWithEmployee(sensitivity?: string) {
  const companyId = new Types.ObjectId();
  await Company.collection.insertOne({
    _id: companyId, name: 'Acme', slug: `acme-${companyId}`, status: 'active', is_active: true,
    ...(sensitivity ? { settings: { insight_sensitivity: sensitivity } } : {}),
  });
  const user = await User.collection.insertOne({
    company_id: companyId, email: `e-${companyId}@x.test`, full_name: 'Plain Employee', employee_id: `E-${companyId}`,
    role: 'Employee', lifecycle_state: 'active', is_active: true,
  });
  return { companyId, userId: user.insertedId };
}

test('default sensitivity: an employee without an Admin role raises no critical insight; an old critical row is lowered', async () => {
  const { companyId, userId } = await orgWithEmployee();
  await Insight.collection.insertOne({
    company_id: companyId, category: 'health', severity: 'critical', affected_area: 'Identity',
    title: 'Plain Employee has no role assigned', description: 'old', affected_object_type: 'User',
    affected_object_id: userId.toString(), is_resolved: false, is_dismissed: false, detected_at: new Date(),
  });
  await runIntelligenceRules(companyId);
  const rows = await Insight.find({ company_id: companyId, title: /has no role assigned$/ }).lean();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].severity, 'low');
});

test('high sensitivity: the insight is raised, as low', async () => {
  const { companyId } = await orgWithEmployee('high');
  await runIntelligenceRules(companyId);
  const rows = await Insight.find({ company_id: companyId, title: /has no role assigned$/ }).lean();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].severity, 'low');
});
