// server/src/lib/__tests__/seed-e11.test.ts — Unit & integration test for E11 Seeding Script
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types, Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  mapEmploymentType,
  mapLifecycleState,
  mapOrgRole,
  normalizeProjectRole,
  normalizeSignRole,
  normalizeDeskRole,
  parseArgs,
  runE11Seed,
} from '../../scripts/seed-e11';
import { ROLES } from '../../constants/roles';

describe('E11 Seeding Script — Unit & Normalization Tests', () => {
  test('mapEmploymentType maps legacy empType to canonical employment_type', () => {
    assert.equal(mapEmploymentType('Permanent'), 'full_time');
    assert.equal(mapEmploymentType('permanent'), 'full_time');
    assert.equal(mapEmploymentType('Part Time'), 'part_time');
    assert.equal(mapEmploymentType('part_time'), 'part_time');
    assert.equal(mapEmploymentType('Contractor'), 'contractor');
    assert.equal(mapEmploymentType('Intern'), 'intern');
    assert.equal(mapEmploymentType(null), 'full_time');
  });

  test('mapLifecycleState maps empStatus (Active|Inactive|Pending)', () => {
    assert.equal(mapLifecycleState('Active'), 'active');
    assert.equal(mapLifecycleState('active'), 'active');
    assert.equal(mapLifecycleState('Pending'), 'invited');
    assert.equal(mapLifecycleState('Inactive'), 'deactivated');
    assert.equal(mapLifecycleState(null), 'active');
  });

  test('mapOrgRole maps legacy company roles to Org roles (S5)', () => {
    assert.equal(mapOrgRole('Super Admin').primary, ROLES.SUPER_ADMIN);
    const adminRole = mapOrgRole('Admin');
    assert.equal(adminRole.primary, ROLES.IT_ADMIN);
    assert.equal(adminRole.additional, ROLES.HR_ADMIN);
    assert.equal(mapOrgRole('HR').primary, ROLES.HR_ADMIN);
    assert.equal(mapOrgRole('Manager').primary, ROLES.MANAGER);
    assert.equal(mapOrgRole('Employee').primary, ROLES.EMPLOYEE);
  });

  test('normalizeProjectRole preserves legacy access and maps roles', () => {
    assert.equal(normalizeProjectRole('project_administrator'), 'project_administrator');
    assert.equal(normalizeProjectRole('Project Admin'), 'project_administrator');
    assert.equal(normalizeProjectRole(null, 'Super Admin'), 'project_administrator');
    assert.equal(normalizeProjectRole(null, 'Manager'), 'project_manager');
    assert.equal(normalizeProjectRole('team_member'), 'team_member');
    assert.equal(normalizeProjectRole('read_only'), 'read_only');
  });

  test('normalizeSignRole preserves legacy access and maps roles', () => {
    assert.equal(normalizeSignRole('sign_administrator'), 'sign_administrator');
    assert.equal(normalizeSignRole(null, 'Super Admin'), 'sign_administrator');
    assert.equal(normalizeSignRole('sign_user'), 'sign_user');
    assert.equal(normalizeSignRole('read_only'), 'read_only');
  });

  test('normalizeDeskRole maps deskRole, isTechnician, and admin roles', () => {
    assert.equal(normalizeDeskRole(null, false, 'Super Admin'), 'desk_admin');
    assert.equal(normalizeDeskRole(null, true, 'Employee'), 'technician');
    assert.equal(normalizeDeskRole('support_lead'), 'support_lead');
    assert.equal(normalizeDeskRole('requester'), 'requester');
    assert.equal(normalizeDeskRole('read_only'), 'read_only');
  });

  test('parseArgs parses CLI flags correctly', () => {
    const dryRunOpts = parseArgs(['--dry-run', '--admin-uri', 'mongodb://localhost:27017/admin']);
    assert.equal(dryRunOpts.dryRun, true);
    assert.equal(dryRunOpts.adminUri, 'mongodb://localhost:27017/admin');

    const realOpts = parseArgs(['--real', '--monolith-uri', 'mongodb://localhost:27017/mono']);
    assert.equal(realOpts.dryRun, false);
    assert.equal(realOpts.monolithUri, 'mongodb://localhost:27017/mono');
  });
});

