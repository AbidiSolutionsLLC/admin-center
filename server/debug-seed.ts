import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { User } from './src/models/User.model';
import { Company } from './src/models/Company.model';

dotenv.config({ path: path.join(__dirname, '../.env') });

const seed = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    await mongoose.connect(mongoUri as string, {
      dbName: process.env.DB_NAME || 'admin_center',
    });
    
    let company = await Company.findOne({ slug: 'test-company' });
    if (!company) {
      company = await Company.create({
        name: 'Test Company',
        slug: 'test-company',
        plan: 'pro',
        is_active: true,
      });
    }

    const adminEmail = 'admin@example.com';
    const existingUser = await User.findOne({ email: adminEmail });

    if (!existingUser) {
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
    }
    process.exit(0);
  } catch (error: any) {
    fs.writeFileSync('error.json', JSON.stringify({
      message: error.message,
      stack: error.stack,
      name: error.name,
      errors: error.errors
    }, null, 2));
    process.exit(1);
  }
};

seed();
