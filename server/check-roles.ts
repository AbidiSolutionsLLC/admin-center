
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { User, Role, UserRole } from './src/models';

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkAssignments() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI not defined');

    await mongoose.connect(mongoUri, { dbName: process.env.DB_NAME ?? 'admin_center' });
    
    const roles = await Role.find({}).lean();
    console.log(`\n--- ROLES (${roles.length}) ---`);
    for (const r of roles) {
        const userRoles = await UserRole.find({ role_id: r._id }).lean();
        console.log(`Role: "${r.name}" | id: ${r._id} | company_id: ${r.company_id}`);
        console.log(`  Mappings in UserRole: ${userRoles.length}`);
        userRoles.forEach(ur => {
            const match = ur.company_id.toString() === r.company_id.toString();
            console.log(`    Mapping for user ${ur.user_id} | company_id: ${ur.company_id} | Match: ${match}`);
        });
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkAssignments();
