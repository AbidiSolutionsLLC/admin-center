// server/src/scripts/fix-role-permissions.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { Role, RolePermission, UserRole } from '../models';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function fixData() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI not defined');

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, { dbName: process.env.DB_NAME ?? 'admin_center' });
    console.log('✅ Connected.');

    // 1. Fix RolePermissions
    console.log('🔍 Checking RolePermissions for missing company_id...');
    const rps = await RolePermission.find({ company_id: { $exists: false } });
    console.log(`Found ${rps.length} documents to fix.`);

    for (const rp of rps) {
      const role = await Role.findById(rp.role_id);
      if (role) {
        await RolePermission.updateOne(
          { _id: rp._id },
          { $set: { company_id: role.company_id } }
        );
      }
    }
    console.log('✅ RolePermissions fixed.');

    // 2. Fix UserRoles
    console.log('🔍 Checking UserRoles for missing company_id...');
    const urs = await UserRole.find({ company_id: { $exists: false } });
    console.log(`Found ${urs.length} documents to fix.`);

    for (const ur of urs) {
      const role = await Role.findById(ur.role_id);
      if (role) {
        await UserRole.updateOne(
          { _id: ur._id },
          { $set: { company_id: role.company_id } }
        );
      }
    }
    console.log('✅ UserRoles fixed.');

    console.log('\n✨ All data fixed!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Fix failed:', err);
    process.exit(1);
  }
}

fixData();
