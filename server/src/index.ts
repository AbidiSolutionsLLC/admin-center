import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from './config/db';
import app from './app';
import { processEscalations } from './lib/escalationEngine';

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    
    // Start background jobs
    setInterval(() => {
      processEscalations().catch(console.error);
    }, 5 * 60 * 1000); // 5 minutes
    console.log('[EscalationEngine] Escalation polling started.');
  });
}).catch((err) => {
  console.error("Failed to connect to MongoDB", err);
  process.exit(1);
});
