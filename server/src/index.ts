import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from './config/db';
import app from './app';

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    // Server startup
  });
}).catch((err) => {
  console.error("Failed to connect to MongoDB", err);
  process.exit(1);
});
