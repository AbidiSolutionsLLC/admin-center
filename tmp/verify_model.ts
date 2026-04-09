// /tmp/verify_model.ts
import mongoose from 'mongoose';
import { User } from '../server/src/models/User.model';
import { Location } from '../server/src/models/Location.model';

async function verify() {
  try {
    console.log('Registered models:', mongoose.modelNames());
    if (mongoose.modelNames().includes('Location')) {
      console.log('SUCCESS: Location model is registered.');
    } else {
      console.log('FAILURE: Location model is NOT registered.');
    }
  } catch (error) {
    console.error('Error during verification:', error);
  } finally {
    process.exit();
  }
}

// Mocking the connection just to check registration
verify();
