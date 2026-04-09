// server/src/scripts/verify-seed.ts
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import { Permission } from '../models/Permission.model';
import { Role } from '../models/Role.model';
import { RolePermission } from '../models/RolePermission.model';
import { UserRole } from '../models/UserRole.model';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const verify = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in .env');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      dbName: process.env.DB_NAME || 'admin_center',
    });
    console.log('Connected successfully.\n');

    // 1. Verify permissions count
    const permissionCount = await Permission.countDocuments();
    console.log(`✅ Permissions: ${permissionCount} documents (expected: 195)`);
    if (permissionCount !== 195) {
      console.error(`❌ Expected 195 permissions, got ${permissionCount}`);
    }

    // 2. Verify system roles
    const roles = await Role.find({ type: 'system' }).lean();
    console.log(`\n✅ System Roles: ${roles.length} roles`);
    const expectedRoles = ['Super Admin', 'HR Admin', 'IT Admin', 'Ops Admin', 'Manager', 'Employee'];
    const roleNames = roles.map(r => r.name);
    console.log('Roles:', roleNames.join(', '));
    
    for (const expectedRole of expectedRoles) {
      if (!roleNames.includes(expectedRole)) {
        console.error(`❌ Missing system role: ${expectedRole}`);
      }
    }

    // 3. Verify role permissions assigned
    const rolePermissionCount = await RolePermission.countDocuments();
    console.log(`\n✅ RolePermission assignments: ${rolePermissionCount}`);

    // Check each role has permissions
    for (const role of roles) {
      const count = await RolePermission.countDocuments({ role_id: role._id });
      console.log(`   - ${role.name}: ${count} permissions`);
    }

    // 4. Verify indexes exist
    console.log('\n📋 Checking indexes...');
    
    const permissionIndexes = await Permission.collection.indexes();
    console.log('\nPermission indexes:');
    permissionIndexes.forEach(idx => console.log(`   - ${JSON.stringify(idx.key)}`));

    const roleIndexes = await Role.collection.indexes();
    console.log('\nRole indexes:');
    roleIndexes.forEach(idx => console.log(`   - ${JSON.stringify(idx.key)}`));

    const rolePermissionIndexes = await RolePermission.collection.indexes();
    console.log('\nRolePermission indexes:');
    rolePermissionIndexes.forEach(idx => console.log(`   - ${JSON.stringify(idx.key)}`));

    const userRoleIndexes = await UserRole.collection.indexes();
    console.log('\nUserRole indexes:');
    userRoleIndexes.forEach(idx => console.log(`   - ${JSON.stringify(idx.key)}`));

    console.log('\n✅ Verification complete!');
    process.exit(0);
  } catch (error: any) {
    console.error('Verification failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

verify();
