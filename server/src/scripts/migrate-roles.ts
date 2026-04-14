// server/src/scripts/migrate-roles.ts
/**
 * Migration script to add role field to existing users.
 * 
 * This script:
 * 1. Reads UserRole assignments for each user
 * 2. Maps old role names to new UserRole enum values
 * 3. Updates users with the role field
 * 4. Users without any role assignment get 'Employee' by default
 * 
 * Run with: npx ts-node server/src/scripts/migrate-roles.ts
 */

import mongoose from 'mongoose';
import { User } from '../models/User.model';
import { UserRole } from '../models/UserRole.model';
import { Role } from '../models/Role.model';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/admin_center';

const ROLE_MAPPING: Record<string, string> = {
  'Super Admin': 'Super Admin',
  'HR Admin': 'HR',
  'IT Admin': 'Admin',
  'Ops Admin': 'Admin',
  'Manager': 'Manager',
  'Employee': 'Employee',
};

async function migrateRoles() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get all users without a role field
    const usersWithoutRole = await User.find({ role: { $exists: false } });
    console.log(`\n📊 Found ${usersWithoutRole.length} users without role field`);

    if (usersWithoutRole.length === 0) {
      console.log('✅ All users already have roles. Migration complete.');
      await mongoose.disconnect();
      return;
    }

    let updated = 0;
    let skipped = 0;

    for (const user of usersWithoutRole) {
      try {
        // Find UserRole assignments for this user
        const userRoles = await UserRole.find({ user_id: user._id }).populate('role_id');

        if (userRoles.length === 0) {
          // No role assigned, default to Employee
          user.role = 'Employee';
          await user.save();
          updated++;
          console.log(`  ✓ Set ${user.email} → Employee (default)`);
          continue;
        }

        // Get the first role (or highest priority role)
        const firstRole = userRoles[0];
        const roleName = (firstRole.role_id as any)?.name;

        if (!roleName) {
          console.log(`  ⚠ Warning: Could not determine role for ${user.email}`);
          user.role = 'Employee';
          await user.save();
          updated++;
          continue;
        }

        // Map old role name to new role
        const newRole = ROLE_MAPPING[roleName];
        if (!newRole) {
          console.log(`  ⚠ Warning: Unknown role "${roleName}" for ${user.email}, defaulting to Employee`);
          user.role = 'Employee';
        } else {
          user.role = newRole as any;
        }

        await user.save();
        updated++;
        console.log(`  ✓ Set ${user.email} → ${user.role} (was ${roleName})`);
      } catch (error) {
        console.error(`  ✗ Error updating ${user.email}:`, error);
        skipped++;
      }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);

    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateRoles();
