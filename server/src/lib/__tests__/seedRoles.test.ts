// Organisation create seeds permissions and system roles. Regression (Zyntrus walk 2026-11-25): it sent one database
// request per permission and per grant (about 600), which took ~50 s against a remote database. Now batched.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { seedPermissions, seedSystemRoles } from '../seed';
import { Permission } from '../../models/Permission.model';
import { Role } from '../../models/Role.model';
import { RolePermission } from '../../models/RolePermission.model';
import { ROLES } from '../../constants/roles';

let rs: MongoMemoryReplSet;
const writes: string[] = [];
before(async () => {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(rs.getUri(), { dbName: 'seed_roles', monitorCommands: true });
  mongoose.connection.getClient().on('commandStarted', (e: any) => {
    if (['update', 'insert'].includes(e.commandName)) writes.push(`${e.commandName}:${e.command[e.commandName]}`);
  });
  await Promise.all([Permission.init(), Role.init(), RolePermission.init()]);
});
after(async () => { await mongoose.disconnect(); await rs.stop(); });

const grants = async (companyId: Types.ObjectId, roleName: string) => {
  const role = await Role.findOne({ company_id: companyId, name: roleName }).lean();
  const rows = await RolePermission.find({ role_id: role!._id, granted: true }).populate('permission_id').lean();
  return rows.map((r: any) => `${r.permission_id.module}:${r.permission_id.action}:${r.permission_id.data_scope}`).sort();
};

test('permissions and role grants are written in a handful of requests, inside the transaction, and stay idempotent', async () => {
  writes.length = 0;
  await seedPermissions();
  assert.equal(await Permission.countDocuments(), 13 * 5 * 3);
  assert.ok(writes.filter((w) => w.endsWith(':permissions')).length <= 2, `permission writes: ${writes.length}`);

  const companyId = new Types.ObjectId();
  writes.length = 0;
  const session = await mongoose.startSession();
  await session.withTransaction(() => seedSystemRoles(companyId, session));
  await session.endSession();
  const grantWrites = writes.filter((w) => w.endsWith(':rolepermissions')).length;
  assert.ok(grantWrites <= 2, `role permission writes: ${grantWrites}`);

  // Same grants as before the batching: super admin everything, employee its own short list.
  assert.equal((await grants(companyId, ROLES.SUPER_ADMIN)).length, 13 * 5 * 3);
  assert.deepEqual(await grants(companyId, ROLES.EMPLOYEE), [
    'apps:read:own', 'insights:read:own', 'organization:read:all', 'people:read:own', 'people:update:own', 'policies:read:all',
  ]);
  const before = await RolePermission.countDocuments({ company_id: companyId });

  // A second run changes nothing.
  await seedPermissions();
  await seedSystemRoles(companyId);
  assert.equal(await Permission.countDocuments(), 13 * 5 * 3);
  assert.equal(await RolePermission.countDocuments({ company_id: companyId }), before);
});
