import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { auditLogger } from '../lib/auditLogger';
import { AuditEvent } from '../models/AuditEvent.model';
import { User } from '../models/User.model';
import { Company } from '../models/Company.model';

dotenv.config();

async function verify() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected.');

    // Find a test user and company
    const user = await User.findOne();
    const company = await Company.findOne();

    if (!user || !company) {
      console.error('Test user or company not found. Please run seed first.');
      process.exit(1);
    }

    console.log(`Using user: ${user.email} and company: ${company.name}`);

    // Mock request object for auditLogger
    const mockReq = {
      user: {
        _id: user._id,
        email: user.email,
        company_id: company._id,
      },
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'VerificationScript',
      },
    } as any;

    // 1. Test user.org_assigned with NEW module 'organization'
    console.log('Logging user.org_assigned...');
    await auditLogger.log({
      req: mockReq,
      action: 'user.org_assigned',
      module: 'organization', // New module
      object_type: 'User',
      object_id: user._id.toString(),
      object_label: user.full_name,
      before_state: null,
      after_state: { department_id: 'mock_dept_id' },
    });

    // 2. Test BusinessUnit object_type
    console.log('Logging business_unit.created...');
    await auditLogger.log({
      req: mockReq,
      action: 'department.created',
      module: 'organization',
      object_type: 'BusinessUnit', // New object type
      object_id: new mongoose.Types.ObjectId().toString(),
      object_label: 'New Business Unit',
      before_state: null,
      after_state: { name: 'New Business Unit', type: 'business_unit' },
    });

    // 3. Verify retrieval via module 'organization'
    console.log('Verifying retrieval...');
    const events = await AuditEvent.find({
      company_id: company._id,
      module: 'organization',
    }).sort({ created_at: -1 }).limit(2);

    console.log(`Found ${events.length} events in organization module.`);
    
    events.forEach(e => {
      console.log(`- Action: ${e.action}, ObjectType: ${e.object_type}, Module: ${e.module}`);
    });

    const hasUserOrgAssigned = events.some(e => e.action === 'user.org_assigned');
    const hasBusinessUnit = events.some(e => e.object_type === 'BusinessUnit');

    if (hasUserOrgAssigned && hasBusinessUnit) {
      console.log('✅ Verification successful: Audit logs are correctly categorized.');
    } else {
      console.error('❌ Verification failed: Missing expected audit logs.');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  }
}

verify();