describe('E11 Seeding Script — In-Memory Database Execution', () => {
  let mongodAdmin: MongoMemoryServer;
  let mongodMonolith: MongoMemoryServer;
  let adminUri: string;
  let monolithUri: string;

  before(async () => {
    mongodAdmin = await MongoMemoryServer.create();
    mongodMonolith = await MongoMemoryServer.create();
    adminUri = mongodAdmin.getUri();
    monolithUri = mongodMonolith.getUri();

    // Populate mock monolith DB
    const monoConn = await mongoose.createConnection(monolithUri).asPromise();
    const monoDb = monoConn.db!;

    // 1. Company
    const compId = new Types.ObjectId();
    await monoDb.collection('companies').insertOne({
      _id: compId,
      companyName: 'Internal Organization Inc',
      branches: ['HQ Branch', 'Engineering Hub'],
      azureTenantId: '00000000-0000-0000-0000-000000000001',
      timezone: 'America/New_York',
      currency: 'USD',
    });

    // 2. Department
    const deptId = new Types.ObjectId();
    await monoDb.collection('departments').insertOne({
      _id: deptId,
      name: 'Core Platform Engineering',
      company: compId,
      isActive: true,
    });

    // 3. Users
    const u1Id = new Types.ObjectId();
    const u2Id = new Types.ObjectId();
    await monoDb.collection('users').insertMany([
      {
        _id: u1Id,
        name: 'Alice Admin',
        email: 'alice@karbexa.internal',
        company: compId,
        companyRole: 'Super Admin',
        empStatus: 'Active',
        empType: 'Permanent',
        branch: 'HQ Branch',
        department: deptId,
        azureId: 'entra-oid-alice',
        hasProjectPortalAccess: true,
        projectRole: 'project_administrator',
        hasSignPortalAccess: true,
        signRole: 'sign_administrator',
        hasDeskPortalAccess: true,
        deskRole: 'desk_admin',
      },
      {
        _id: u2Id,
        name: 'Bob Developer',
        email: 'bob@karbexa.internal',
        company: compId,
        companyRole: 'Employee',
        empStatus: 'Active',
        empType: 'Contractor',
        branch: 'Engineering Hub',
        department: deptId,
        reportsTo: u1Id,
        azureId: 'entra-oid-bob',
        hasProjectPortalAccess: true,
        projectRole: 'team_member',
        hasSignPortalAccess: false,
        hasDeskPortalAccess: true,
        deskRole: 'requester',
      },
    ]);

    // 4. Holidays
    await monoDb.collection('holidays').insertOne({
      holidayName: 'New Year Day',
      date: '2026-01-01',
      holidayType: 'National',
      isRecurring: true,
    });

    await monoConn.close();
  });

  after(async () => {
    await mongodAdmin.stop();
    await mongodMonolith.stop();
  });

  test('runE11Seed in --dry-run mode does not mutate DB and reports diffs', async () => {
    const result = await runE11Seed({
      dryRun: true,
      adminUri,
      monolithUri,
      verbose: false,
    });

    assert.equal(result.diffs.length, 2);
    assert.equal(result.unmapped.length, 0);
    assert.equal(result.stats.users, 2);
    assert.equal(result.stats.companies, 1);

    // Verify Admin DB is empty in dry-run
    const testAdminConn = await mongoose.createConnection(adminUri).asPromise();
    const adminUserCount = await testAdminConn.db!.collection('users').countDocuments();
    assert.equal(adminUserCount, 0, 'Dry-run must not write users to Admin DB');
    await testAdminConn.close();
  });

  test('runE11Seed in --real mode executes idempotent seeding and write-backs', async () => {
    const result = await runE11Seed({
      dryRun: false,
      adminUri,
      monolithUri,
      verbose: false,
    });

    assert.equal(result.stats.companies, 1);
    assert.equal(result.stats.users, 2);
    assert.equal(result.stats.identities, 2);
    assert.equal(result.stats.locations, 2);
    assert.equal(result.stats.departments, 1);
    assert.equal(result.stats.holidays, 1);
    assert.equal(result.stats.memberAccessProjected, 2);

    // Verify Admin DB has records
    const testAdminConn = await mongoose.createConnection(adminUri).asPromise();
    const users = await testAdminConn.db!.collection('users').find({}).toArray();
    assert.equal(users.length, 2);

    const alice = users.find((u) => u.email === 'alice@karbexa.internal');
    assert.ok(alice);
    assert.equal(alice.role, ROLES.SUPER_ADMIN);
    assert.equal(alice.employment_type, 'full_time');

    const bob = users.find((u) => u.email === 'bob@karbexa.internal');
    assert.ok(bob);
    assert.equal(bob.role, ROLES.EMPLOYEE);
    assert.equal(bob.employment_type, 'contractor');
    assert.equal(bob.manager_id?.toString(), alice._id.toString());

    // Verify Monolith write-backs
    const testMonoConn = await mongoose.createConnection(monolithUri).asPromise();
    const monoUsers = await testMonoConn.db!.collection('users').find({}).toArray();
    for (const mu of monoUsers) {
      assert.ok(mu.platformMemberId, 'platformMemberId must be written back');
      assert.ok(mu.platformIdentityId, 'platformIdentityId must be written back');
      assert.equal(mu.platformStatus, 'active');
    }

    // Verify Monolith MemberAccess projection
    const accessRows = await testMonoConn.db!.collection('memberaccesses').find({}).toArray();
    assert.equal(accessRows.length, 2);

    await testAdminConn.close();
    await testMonoConn.close();

    // Verify Idempotency: re-running does not fail
    const rerunResult = await runE11Seed({
      dryRun: false,
      adminUri,
      monolithUri,
      verbose: false,
    });
    assert.equal(rerunResult.stats.users, 2);
  });
});
