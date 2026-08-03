require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME ?? 'admin_center' });
  console.log('Connected to DB: admin_center');

  const CustomField = mongoose.model('CustomField', new mongoose.Schema({
    target_object: String,
    is_system_field: Boolean,
    name: String,
    label: String
  }, { collection: 'customfields' }));

  const toDelete = await CustomField.find({
    is_system_field: true,
    target_object: { $ne: 'user' }
  });

  console.log(`Found ${toDelete.length} bad system fields on non-user objects.`);

  if (toDelete.length > 0) {
    for (const field of toDelete) {
      console.log(`Deleting: ${field.target_object} - ${field.label} (${field.name})`);
    }
    const result = await CustomField.deleteMany({
      is_system_field: true,
      target_object: { $ne: 'user' }
    });
    console.log(`Deleted ${result.deletedCount} fields.`);
  }

  mongoose.disconnect();
}

run().catch(console.error);
