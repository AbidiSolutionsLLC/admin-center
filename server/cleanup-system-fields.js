const mongoose = require('mongoose');
require('dotenv').config();

async function cleanup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/admin-center');
    console.log('Connected to MongoDB');

    // The CustomField model is in the customfields collection
    const db = mongoose.connection.db;
    const customFieldsCollection = db.collection('customfields');

    // We want to delete any system fields that are NOT on the 'user' target_object
    // but have slugs that belong to the user's system fields (which were incorrectly seeded before)
    const userSystemSlugs = [
      'full_name', 'email', 'phone', 'department', 'location', 
      'job_title', 'employee_id', 'hire_date', 'employment_type'
    ];

    const result = await customFieldsCollection.deleteMany({
      is_system_field: true,
      target_object: { $ne: 'user' },
      slug: { $in: userSystemSlugs }
    });

    console.log(`Successfully deleted ${result.deletedCount} incorrect system fields.`);
    process.exit(0);
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanup();
