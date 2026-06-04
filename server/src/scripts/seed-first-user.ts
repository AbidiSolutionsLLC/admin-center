import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { Company, User, Role, UserRole } from '../models';
import { seedDatabase } from '../lib/seed';
import { ROLES } from '../constants/roles';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function seedFirstUser() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in .env');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      dbName: process.env.DB_NAME ?? 'admin_center',
    });
    console.log('Connected successfully.');

    const email = 'admin@example.com';
    const password = 'password123';
    const fullName = 'Admin Bhai';

    // 1. Find or create Company
    let company = await Company.findOne({ name: 'Abidi Solutions LLC' });
    if (!company) {
      console.log('Creating company: Abidi Solutions LLC');
      company = await Company.create({
        name: 'Abidi Solutions LLC',
        slug: 'abidi-solutions-llc',
        domain: 'abidisolutions.com',
        employee_id_format: 'EMP-{counter:5}',
        plan: 'pro',
        is_active: true,
      });
    } else {
      console.log('Company already exists.');
    }

    // 2. Seed Database (Permissions, Roles, Security Policy)
    console.log('Seeding database for company...');
    await seedDatabase(company._id.toString());

    // 3. Find the Super Admin Role (created by seedDatabase)
    const role = await Role.findOne({ company_id: company._id, name: ROLES.SUPER_ADMIN });
    if (!role) {
      throw new Error(`${ROLES.SUPER_ADMIN} role not found after seeding`);
    }

    // 4. Create User
    let user = await User.findOne({ email });
    if (!user) {
      console.log(`Creating user: ${email}`);
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(password, salt);

      user = await User.create({
        company_id: company._id,
        full_name: fullName,
        email: email,
        password_hash: password_hash,
        role: ROLES.SUPER_ADMIN,
        lifecycle_state: 'active',
        is_active: true,
        employment_type: 'full_time',
      });
      console.log('User created successfully.');
    } else {
      console.log('User already exists.');
      // Update password just in case
      const salt = await bcrypt.genSalt(10);
      user.password_hash = await bcrypt.hash(password, salt);
      user.lifecycle_state = 'active';
      user.is_active = true;
      await user.save();
      console.log('User password updated.');
    }

    // 5. Assign Role to User
    const userRole = await UserRole.findOne({ user_id: user._id, role_id: role._id });
    if (!userRole) {
      console.log(`Assigning ${ROLES.SUPER_ADMIN} role to user...`);
      await UserRole.create({
        user_id: user._id,
        role_id: role._id,
        company_id: company._id,
        assigned_by: user._id, // First user assigns to themselves
        assigned_at: new Date(),
      });
      console.log('Role assigned.');
    } else {
      console.log('Role already assigned.');
    }

    console.log('Seed completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding user:', error);
    process.exit(1);
  }
}

seedFirstUser();
