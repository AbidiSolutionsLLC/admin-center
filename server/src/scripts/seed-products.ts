// server/src/scripts/seed-products.ts — npm run seed:products
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { seedProductRegistry } from '../lib/productCatalog';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not defined in .env');
  await mongoose.connect(mongoUri, { dbName: process.env.DB_NAME ?? 'admin_center' });
  await seedProductRegistry();
  console.log('Product registry seeded.');
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
