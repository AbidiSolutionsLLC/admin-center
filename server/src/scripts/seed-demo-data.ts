/**
 * seed-demo-data.ts
 * Seeds realistic demo data for the April 30 stakeholder demo.
 *
 * Creates:
 *   - 1 Business Unit: "Abidi Solutions"
 *   - 3 Departments: Engineering, People & Culture, Finance
 *   - 7 demo users with varied lifecycle states and roles
 *   - 1 department with NO manager → triggers RULE-02 on Intelligence Panel
 *   - 1 active user with NO role assigned → triggers RULE-01
 *
 * Run from server directory:
 *   npx ts-node src/scripts/seed-demo-data.ts
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { Company, User, Department, Role, UserRole, Location, PolicyVersion, PolicyAssignment } from '../models';
import { ROLES } from '../constants/roles';

const DEMO_PASSWORD = 'Demo@12345';
const POLICY_CONTENT = '<h2>Policy Overview</h2><p>This policy outlines the guidelines and expectations for all employees. Please read carefully and acknowledge.</p><h3>Scope</h3><p>This policy applies to all employees, contractors, and temporary staff.</p><h3>Compliance</h3><p>Failure to comply may result in disciplinary action.</p>';

async function seedDemoData() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI not defined in .env');

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, { dbName: process.env.DB_NAME ?? 'admin_center' });
    console.log('✅ Connected.');

    // ── 1. Find company ──────────────────────────────────────────────────────
    const company = await Company.findOne({ slug: 'abidi-solutions-llc' });
    if (!company) {
      throw new Error('Company "Abidi Solutions LLC" not found. Run seed-first-user.ts first.');
    }
    const companyId = company._id as mongoose.Types.ObjectId;
    console.log(`📦 Company: ${company.name} (${companyId})`);

    // ── 2. Find roles seeded by seedDatabase() ───────────────────────────────
    const hrAdminRole = await Role.findOne({ company_id: companyId, name: ROLES.HR_ADMIN });
    const managerRole = await Role.findOne({ company_id: companyId, name: ROLES.MANAGER });
    const employeeRole = await Role.findOne({ company_id: companyId, name: ROLES.EMPLOYEE });

    if (!hrAdminRole || !managerRole || !employeeRole) {
      console.warn('⚠️  Some roles not found — will skip role assignments for missing roles.');
    }

    // ── 3. Create Business Unit ──────────────────────────────────────────────
    let buAbidi = await Department.findOne({ company_id: companyId, slug: 'abidi-solutions', is_active: true });
    if (!buAbidi) {
      buAbidi = await Department.create({
        company_id: companyId,
        name: 'Abidi Solutions',
        slug: 'abidi-solutions',
        type: 'business_unit',
        is_active: true,
      });
      console.log('🏢 Created Business Unit: Abidi Solutions');
    } else {
      console.log('🏢 Business Unit already exists: Abidi Solutions');
    }

    // ── 4. Create Departments ────────────────────────────────────────────────
    const deptDefs = [
      { name: 'Engineering', slug: 'engineering', withManager: true },
      { name: 'People & Culture', slug: 'people-culture', withManager: true },
      { name: 'Finance', slug: 'finance', withManager: false }, // ← no manager → triggers RULE-02
    ];

    const deptMap: Record<string, mongoose.Document> = {};
    for (const def of deptDefs) {
      let dept = await Department.findOne({ company_id: companyId, slug: def.slug, is_active: true });
      if (!dept) {
        dept = await Department.create({
          company_id: companyId,
          name: def.name,
          slug: def.slug,
          type: 'department',
          parent_id: buAbidi._id,
          is_active: true,
        });
        console.log(`📁 Created department: ${def.name}`);
      } else {
        console.log(`📁 Department already exists: ${def.name}`);
      }
      deptMap[def.slug] = dept;
    }

    const engineeringDept = deptMap['engineering'];
    const peopleDept = deptMap['people-culture'];
    const financeDept = deptMap['finance'];

    // ── 5. Create Locations ──────────────────────────────────────────────────
    const locationMap: Record<string, mongoose.Document> = {};
    const locationDefs = [
      { name: 'North America', type: 'region' as const, parent: null, tz: 'America/New_York', hq: false },
      { name: 'United States', type: 'country' as const, parent: 'North America', tz: 'America/New_York', hq: false },
      { name: 'Canada', type: 'country' as const, parent: 'North America', tz: 'America/Toronto', hq: false },
      { name: 'New York', type: 'city' as const, parent: 'United States', tz: 'America/New_York', hq: false },
      { name: 'San Francisco', type: 'city' as const, parent: 'United States', tz: 'America/Los_Angeles', hq: false },
      { name: 'Toronto', type: 'city' as const, parent: 'Canada', tz: 'America/Toronto', hq: false },
      { name: 'HQ Office', type: 'office' as const, parent: 'New York', tz: 'America/New_York', hq: true },
      { name: 'West Coast Office', type: 'office' as const, parent: 'San Francisco', tz: 'America/Los_Angeles', hq: false },
      { name: 'Canada HQ', type: 'office' as const, parent: 'Toronto', tz: 'America/Toronto', hq: false },
    ];

    for (const def of locationDefs) {
      let loc = await Location.findOne({ company_id: companyId, name: def.name, is_deleted: { $ne: true } });
      if (!loc) {
        const parentId = def.parent ? locationMap[def.parent]?._id : undefined;
        loc = await Location.create({
          company_id: companyId,
          name: def.name,
          type: def.type,
          parent_id: parentId || undefined,
          timezone: def.tz,
          is_headquarters: def.hq,
          working_hours: def.type === 'office' ? { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] } : undefined,
        });
        console.log(`📍 Created location: ${def.name} (${def.type})`);
      } else {
        console.log(`📍 Location already exists: ${def.name}`);
      }
      locationMap[def.name] = loc;
    }

    const hqOffice = locationMap['HQ Office'];
    const westCoastOffice = locationMap['West Coast Office'];
    const canadaHQ = locationMap['Canada HQ'];
    const newYork = locationMap['New York'];

    // ── 6. Create Published Policies ─────────────────────────────────────────
    const policyDefs = [
      { key: 'remote-work-policy', title: 'Remote Work Policy', category: 'hr' as const, summary: 'Guidelines for remote and hybrid work arrangements' },
      { key: 'code-of-conduct', title: 'Code of Conduct', category: 'hr' as const, summary: 'Standards of professional behavior and ethics' },
      { key: 'data-security-policy', title: 'Data Security Policy', category: 'security' as const, summary: 'Data protection and cybersecurity requirements' },
      { key: 'it-acceptable-use', title: 'IT Acceptable Use Policy', category: 'it' as const, summary: 'Proper use of company technology resources' },
      { key: 'leave-policy', title: 'Leave Policy', category: 'operations' as const, summary: 'Vacation, sick leave, and time-off guidelines' },
    ];

    const policyMap: Record<string, mongoose.Document> = {};

    for (const def of policyDefs) {
      let policy = await PolicyVersion.findOne({ company_id: companyId, policy_key: def.key, status: 'published' });
      if (!policy) {
        policy = await PolicyVersion.create({
          company_id: companyId,
          policy_key: def.key,
          title: def.title,
          content: POLICY_CONTENT,
          version_number: 1,
          status: 'published',
          category: def.category,
          effective_date: new Date(),
          is_active: true,
          published_at: new Date(),
          summary: def.summary,
        });
        console.log(`📋 Created published policy: ${def.title}`);
      } else {
        console.log(`📋 Policy already exists: ${def.title}`);
      }
      policyMap[def.key] = policy;
    }

    // ── 7. Assign global policies (target_type: 'all') ───────────────────────
    const globalPolicyKeys = ['code-of-conduct', 'data-security-policy'];
    for (const key of globalPolicyKeys) {
      const policy = policyMap[key] as any;
      if (!policy) continue;
      const exists = await PolicyAssignment.findOne({
        company_id: companyId,
        policy_version_id: policy._id,
        target_type: 'all',
      });
      if (!exists) {
        await PolicyAssignment.create({
          company_id: companyId,
          policy_version_id: policy._id,
          target_type: 'all',
          target_id: 'all',
          target_label: 'All Users',
        });
        console.log(`🌐 Assigned global policy: ${policy.title}`);
      }
    }

    // Assign location-specific policies
    const hqPolicyKeys = ['remote-work-policy', 'leave-policy'];
    for (const key of hqPolicyKeys) {
      const policy = policyMap[key] as any;
      if (!policy) continue;
      const exists = await PolicyAssignment.findOne({
        company_id: companyId,
        policy_version_id: policy._id,
        target_type: 'location',
        target_id: hqOffice._id.toString(),
      });
      if (!exists) {
        await PolicyAssignment.create({
          company_id: companyId,
          policy_version_id: policy._id,
          target_type: 'location',
          target_id: hqOffice._id.toString(),
          target_label: hqOffice.get('name'),
        });
        console.log(`🏢 Assigned policy to ${hqOffice.get('name')}: ${policy.title}`);
      }
    }

    // Assign IT policy to West Coast office
    const itPolicy = policyMap['it-acceptable-use'] as any;
    if (itPolicy) {
      const exists = await PolicyAssignment.findOne({
        company_id: companyId,
        policy_version_id: itPolicy._id,
        target_type: 'location',
        target_id: westCoastOffice._id.toString(),
      });
      if (!exists) {
        await PolicyAssignment.create({
          company_id: companyId,
          policy_version_id: itPolicy._id,
          target_type: 'location',
          target_id: westCoastOffice._id.toString(),
          target_label: westCoastOffice.get('name'),
        });
        console.log(`🏢 Assigned policy to ${westCoastOffice.get('name')}: ${itPolicy.title}`);
      }
    }

    // ── 8. Create Demo Users ─────────────────────────────────────────────────
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, salt);

    interface UserDef {
      full_name: string;
      email: string;
      role: typeof ROLES[keyof typeof ROLES];
      lifecycle_state: 'invited' | 'onboarding' | 'active' | 'on_leave' | 'terminated' | 'archived';
      department_id?: mongoose.Types.ObjectId;
      location_id?: mongoose.Types.ObjectId;
      assignRole?: mongoose.Document | null;
      is_active: boolean;
      hire_date?: Date;
    }

    const userDefs: UserDef[] = [
      // Engineering — active with roles
      {
        full_name: 'Sara Mitchell',
        email: 'sara.mitchell@abidisolutions.com',
        role: ROLES.MANAGER,
        lifecycle_state: 'active',
        department_id: engineeringDept._id as mongoose.Types.ObjectId,
        location_id: hqOffice._id as mongoose.Types.ObjectId,
        assignRole: managerRole,
        is_active: true,
        hire_date: new Date('2023-03-15'),
      },
      {
        full_name: 'James Park',
        email: 'james.park@abidisolutions.com',
        role: ROLES.EMPLOYEE,
        lifecycle_state: 'active',
        department_id: engineeringDept._id as mongoose.Types.ObjectId,
        location_id: westCoastOffice._id as mongoose.Types.ObjectId,
        assignRole: employeeRole,
        is_active: true,
        hire_date: new Date('2023-07-01'),
      },
      {
        full_name: 'Aisha Okonkwo',
        email: 'aisha.okonkwo@abidisolutions.com',
        role: ROLES.EMPLOYEE,
        lifecycle_state: 'onboarding',
        department_id: engineeringDept._id as mongoose.Types.ObjectId,
        location_id: hqOffice._id as mongoose.Types.ObjectId,
        assignRole: employeeRole,
        is_active: false,
        hire_date: new Date('2026-04-01'),
      },
      // People & Culture — HR admin + invited
      {
        full_name: 'Priya Sharma',
        email: 'priya.sharma@abidisolutions.com',
        role: ROLES.EMPLOYEE,
        lifecycle_state: 'active',
        department_id: peopleDept._id as mongoose.Types.ObjectId,
        location_id: hqOffice._id as mongoose.Types.ObjectId,
        assignRole: hrAdminRole,
        is_active: true,
        hire_date: new Date('2022-11-20'),
      },
      {
        full_name: 'David Chen',
        email: 'david.chen@abidisolutions.com',
        role: ROLES.EMPLOYEE,
        lifecycle_state: 'invited',
        department_id: peopleDept._id as mongoose.Types.ObjectId,
        location_id: hqOffice._id as mongoose.Types.ObjectId,
        assignRole: null, // No role yet → triggers RULE-01 if activated
        is_active: false,
      },
      // Finance — active with NO role (triggers RULE-01 once active) + on_leave
      {
        full_name: 'Marcus Thompson',
        email: 'marcus.thompson@abidisolutions.com',
        role: ROLES.EMPLOYEE,
        lifecycle_state: 'active',
        department_id: financeDept._id as mongoose.Types.ObjectId,
        location_id: hqOffice._id as mongoose.Types.ObjectId,
        assignRole: null, // ← INTENTIONALLY no role → RULE-01 fires
        is_active: true,
        hire_date: new Date('2024-01-10'),
      },
      {
        full_name: 'Linda Vasquez',
        email: 'linda.vasquez@abidisolutions.com',
        role: ROLES.EMPLOYEE,
        lifecycle_state: 'on_leave',
        department_id: financeDept._id as mongoose.Types.ObjectId,
        location_id: canadaHQ._id as mongoose.Types.ObjectId,
        assignRole: employeeRole,
        is_active: false,
        hire_date: new Date('2021-06-15'),
      },
    ];

    const createdUsers: Record<string, mongoose.Document> = {};

    for (const def of userDefs) {
      let user = await User.findOne({ company_id: companyId, email: def.email });
      if (!user) {
        user = await User.create({
          company_id: companyId,
          full_name: def.full_name,
          email: def.email,
          password_hash: passwordHash,
          role: def.role,
          lifecycle_state: def.lifecycle_state,
          is_active: def.is_active,
          department_id: def.department_id,
          location_id: def.location_id,
          hire_date: def.hire_date,
          employment_type: 'full_time',
        });
        console.log(`👤 Created user: ${def.full_name} (${def.lifecycle_state})`);
      } else {
        console.log(`👤 User already exists: ${def.full_name}`);
      }
      createdUsers[def.email] = user;

      // Assign role if specified
      if (def.assignRole) {
        const existingRole = await UserRole.findOne({
          user_id: user._id,
          role_id: (def.assignRole as any)._id,
        });
        if (!existingRole) {
          await UserRole.create({
            user_id: user._id,
            role_id: (def.assignRole as any)._id,
            company_id: companyId,
            assigned_by: user._id,
            assigned_at: new Date(),
          });
        }
      }
    }

    // ── 6. Assign Engineering dept manager ───────────────────────────────────
    const saraMitchell = createdUsers['sara.mitchell@abidisolutions.com'];
    const priyaSharma = createdUsers['priya.sharma@abidisolutions.com'];

    await Department.findByIdAndUpdate(engineeringDept._id, {
      primary_manager_id: saraMitchell._id,
    });
    await Department.findByIdAndUpdate(peopleDept._id, {
      primary_manager_id: priyaSharma._id,
    });
    // Finance intentionally has NO manager → RULE-02 fires

    console.log('\n✅ Demo seed complete!');
    console.log('\n📊 Summary:');
    console.log('  Business Units:  1 (Abidi Solutions)');
    console.log('  Departments:     3 (Engineering ✅ managed | People & Culture ✅ managed | Finance ⚠️ NO manager)');
    console.log('  Locations:       9 (North America → US/Canada → NY/SF/Toronto → Offices)');
    console.log('  Policies:        5 published (Remote Work, Code of Conduct, Data Security, IT Acceptable Use, Leave)');
    console.log('  Users:           7 created (each assigned to a location)');
    console.log('  RULE-01 target:  marcus.thompson@abidisolutions.com (active, no role)');
    console.log('  RULE-02 target:  Finance department (no primary manager)');
    console.log('\n  All demo users password: Demo@12345');
    console.log('  HQ Office has location-specific policies: Remote Work + Leave (override global)');
    console.log('  West Coast Office has: IT Acceptable Use');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
}

seedDemoData();
