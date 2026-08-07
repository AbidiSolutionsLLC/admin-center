const mongoose = require('mongoose');
require('dotenv').config();

async function cleanup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/admin-center');
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const customFieldsCollection = db.collection('customfields');

    // To ensure we get absolutely everything that is corrupted, 
    // we will just delete ALL system fields that are NOT for the 'user' target_object.
    // Since this feature is new, there is no real data attached to these default fields yet.
    // Once they are deleted, the updated backend will perfectly re-seed the correct ones!
    const result = await customFieldsCollection.deleteMany({
      is_system_field: true,
      target_object: { $ne: 'user' }
    });

    console.log(`Successfully deleted ${result.deletedCount} incorrect system fields.`);
    
    // Let's also verify what's left
    const remainingTeamFields = await customFieldsCollection.countDocuments({ target_object: 'team' });
    console.log(`Remaining fields for 'team' target_object: ${remainingTeamFields}`);

    process.exit(0);
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanup();
