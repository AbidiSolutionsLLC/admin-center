import { Company } from '../models/Company.model';
import { AuditEvent } from '../models/AuditEvent.model';

export const processAuditRetention = async () => {
  try {
    const companies = await Company.find({ 
      is_active: true, 
      'settings.audit_log_retention_days': { $gt: 0 } 
    }).select('_id settings.audit_log_retention_days name');
    
    for (const company of companies) {
      const retentionDays = company.settings?.audit_log_retention_days;
      if (!retentionDays || retentionDays <= 0) continue;
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const result = await AuditEvent.collection.deleteMany({
        company_id: company._id,
        created_at: { $lt: cutoffDate }
      });
      
      if (result.deletedCount > 0) {
        // Logging via console since it's a background worker.
        console.log(`[AuditRetention] Deleted ${result.deletedCount} old audit events for company ${company.name} (${company._id})`);
      }
    }
  } catch (error) {
    console.error('[AuditRetention] Error processing retention:', error);
  }
};
