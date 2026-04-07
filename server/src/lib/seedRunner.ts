// server/src/lib/seedRunner.ts
/**
 * Database Seeding Runner
 * 
 * Seeds permissions and system roles for a company.
 * 
 * Usage:
 *   ts-node src/lib/seedRunner.ts <company_id>
 * 
 * Example:
 *   ts-node src/lib/seedRunner.ts 507f1f77bcf86cd799439011
 */

import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import { seedDatabase } from './seed';

dotenv.config();

async function main() {
  try {
    // Get company ID from command line args
    const companyId = process.argv[2];
    
    if (!companyId) {
      console.error('❌ Error: Company ID required');
      console.log('Usage: ts-node src/lib/seedRunner.ts <company_id>');
      process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!, {
      dbName: process.env.DB_NAME ?? 'admin_center',
    });
    console.log('✅ Connected to MongoDB');

    await seedDatabase(companyId);

    console.log('🎉 Seeding complete!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

main();
