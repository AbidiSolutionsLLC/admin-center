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

import { Company, User, Department, Role, UserRole } from '../models';

const DEMO_PASSWORD = 'Demo@12345';

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
    const hrAdminRole = await Role.findOne({ company_id: companyId, name: 'HR Admin' });
    const managerRole = await Role.findOne({ company_id: companyId, name: 'Manager' });
    const employeeRole = await Role.findOne({ company_id: companyId, name: 'Employee' });

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

    // ── 5. Create Demo Users ─────────────────────────────────────────────────
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, salt);

    interface UserDef {
      full_name: string;
      email: string;
      role: 'Super Admin' | 'Admin' | 'HR' | 'Manager' | 'Employee' | 'Technician';
      lifecycle_state: 'pending' | 'invited' | 'onboarding' | 'active' | 'on_leave' | 'terminated' | 'archived';
      department_id?: mongoose.Types.ObjectId;
      assignRole?: mongoose.Document | null;
      is_active: boolean;
      hire_date?: Date;
    }

    const userDefs: UserDef[] = [
      // Engineering — active with roles
      {
        full_name: 'Sara Mitchell',
        email: 'sara.mitchell@abidisolutions.com',
        role: 'Manager',
        lifecycle_state: 'active',
        department_id: engineeringDept._id as mongoose.Types.ObjectId,
        assignRole: managerRole,
        is_active: true,
        hire_date: new Date('2023-03-15'),
      },
      {
        full_name: 'James Park',
        email: 'james.park@abidisolutions.com',
        role: 'Employee',
        lifecycle_state: 'active',
        department_id: engineeringDept._id as mongoose.Types.ObjectId,
        assignRole: employeeRole,
        is_active: true,
        hire_date: new Date('2023-07-01'),
      },
      {
        full_name: 'Aisha Okonkwo',
        email: 'aisha.okonkwo@abidisolutions.com',
        role: 'Employee',
        lifecycle_state: 'onboarding',
        department_id: engineeringDept._id as mongoose.Types.ObjectId,
        assignRole: employeeRole,
        is_active: false,
        hire_date: new Date('2026-04-01'),
      },
      // People & Culture — HR admin + invited
      {
        full_name: 'Priya Sharma',
        email: 'priya.sharma@abidisolutions.com',
        role: 'Employee',
        lifecycle_state: 'active',
        department_id: peopleDept._id as mongoose.Types.ObjectId,
        assignRole: hrAdminRole,
        is_active: true,
        hire_date: new Date('2022-11-20'),
      },
      {
        full_name: 'David Chen',
        email: 'david.chen@abidisolutions.com',
        role: 'Employee',
        lifecycle_state: 'invited',
        department_id: peopleDept._id as mongoose.Types.ObjectId,
        assignRole: null, // No role yet → triggers RULE-01 if activated
        is_active: false,
      },
      // Finance — active with NO role (triggers RULE-01 once active) + on_leave
      {
        full_name: 'Marcus Thompson',
        email: 'marcus.thompson@abidisolutions.com',
        role: 'Employee',
        lifecycle_state: 'active',
        department_id: financeDept._id as mongoose.Types.ObjectId,
        assignRole: null, // ← INTENTIONALLY no role → RULE-01 fires
        is_active: true,
        hire_date: new Date('2024-01-10'),
      },
      {
        full_name: 'Linda Vasquez',
        email: 'linda.vasquez@abidisolutions.com',
        role: 'Employee',
        lifecycle_state: 'on_leave',
        department_id: financeDept._id as mongoose.Types.ObjectId,
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
    console.log('  Users:           7 created');
    console.log('  RULE-01 target:  marcus.thompson@abidisolutions.com (active, no role)');
    console.log('  RULE-02 target:  Finance department (no primary manager)');
    console.log('\n  All demo users password: Demo@12345');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
}

seedDemoData();
