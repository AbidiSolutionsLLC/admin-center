import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from './config/db';
import app from './app';
import { processEscalations } from './lib/escalationEngine';
import { processAuditRetention } from './lib/auditRetention';
import { runIntelligenceRulesForAllCompanies } from './lib/intelligence';

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    
    // Start background jobs
    // 1. Escalations processing (every 5 minutes)
    setInterval(() => {
      processEscalations().catch(console.error);
    }, 5 * 60 * 1000);

    // 2. Audit Retention processing (every 24 hours)
    setInterval(() => {
      processAuditRetention().catch(console.error);
    }, 24 * 60 * 60 * 1000);

    // 3. Automated System Health & Misconfiguration Detection (every 60 seconds)
    setInterval(() => {
      runIntelligenceRulesForAllCompanies().catch(console.error);
    }, 60 * 1000);
    
    console.log('[EscalationEngine] Escalation polling started.');
    console.log('[IntelligenceEngine] Automated misconfiguration and health detection started.');
    
    // Run initial scans on startup
    processAuditRetention().catch(console.error);
    runIntelligenceRulesForAllCompanies().catch(console.error);
  });
}).catch((err) => {
  console.error("Failed to connect to MongoDB", err);
  process.exit(1);
});
