import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import { User } from '../server/src/models/User.model';

dotenv.config({ path: path.join(__dirname, '../server/.env') });

const check = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI is not defined');

    await mongoose.connect(mongoUri, {
      dbName: process.env.DB_NAME || 'admin_center',
    });

    const user = await User.findOne({ email: 'john.doe@example.com' });
    if (user) {
      console.log('User found:');
      console.log('  Full Name:', user.full_name);
      console.log('  Email:', user.email);
      console.log('  Lifecycle State:', user.lifecycle_state);
      console.log('  Is Active:', user.is_active);
    } else {
      console.log('User john.doe@example.com not found.');
    }

    process.exit(0);
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

check();
