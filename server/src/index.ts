import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from './config/db';
import { createServer } from './app';
import { processEscalations } from './lib/escalationEngine';
import { processAuditRetention } from './lib/auditRetention';
import { runIntelligenceRulesForAllCompanies } from './lib/intelligence';
import { startPlatformDispatcher, stopPlatformDispatcher } from './lib/platformDispatcher';
import { startEmailSender, stopEmailSender } from './lib/emailSender';
import { startInvitationJobs, stopInvitationJobs } from './lib/invitationJobs';
import { startJobRunner, stopJobRunner } from './lib/jobs';
import { startOverrideJobs, stopOverrideJobs } from './lib/overrideJobs';
import { startHealthJob, stopHealthJob } from './lib/health';
import { startSignalJobs, stopSignalJobs } from './lib/signals';
import { startRouteMetricsFlush, stopRouteMetricsFlush } from './lib/health/routeMetrics';

export { createServer };

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  // Identity (keys, adapter indexes, providers) is initialised inside createServer, before listen.
  const app = await createServer();
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

    startPlatformDispatcher();
    startEmailSender();
    startInvitationJobs();
    startJobRunner();
    startOverrideJobs();
    startHealthJob();
    startSignalJobs();
    process.once('SIGTERM', stopSignalJobs);
    process.once('SIGINT', stopSignalJobs);
    startRouteMetricsFlush();
    process.once('SIGTERM', stopHealthJob);
    process.once('SIGINT', stopHealthJob);
    process.once('SIGTERM', () => { void stopRouteMetricsFlush(); });
    process.once('SIGINT', () => { void stopRouteMetricsFlush(); });
    process.once('SIGTERM', stopOverrideJobs);
    process.once('SIGINT', stopOverrideJobs);
    process.once('SIGTERM', stopJobRunner);
    process.once('SIGINT', stopJobRunner);
    process.once('SIGTERM', stopInvitationJobs);
    process.once('SIGINT', stopInvitationJobs);
    process.once('SIGTERM', stopPlatformDispatcher);
    process.once('SIGINT', stopPlatformDispatcher);
    process.once('SIGTERM', stopEmailSender);
    process.once('SIGINT', stopEmailSender);

    // Run initial scans on startup
    processAuditRetention().catch(console.error);
    runIntelligenceRulesForAllCompanies().catch(console.error);
  });
}).catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
