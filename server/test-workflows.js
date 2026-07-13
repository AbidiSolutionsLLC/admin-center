import mongoose from 'mongoose';

async function run() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sowaye');
    const workflows = await mongoose.connection.db.collection('workflows').find({}).toArray();
    console.log(JSON.stringify(workflows.map(w => ({ id: w._id, name: w.name, status: w.status, version_number: w.version_number })), null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
