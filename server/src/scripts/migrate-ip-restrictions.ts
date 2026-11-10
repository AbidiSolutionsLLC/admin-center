import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sowaye';

const migration = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established.');
    }
    
    // Update all existing IpRestriction documents to have subject_type: 'all_users'
    const result = await db.collection('iprestrictions').updateMany(
      { subject_type: { $exists: false } },
      { $set: { subject_type: 'all_users' } }
    );

    console.log(`Migration complete. Updated ${result.modifiedCount} documents.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

migration();
