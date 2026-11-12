// server/src/lib/__tests__/seed-e11.test.ts — Unit & integration test for E11 Seeding Script
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types, Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'fs';
import path from 'path';
import os from 'os';
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
import bcrypt from 'bcryptjs';
import { OperatorAccount } from '../../models';
import { MongoClient } from 'mongodb';

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
    const dryRunOpts = parseArgs(['--dry-run', '--admin-uri', 'mongodb://localhost:27017/admin', '--report-dir', './test-reports']);
    assert.equal(dryRunOpts.dryRun, true);
    assert.equal(dryRunOpts.adminUri, 'mongodb://localhost:27017/admin');
    assert.equal(dryRunOpts.reportDir, './test-reports');

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

    // Upserts skip schema validation, so the seed must set every required field itself.
    const roleRows = await testAdminConn.db!.collection('productroles').find({}).toArray();
    assert.ok(roleRows.length > 0);
    for (const r of roleRows) assert.ok(r.app_id, `product role ${r.product_key}:${r.key} must carry app_id`);
    const adminDepts = await testAdminConn.db!.collection('departments').find({}).toArray();
    assert.ok(adminDepts.length > 0);
    for (const dpt of adminDepts) {
      assert.ok(dpt.slug, `department ${dpt.name} must carry a slug`);
      assert.equal(dpt.type, 'department');
    }

    const bob = users.find((u) => u.email === 'bob@karbexa.internal');
    assert.ok(bob);
    assert.equal(bob.role, ROLES.EMPLOYEE);
    assert.equal(bob.employment_type, 'contractor');
    assert.equal(bob.manager_id?.toString(), alice._id.toString());

    // Verify Monolith write-backs
    const testMonoConn = await mongoose.createConnection(monolithUri).asPromise();
    const monoUsers = await testMonoConn.db!.collection('users').find({}).toArray();
    for (const mu of monoUsers) {
      // The monolith schemas type these as String and query them with string claims (token orgId/memberId).
      assert.equal(typeof mu.platformMemberId, 'string', 'platformMemberId must be written back as a string');
      assert.equal(typeof mu.platformIdentityId, 'string', 'platformIdentityId must be written back as a string');
      assert.equal(mu.platformStatus, 'active');
    }
    const monoCompany = await testMonoConn.db!.collection('companies').findOne({});
    assert.equal(typeof monoCompany!.platformOrgId, 'string', 'platformOrgId must be a string');
    const monoDept = await testMonoConn.db!.collection('departments').findOne({});
    assert.equal(typeof monoDept!.platformDepartmentId, 'string', 'platformDepartmentId must be a string');
    // What the monolith isLoggedIn does with token claims must find the projected org.
    assert.ok(await testMonoConn.db!.collection('companies').findOne({ platformOrgId: String(monoCompany!.platformOrgId) }));

    // Verify Monolith MemberAccess projection (from Admin effective access, keyed by string member id)
    const accessRows = await testMonoConn.db!.collection('memberaccesses').find({}).toArray();
    assert.equal(accessRows.length, 2);
    const aliceMono = monoUsers.find((u) => u.email === 'alice@karbexa.internal');
    const aliceAccess = accessRows.find((r) => r.platformMemberId === aliceMono!.platformMemberId);
    assert.ok(aliceAccess, 'MemberAccess row is found by the string member id');
    assert.equal(aliceAccess.products.desk?.role, 'desk_admin');
    assert.equal(aliceAccess.products.sign?.role, 'sign_administrator');
    assert.equal(aliceAccess.authzVer, alice.authz_ver);

    // Consumer cursor starts at the org's seq recorded before S8 (11 §3 step 5)
    const syncRow = await testMonoConn.db!.collection('platformsyncstates').findOne({ platformOrgId: monoCompany!.platformOrgId });
    assert.ok(syncRow, 'PlatformSyncState row created for the org');
    assert.equal(syncRow.lastAppliedSeq, 0);
    assert.equal(String(syncRow.company), String(monoCompany!._id));

    // 11 §2: Verify S1–S7 write NO PlatformEvent rows to MongoDB
    const platformEventCount = await testAdminConn.db!.collection('platformevents').countDocuments();
    assert.equal(platformEventCount, 0, 'S1–S7 must write NO PlatformEvent to MongoDB (11 §2)');

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

  test('operator account: no built-in credentials, and a re-run never resets the password', async () => {
    const saved = { email: process.env.OPERATOR_SEED_EMAIL, password: process.env.OPERATOR_SEED_PASSWORD };
    const opCollection = OperatorAccount.collection.collectionName;
    const client = await new MongoClient(adminUri).connect(); // survives the script's mongoose.disconnect()
    const ops = client.db().collection(opCollection);
    try {
      // Without env credentials nothing is seeded (no fallback password).
      delete process.env.OPERATOR_SEED_EMAIL;
      delete process.env.OPERATOR_SEED_PASSWORD;
      await ops.deleteMany({});
      const skipped = await runE11Seed({ dryRun: false, adminUri, monolithUri, verbose: false });
      assert.equal(skipped.stats.operatorAccounts, 0);
      assert.equal(await ops.countDocuments(), 0);

      process.env.OPERATOR_SEED_EMAIL = 'Ops@Karbexa.Internal';
      process.env.OPERATOR_SEED_PASSWORD = 'first-password-123';
      await runE11Seed({ dryRun: false, adminUri, monolithUri, verbose: false });
      const created = await ops.findOne({ email: 'ops@karbexa.internal' });
      assert.ok(created, 'operator created from env credentials');
      assert.ok(await bcrypt.compare('first-password-123', created.password_hash));

      process.env.OPERATOR_SEED_PASSWORD = 'second-password-456';
      await runE11Seed({ dryRun: false, adminUri, monolithUri, verbose: false });
      const after = await ops.findOne({ email: 'ops@karbexa.internal' });
      assert.equal(after!.password_hash, created.password_hash, 're-run must not reset the operator password');

      process.env.OPERATOR_SEED_PASSWORD = 'short';
      await assert.rejects(runE11Seed({ dryRun: true, adminUri, monolithUri, verbose: false }), /at least 12 characters/);
    } finally {
      if (saved.email === undefined) delete process.env.OPERATOR_SEED_EMAIL; else process.env.OPERATOR_SEED_EMAIL = saved.email;
      if (saved.password === undefined) delete process.env.OPERATOR_SEED_PASSWORD; else process.env.OPERATOR_SEED_PASSWORD = saved.password;
      await client.close();
    }
  });

  test('A3-7: dry-run writes 4 JSON and 4 CSV report files to --report-dir', async () => {
    const reportDir = path.join(os.tmpdir(), `e11-test-reports-${Date.now()}`);
    try {
      const res = await runE11Seed({
        dryRun: true,
        adminUri,
        monolithUri,
        reportDir,
        verbose: false,
      });

      assert.equal(res.reportDir, reportDir);

      // Verify JSON reports
      assert.ok(fs.existsSync(path.join(reportDir, 'unmapped_users.json')));
      assert.ok(fs.existsSync(path.join(reportDir, 'duplicate_emails.json')));
      assert.ok(fs.existsSync(path.join(reportDir, 'role_mapping.json')));
      assert.ok(fs.existsSync(path.join(reportDir, 'capability_diff.json')));

      // Verify CSV reports
      assert.ok(fs.existsSync(path.join(reportDir, 'unmapped_users.csv')));
      assert.ok(fs.existsSync(path.join(reportDir, 'duplicate_emails.csv')));
      assert.ok(fs.existsSync(path.join(reportDir, 'role_mapping.csv')));
      assert.ok(fs.existsSync(path.join(reportDir, 'capability_diff.csv')));

      // Verify CSV header in capability_diff.csv
      const csvContent = fs.readFileSync(path.join(reportDir, 'capability_diff.csv'), 'utf8');
      assert.ok(csvContent.startsWith('email,fullName,monolithRole,monolithProjects,monolithSign,monolithDesk,seededOrgRole,seededPeople,seededProjects,seededSign,seededDesk,loss,lostCapabilities,diffNotes'));

      // Verify role mapping has S5 roles
      const roleMappingJson = JSON.parse(fs.readFileSync(path.join(reportDir, 'role_mapping.json'), 'utf8'));
      assert.equal(roleMappingJson.length, 7);
      assert.ok(roleMappingJson.some((r: any) => r.monolithRole === 'Super Admin' && r.primaryOrgRole === 'Super Admin'));
      assert.ok(roleMappingJson.some((r: any) => r.monolithRole === 'Admin' && r.primaryOrgRole === 'IT Admin'));
    } finally {
      fs.rmSync(reportDir, { recursive: true, force: true });
    }
  });

  test('A3-7: diff report flags legacy portal capability loss explicitly (loss: true)', async () => {
    // Insert a monolith user with legacy portal access (hasSignPortalAccess: true) whose role is 'none'
    const monoConn = await mongoose.createConnection(monolithUri).asPromise();
    const monoDb = monoConn.db!;
    const comp = await monoDb.collection('companies').findOne({});
    const lossUserId = new Types.ObjectId();

    await monoDb.collection('users').insertOne({
      _id: lossUserId,
      name: 'Charlie Loss',
      email: 'charlie-loss@karbexa.internal',
      company: comp!._id,
      companyRole: 'Employee',
      empStatus: 'Active',
      empType: 'Permanent',
      hasSignPortalAccess: true,
      signRole: 'none', // explicitly lost in normalization
    });

    try {
      const res = await runE11Seed({
        dryRun: true,
        adminUri,
        monolithUri,
        verbose: false,
      });

      const lossUserDiff = res.diffs.find((d) => d.email === 'charlie-loss@karbexa.internal');
      assert.ok(lossUserDiff, 'loss user must be in diff report');
      assert.equal(lossUserDiff.loss, true, 'loss must be flagged true');
      assert.deepEqual(lossUserDiff.lostCapabilities, ['sign']);
      assert.equal(lossUserDiff.diffNotes, 'Loss of legacy access: sign');

      // Verify capability_diff.json written to reportDir contains this loss
      const diffJson = JSON.parse(fs.readFileSync(path.join(res.reportDir, 'capability_diff.json'), 'utf8'));
      const recorded = diffJson.find((d: any) => d.email === 'charlie-loss@karbexa.internal');
      assert.ok(recorded);
      assert.equal(recorded.loss, true);
      assert.deepEqual(recorded.lostCapabilities, ['sign']);
    } finally {
      const cleanupConn = await mongoose.createConnection(monolithUri).asPromise();
      await cleanupConn.db!.collection('users').deleteOne({ _id: lossUserId });
      await cleanupConn.close();
    }
  });
});
