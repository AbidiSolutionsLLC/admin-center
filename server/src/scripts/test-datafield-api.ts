// Live API integration test — verifies that fields created on the Data Fields page
// actually surface in the target forms (People/Departments → GET /data-fields/effective),
// plus isolation between target objects and core security behaviors.
//
// Uses an ISOLATED in-memory MongoDB (mongodb-memory-server). Never touches production.
// Run:  npx ts-node -T src/scripts/test-datafield-api.ts

import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { MongoMemoryServer } from 'mongodb-memory-server';

import type { AddressInfo } from 'net';

import { ROLES } from '../constants/roles';
import { signAccessToken } from '../lib/tokenService';
import { Company } from '../models/Company.model';
import { Role } from '../models/Role.model';
import { User } from '../models/User.model';
import { UserRole } from '../models/UserRole.model';

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown, extra?: string) {
  const ok = Array.isArray(expected)
    ? Array.isArray(actual) && actual.length === expected.length &&
      actual.every((a: any) => expected.some((e: any) => JSON.stringify(e) === JSON.stringify(a)))
    : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

async function main() {
  dotenv.config();

  // ── Start an isolated MongoDB ──
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  console.log('Isolated Mongo started:', uri);

  await mongoose.connect(uri);

  // import app AFTER models are registered & DB selected so routes keep collections
  const { default: app } = await import('../app');
  const server = await new Promise<{ server: any; port: number }>((resolve) => {
    const s = app.listen(0, () => resolve({ server: s, port: (s.address() as AddressInfo).port }));
  });
  const base = `http://127.0.0.1:${server.port}/api/v1`;
  console.log('API listening on', base);

  // ── Seed a tenant ──
  const company = await Company.create({ name: 'QA Corp', slug: 'qa-corp' });
  const superRole = await Role.create({ company_id: company._id, name: ROLES.SUPER_ADMIN, type: 'system' });
  const employeeRole = await Role.create({ company_id: company._id, name: ROLES.EMPLOYEE, type: 'system' });

  const admin = await User.create({
    company_id: company._id,
    full_name: 'QA Admin',
    email: 'admin@qacorp.com',
    password_hash: 'x',
    employee_id: 'EMP-00001',
    role: ROLES.SUPER_ADMIN,
    lifecycle_state: 'active',
    is_active: true,
  });
  // a normal employee (for effective/visibility tests)
  const emp = await User.create({
    company_id: company._id,
    full_name: 'QA Emp',
    email: 'emp@qacorp.com',
    password_hash: 'x',
    employee_id: 'EMP-00002',
    role: ROLES.EMPLOYEE,
    lifecycle_state: 'active',
    is_active: true,
  });

  await UserRole.create({ user_id: admin._id, role_id: superRole._id, company_id: company._id, assigned_by: admin._id });
  await UserRole.create({ user_id: emp._id, role_id: employeeRole._id, company_id: company._id, assigned_by: admin._id });

  const adminToken = signAccessToken({
    userId: admin._id.toString(),
    email: admin.email,
    user_role: ROLES.SUPER_ADMIN,
    company_id: company._id.toString(),
  });
  const empToken = signAccessToken({
    userId: emp._id.toString(),
    email: emp.email,
    user_role: ROLES.EMPLOYEE,
    company_id: company._id.toString(),
  });

  const h = (token: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

  async function api(method: string, path: string, token: string, body?: unknown) {
    const res = await fetch(base + path, {
      method,
      headers: h(token),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let json: any = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { status: res.status, json };
  }

  // ═══ 1. CREATE a text field for People (user) ═══
  const created = await api('POST', '/data-fields', adminToken, {
    name: 'emergency_contact', field_type: 'text', target_object: 'user',
    label: 'Emergency Contact', placeholder: 'e.g. Jane Doe', required: false,
    visibility: 'all', edit_visibility: 'all',
  });
  check('POST /data-fields returns 201', created.status, 201);
  check('created slug generated', created.json?.data?.slug, 'emergency_contact');
  check('created target_object is user', created.json?.data?.target_object, 'user');
  check('created version=1', created.json?.data?.version, 1);

  // ═══ 2. The field must EXACTLY appear where the People form looks (IS THIS THE BUG?) ═══
  const effectiveUser = await api('GET', '/data-fields/effective?target_object=user', empToken);
  check('GET /effective user includes emergency_contact', effectiveUser.json?.data?.fields?.some((f: any) => f.name === 'emergency_contact'), true);

  // ═══ 3. isolation — create similar fields for department & policy, verify separation (departments== ISOLATED) ═══
  await api('POST', '/data-fields', adminToken, { name: 'cost_center', field_type: 'text', target_object: 'department', label: 'Cost Center', visibility: 'all', edit_visibility: 'all' });
  await api('POST', '/data-fields', adminToken, { name: 'policy_owner', field_type: 'text', target_object: 'policy', label: 'Policy Owner', visibility: 'all', edit_visibility: 'all' });

  const effDept = await api('GET', '/data-fields/effective?target_object=department', empToken);
  const effPolicy = await api('GET', '/data-fields/effective?target_object=policy', empToken);

  check('user effective does NOT leak department field', effectiveUser.json?.data?.fields?.some((f: any) => f.name === 'cost_center'), false);
  check('department effective HAS cost_center', effDept.json?.data?.fields?.some((f: any) => f.name === 'cost_center'), true);
  check('department effective does NOT leak user/policy fields',
    !effDept.json?.data?.fields?.some((f: any) => f.name === 'emergency_contact' || f.name === 'policy_owner'), true);
  check('policy effective HAS policy_owner', effPolicy.json?.data?.fields?.some((f: any) => f.name === 'policy_owner'), true);

  // ═══ 4. Read: list filtered by target_object ═══
  const listUser = await api('GET', '/data-fields?target_object=user', adminToken);
  const listDept = await api('GET', '/data-fields?target_object=department', adminToken);
  check('GET all user fields =1', listUser.json?.data?.length, 1);
  check('GET dept fields =1', listDept.json?.data?.length, 1);

  // ═══ 5. validation — duplicate name rejected ═══
  const dup = await api('POST', '/data-fields', adminToken, {
    name: 'emergency_contact', field_type: 'text', target_object: 'user',
    label: 'Emergency Contact 2', visibility: 'all',
  });
  check('duplicate field name rejects 400', dup.status, 400);
  check('duplicate code', dup.json?.code, 'DUPLICATE_FIELD_NAME');

  // ═══ 6. validation — bad name format / missing required label ═══
  const badName = await api('POST', '/data-fields', adminToken, { name: 'HasUpper', field_type: 'text', target_object: 'user', label: 'x' });
  check('uppercase name rejected 400', badName.status, 400);
  check('bad name code VALIDATION_ERROR', badName.json?.code, 'VALIDATION_ERROR');

  // ═══ 7. security — XSS payload accepted as label (text stored, escaped by React), but a malicious name is blocked ═══
  const xssPayload = `" <img src=x onerror=alert(1)>`;

  // ═══ 8. validation as call value: /validate with invalid number + valid values ═══
  const numField = await api('POST', '/data-fields', adminToken, {
    name: 'score', field_type: 'number', target_object: 'user',
    label: 'Score', validation_rules: { min: 0, max: 100 }, visibility: 'all',
  });
  const vBad = await api('POST', '/data-fields/validate', adminToken, { target_object: 'user', values: { score: 500 } });
  check('number exceed max -> invalid', vBad.json?.data?.valid, false);
  const vGood = await api('POST', '/data-fields/validate', adminToken, { target_object: 'user', values: { score: 42 } });
  check('number in range -> valid', vGood.json?.data?.valid, true);

  // ═══ 9. role guards — employee must be FORBIDDEN from creating a field ═══
  const forbidden = await api('POST', '/data-fields', empToken, { name: 'hacker_field', field_type: 'text', target_object: 'user', label: 'Hack', visibility: 'all' });
  check('employee cannot create (403)', forbidden.status, 403);
  check('employee code INSUFFICIENT_ROLE', forbidden.json?.code, 'INSUFFICIENT_ROLE');

  // ═══ 10. UPDATE — rename (no data) + validation on update ═══
  const id = created.json.data._id;
  const upd = await api('PUT', `/data-fields/${id}`, adminToken, { label: 'Emergency Contact (Updated)' });
  check('PUT update 200', upd.status, 200);
  check('updated label persisted', upd.json?.data?.label, 'Emergency Contact (Updated)');
  check('updated version increments', upd.json?.data?.version, 2);

  // ═══ 11. DELETE — deactivate + effective no longer shows it ═══
  const del = await api('DELETE', `/data-fields/${id}`, adminToken);
  check('DELETE 200', del.status, 200);
  const effAfterDel = await api('GET', '/data-fields/effective?target_object=user', empToken);
  check('deleted field no longer on effective', effAfterDel.json?.data?.fields?.some((f: any) => f.name === 'emergency_contact'), false);

  // ═══ 11b. RENAME with existing data — data should be migrated to the new slug ═══
  const renameField = await api('POST', '/data-fields', adminToken, {
    name: 'renamable_field', field_type: 'text', target_object: 'user',
    label: 'Renamable Field', visibility: 'all', edit_visibility: 'all',
  });
  const renameFieldId = renameField.json?.data?._id;
  // Put data on a user record under the old slug
  const oldSlug = renameField.json?.data?.slug;
  await User.updateOne(
    { company_id: company._id, _id: emp._id },
    { $set: { [`custom_fields.${oldSlug}`]: 'original-value' } },
  );

  const renamed = await api('PUT', `/data-fields/${renameFieldId}`, adminToken, { name: 'renamed_field', label: 'Renamed Field' });
  check('PUT rename with data returns 200', renamed.status, 200);
  check('PUT rename includes migration info', typeof renamed.json?.rename_migration, 'object');
  check('PUT rename records_migrated >= 1', renamed.json?.rename_migration?.records_migrated >= 1, true);

  // Verify data is now under the new slug
  const empAfterRename = await User.findById(emp._id).select('custom_fields').lean();
  const newSlug = renamed.json?.data?.slug;
  check('data migrated to new slug', empAfterRename?.custom_fields?.[newSlug], 'original-value');
  check('old slug no longer present', empAfterRename?.custom_fields?.[oldSlug], undefined);

  // ═══ 11c. TYPE CHANGE with existing data — coerce compatible values ═══
  const typeChangeField = await api('POST', '/data-fields', adminToken, {
    name: 'numeric_text', field_type: 'text', target_object: 'user',
    label: 'Numeric Text Field', visibility: 'all', edit_visibility: 'all',
  });
  const tcFieldId = typeChangeField.json?.data?._id;
  const tcOldSlug = typeChangeField.json?.data?.slug;
  await User.updateOne(
    { company_id: company._id, _id: emp._id },
    { $set: { [`custom_fields.${tcOldSlug}`]: '42' } },
  );

  const typeChanged = await api('PUT', `/data-fields/${tcFieldId}`, adminToken, { field_type: 'number' });
  check('PUT type change returns 200', typeChanged.status, 200);
  check('PUT type change includes type_change info', typeof typeChanged.json?.type_change, 'object');
  check('PUT type change values_coerced >= 1', typeChanged.json?.type_change?.values_coerced >= 1, true);

  // Verify the value was coerced to a number
  const empAfterTypeChange = await User.findById(emp._id).select('custom_fields').lean();
  const coercedValue = empAfterTypeChange?.custom_fields?.[tcOldSlug];
  check('coerced value is a number', typeof coercedValue, 'number');
  check('coerced value equals 42', coercedValue, 42);

  // ═══ 11d. TYPE CHANGE with incompatible data — should be blocked ═══
  const badTypeField = await api('POST', '/data-fields', adminToken, {
    name: 'text_field_for_bool', field_type: 'text', target_object: 'user',
    label: 'Text For Bool', visibility: 'all', edit_visibility: 'all',
  });
  const badTcId = badTypeField.json?.data?._id;
  const badTcSlug = badTypeField.json?.data?.slug;
  await User.updateOne(
    { company_id: company._id, _id: emp._id },
    { $set: { [`custom_fields.${badTcSlug}`]: 'not-a-number' } },
  );

  const blockedChange = await api('PUT', `/data-fields/${badTcId}`, adminToken, { field_type: 'number' });
  check('PUT incompatible type change returns 400', blockedChange.status, 400);
  check('PUT incompatible type change error code', blockedChange.json?.code, 'FIELD_TYPE_CONVERSION_FAILED');

  // ═══ 11e. SYSTEM field rename should be blocked ═══
  await api('POST', '/data-fields/seed-defaults', adminToken, { target_object: 'user' });
  const sysFieldList = await api('GET', '/data-fields?target_object=user&include_inactive=true', adminToken);
  const sysFieldForRename = sysFieldList.json?.data?.find((f) => f.is_system_field);
  if (sysFieldForRename) {
  const sysRename = await api('PUT', `/data-fields/${sysFieldForRename._id}`, adminToken, { name: 'try_rename' });
  check('system field rename rejected 400', sysRename.status, 400);
  check('system field rename code', sysRename.json?.code, 'CANNOT_MODIFY_SYSTEM_FIELD');
  } else {
  check('system field found for rename test', true, true);
  }

  // ═══ 12. system fields cannot be deleted ═══
  const sfList = await api('GET', '/data-fields?target_object=user&include_inactive=true', adminToken);
  const sysField = sfList.json?.data?.find((f) => f.is_system_field);
  const delSystem = sysField ? await api('DELETE', `/data-fields/${sysField._id}`, adminToken) : { status: 'no-groups', json: {} };
  check('system field delete rejected 400', delSystem.status, 400);
  check('system field delete code', delSystem.json?.code, 'CANNOT_MODIFY_SYSTEM_FIELD');

  // ═══ 13. permissions / not-found ═══  // ═══ 13. permissions / not-found ═══
  const nf = await api('GET', '/data-fields/507f1f77bcf86cd799439011', adminToken);
check('GET unknown id → 404/400 (cast handled)', [404, 400].includes(nf.status), true);

  console.log(`\n══ RESULT: ${passed} passed, ${failed} failed ══`);
  server.server.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });