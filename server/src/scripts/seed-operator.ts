import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { OperatorAccount } from '../models/OperatorAccount.model';

dotenv.config({ path: path.join(__dirname, '../../.env') });

// Idempotent dev operator seed. Credentials come from env only (no defaults).
async function seedOperator() {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.OPERATOR_SEED_FORCE !== 'true') {
      throw new Error('Refusing to seed an operator in production (set OPERATOR_SEED_FORCE=true to override)');
    }
    const email = process.env.OPERATOR_SEED_EMAIL?.trim().toLowerCase();
    const password = process.env.OPERATOR_SEED_PASSWORD;
    if (!email || !password) throw new Error('OPERATOR_SEED_EMAIL and OPERATOR_SEED_PASSWORD must be set');
    if (password.length < 12) throw new Error('OPERATOR_SEED_PASSWORD must be at least 12 characters');
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not defined in .env');

    await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME ?? 'admin_center' });
    const password_hash = await bcrypt.hash(password, 12);
    const existing = await OperatorAccount.findOne({ email });
    if (existing) {
      existing.password_hash = password_hash;
      existing.status = 'active';
      if (!existing.roles.includes('platform_admin')) existing.roles.push('platform_admin');
      await existing.save();
      console.log(`Operator ${email} updated (password reset, active). MFA enrolment state unchanged.`);
    } else {
      await OperatorAccount.create({
        email, full_name: process.env.OPERATOR_SEED_NAME || 'Platform Operator', password_hash, roles: ['platform_admin'], status: 'active',
      });
      console.log(`Operator ${email} created. TOTP is enrolled at first sign-in.`);
    }
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding operator:', error);
    process.exit(1);
  }
}

seedOperator();
