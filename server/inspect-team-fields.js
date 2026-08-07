const mongoose = require('mongoose');
require('dotenv').config();

async function inspectTeamFields() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/admin-center');
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const customFieldsCollection = db.collection('customfields');

    const fields = await customFieldsCollection.find({ target_object: 'team' }).toArray();
    console.log('\n--- ALL TEAM FIELDS IN DATABASE ---');
    console.log(`Found ${fields.length} fields for team.`);
    
    fields.forEach((f, i) => {
      console.log(`${i+1}. name: "${f.name}", slug: "${f.slug}", is_system_field: ${f.is_system_field}`);
    });
    console.log('-----------------------------------\n');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

inspectTeamFields();
