// server/src/scripts/seed.ts
import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import path from 'path';
import { User } from '../models/User.model';
import { Company } from '../models/Company.model';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const seed = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in .env');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      dbName: process.env.DB_NAME || 'admin_center',
    });
    console.log('Connected successfully.');

    // 1. Create or get Company
    let company = await Company.findOne({ slug: 'test-company' });
    if (!company) {
      console.log('Creating test company...');
      company = await Company.create({
        name: 'Test Company',
        slug: 'test-company',
        plan: 'pro',
        is_active: true,
      });
      console.log('Company created:', company._id);
    } else {
      console.log('Company already exists.');
    }

    // 2. Create Admin User
    const adminEmail = 'admin@example.com';
    const existingUser = await User.findOne({ email: adminEmail });

    if (!existingUser) {
      console.log('Creating admin user...');
      const passwordHash = await bcrypt.hash('password123', 10);
      
      const adminUser = await User.create({
        company_id: company._id,
        full_name: 'Admin User',
        email: adminEmail,
        password_hash: passwordHash,
        lifecycle_state: 'active',
        employment_type: 'full_time',
        is_active: true,
      });
      console.log('Admin user created:', adminUser.email);
    } else {
      console.log('Admin user already exists.');
    }

    console.log('Seed completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('Seed failed. Dumping to error.json');
    require('fs').writeFileSync('error.json', JSON.stringify({
      message: error.message,
      stack: error.stack,
      name: error.name
    }, null, 2));
    process.exit(1);
  }
};

seed();
