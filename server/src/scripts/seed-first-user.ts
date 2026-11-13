import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { Company, User, Role, UserRole, Identity, OrganizationEntitlement, App, AppAssignment } from '../models';
import { seedDatabase } from '../lib/seed';
import { seedProductRegistry } from '../lib/productCatalog';
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

    // No default password: a committed fallback would become a known credential on any DB this runs against.
    const email = (process.env.SEED_ADMIN_EMAIL || 'admin@karbexa.local').trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password || password.length < 12) {
      throw new Error('Set SEED_ADMIN_PASSWORD (at least 12 characters) to run seed:first');
    }
    const fullName = process.env.SEED_ADMIN_NAME || 'Platform Administrator';

    // 1. Ensure Product Registry & Plans are seeded
    console.log('Seeding Product Registry & Plans...');
    await seedProductRegistry();

    // 2. Find or create Company
    let company = await Company.findOne({ name: 'Abidi Solutions LLC' });
    if (!company) {
      console.log('Creating company: Abidi Solutions LLC');
      company = await Company.create({
        name: 'Abidi Solutions LLC',
        slug: 'abidi-solutions-llc',
        domain: 'abidisolutions.com',
        employee_id_format: 'EMP-{counter:5}',
        plan: 'enterprise',
        status: 'active',
        is_active: true,
      });
    } else {
      company.plan = 'enterprise';
      company.status = 'active';
      company.is_active = true;
      await company.save();
      console.log('Company updated (active, enterprise).');
    }

    // 3. Grant Organization Entitlements for all 4 products
    const productKeys = ['people', 'projects', 'sign', 'desk'] as const;
    for (const pk of productKeys) {
      await OrganizationEntitlement.updateOne(
        { company_id: company._id, product_key: pk },
        { $set: { status: 'active', source: 'seed', plan_key: 'enterprise' } },
        { upsert: true }
      );
    }
    console.log('Organization Entitlements active for People, Projects, Sign, Desk.');

    // 4. Seed Database (Permissions, Roles, Security Policy)
    console.log('Seeding database roles & permissions for company...');
    await seedDatabase(company._id.toString());

    // 5. Find the Super Admin Role (created by seedDatabase)
    const role = await Role.findOne({ company_id: company._id, name: ROLES.SUPER_ADMIN });
    if (!role) {
      throw new Error(`${ROLES.SUPER_ADMIN} role not found after seeding`);
    }

    // 6. Create or update Identity (Required for Central OIDC Tenant Login)
    const password_hash = await bcrypt.hash(password, 12);
    let identity = await Identity.findOne({ email });
    if (!identity) {
      console.log(`Creating identity: ${email}`);
      identity = await Identity.create({
        email,
        full_name: fullName,
        password_hash,
        password_changed_at: new Date(),
        email_verified_at: new Date(),
        status: 'active',
      });
    } else {
      identity.password_hash = password_hash;
      identity.status = 'active';
      identity.full_name = fullName;
      await identity.save();
      console.log(`Identity password reset for: ${email}`);
    }

    // 7. Create or update User membership linked to Identity
    let user = await User.findOne({ company_id: company._id, email });
    if (!user) {
      console.log(`Creating user membership: ${email}`);
      user = await User.create({
        company_id: company._id,
        identity_id: identity._id,
        full_name: fullName,
        email: email,
        password_hash: 'legacy-unused',
        role: ROLES.SUPER_ADMIN,
        lifecycle_state: 'active',
        is_active: true,
        employment_type: 'full_time',
      });
      console.log('User created successfully.');
    } else {
      user.identity_id = identity._id;
      user.lifecycle_state = 'active';
      user.is_active = true;
      user.role = ROLES.SUPER_ADMIN;
      await user.save();
      console.log('User membership linked to identity.');
    }

    // 8. Assign Super Admin Role to User
    const userRole = await UserRole.findOne({ user_id: user._id, role_id: role._id });
    if (!userRole) {
      console.log(`Assigning ${ROLES.SUPER_ADMIN} role to user...`);
      await UserRole.create({
        user_id: user._id,
        role_id: role._id,
        company_id: company._id,
        assigned_by: user._id,
        assigned_at: new Date(),
      });
      console.log('Role assigned.');
    }

    // 9. Assign Product Roles to User (Direct App Assignments)
    const apps = await App.find({ product_key: { $in: productKeys } });
    const productRoleMap: Record<string, string> = {
      people: 'people_administrator',
      projects: 'project_administrator',
      sign: 'sign_administrator',
      desk: 'desk_admin',
    };

    for (const app of apps) {
      if (app.product_key && productRoleMap[app.product_key]) {
        await AppAssignment.updateOne(
          { company_id: company._id, app_id: app._id, target_type: 'user', target_id: user._id },
          {
            $set: {
              product_role_key: productRoleMap[app.product_key],
              is_active: true,
              include_descendants: true,
              granted_by: user._id,
              granted_at: new Date(),
            },
          },
          { upsert: true }
        );
      }
    }
    console.log('Direct product role assignments active for all products.');

    console.log('\n==================================================');
    console.log('SEED COMPLETED SUCCESSFULLY!');
    console.log('Tenant Customer Admin Credentials:');
    console.log(`  Portal URL: http://localhost:5173/login`);
    console.log(`  Email:      ${email}`);
    console.log(`  Password:   ${password}`);
    console.log('==================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding user:', error);
    process.exit(1);
  }
}

seedFirstUser();
