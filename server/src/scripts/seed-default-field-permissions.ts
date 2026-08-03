/**
 * seed-default-field-permissions.ts
 * Seeds default FieldPermission records for all standard fields of all
 * target objects (user, department, policy) for every company in the DB.
 *
 * Every field defaults to visibility='all' and edit_visibility='all' —
 * preserving the legacy "everyone can see and edit everything" behaviour
 * until an admin configures restrictions via the admin centre UI.
 *
 * Run from server directory:
 *   npx ts-node src/scripts/seed-default-field-permissions.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { Company } from '../models';
import { FieldPermission, STANDARD_FIELDS } from '../models/FieldPermission.model';

async function seedDefaultFieldPermissions() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI not defined in .env');

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, { dbName: process.env.DB_NAME ?? 'admin_center' });
    console.log('✅ Connected.');

    const companies = await Company.find({}).select('_id').lean();
    if (companies.length === 0) {
      console.log('ℹ️  No companies found — nothing to seed.');
      return;
    }

    let totalCreated = 0;

    for (const company of companies) {
      const companyId = company._id;

      for (const targetObject of ['user', 'department', 'policy'] as const) {
        const fieldList = STANDARD_FIELDS[targetObject];

        for (const fieldName of fieldList) {
          const existing = await FieldPermission.findOne({
            company_id: companyId,
            target_object: targetObject,
            field_name: fieldName,
          }).lean();

          if (!existing) {
            await FieldPermission.create({
              company_id: companyId,
              target_object: targetObject,
              field_name: fieldName,
              visibility: 'all',
              edit_visibility: 'all',
              is_active: true,
            });
            totalCreated++;
          }
        }
      }
    }

    console.log(`✅ Seeded ${totalCreated} default FieldPermission records across ${companies.length} company/companies.`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected.');
  }
}

seedDefaultFieldPermissions();
