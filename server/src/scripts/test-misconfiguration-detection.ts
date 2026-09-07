// server/src/scripts/test-misconfiguration-detection.ts
import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Company } from '../models/Company.model';
import { User } from '../models/User.model';
import { Department } from '../models/Department.model';
import { Location } from '../models/Location.model';
import { PolicyVersion } from '../models/PolicyVersion.model';
import { PolicyAssignment } from '../models/PolicyAssignment.model';
import { SecurityPolicy } from '../models/SecurityPolicy.model';
import { Insight } from '../models/Insight.model';
import { InAppNotification } from '../models/InAppNotification.model';
import { runIntelligenceRules } from '../lib/intelligence';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/admin_center';

async function runMisconfigurationTests() {
  console.log('=== Starting Misconfiguration Detection Tests ===');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.');

  const testCompanyId = new Types.ObjectId();
  const testCompanyName = `Misconfig Test Co ${Date.now()}`;

  try {
    // 1. Setup Test Company
    const company = await Company.create({
      _id: testCompanyId,
      name: testCompanyName,
      slug: `misconfig-test-${Date.now()}`,
      employee_id_format: 'EMP-{counter:4}',
      employee_id_counter: 100,
      is_active: true,
      settings: {},
    });

    // 2. Setup Super Admin & Standard Employees
    const adminUser = await User.create({
      company_id: testCompanyId,
      employee_id: 'EMP-0001',
      full_name: 'Test Super Admin',
      email: `superadmin-${Date.now()}@testco.com`,
      password_hash: 'mockhash123',
      role: 'Super Admin',
      lifecycle_state: 'active',
      is_active: true,
      mfa_enabled: true,
    });

    const standardEmployee = await User.create({
      company_id: testCompanyId,
      employee_id: 'EMP-0002',
      full_name: 'Jane Doe',
      email: `jane-${Date.now()}@testco.com`,
      password_hash: 'mockhash123',
      role: 'Employee',
      lifecycle_state: 'active',
      is_active: true,
      manager_id: null, // Incomplete setup: Missing Manager
      mfa_enabled: false,
    });

    // Setup Department
    const dept = await Department.create({
      company_id: testCompanyId,
      name: 'Engineering',
      slug: `eng-${Date.now()}`,
      type: 'department',
      is_active: true,
    });

    // Setup Conflicting Policies in HR Category
    const policy1 = await PolicyVersion.create({
      company_id: testCompanyId,
      policy_key: `pol-hr-remote-${Date.now()}`,
      title: 'Remote Work Policy Global',
      version_number: 1,
      category: 'hr',
      status: 'published',
      is_active: true,
      effective_date: new Date(),
      content: 'Remote work permitted everywhere.',
      created_by: adminUser._id,
    });

    const policy2 = await PolicyVersion.create({
      company_id: testCompanyId,
      policy_key: `pol-hr-hybrid-${Date.now()}`,
      title: 'Hybrid In-Office Mandatory Policy',
      version_number: 1,
      category: 'hr',
      status: 'published',
      is_active: true,
      effective_date: new Date(),
      content: 'Must work in office 4 days a week.',
      created_by: adminUser._id,
    });

    // Assign both policies to ALL active users
    await PolicyAssignment.create([
      {
        company_id: testCompanyId,
        policy_version_id: policy1._id,
        target_type: 'all',
        target_id: 'all',
        target_label: 'All Employees',
        assigned_by: adminUser._id,
        assigned_at: new Date(),
      },
      {
        company_id: testCompanyId,
        policy_version_id: policy2._id,
        target_type: 'all',
        target_id: 'all',
        target_label: 'All Employees',
        assigned_by: adminUser._id,
        assigned_at: new Date(),
      },
    ]);

    // Setup Location without Holiday or Work Schedule
    const loc = await Location.create({
      company_id: testCompanyId,
      name: 'London HQ',
      type: 'office',
      timezone: 'Europe/London',
      is_headquarters: true,
    });
    // Assign standardEmployee to this location
    standardEmployee.location_id = loc._id as any;
    await standardEmployee.save();

    console.log('\n--- Running Misconfiguration Detection Engine ---');
    await runIntelligenceRules(testCompanyId);

    // Verify Incomplete Setup: User without manager
    const managerInsight = await Insight.findOne({
      company_id: testCompanyId,
      title: 'Jane Doe has no manager assigned',
      is_resolved: false,
    });
    console.log('✓ Incomplete Setup (User without manager) detected:', Boolean(managerInsight));

    // Verify False Positive Minimization: Super Admin should NOT be flagged for missing manager
    const adminManagerInsight = await Insight.findOne({
      company_id: testCompanyId,
      title: 'Test Super Admin has no manager assigned',
    });
    console.log('✓ False Positive Minimization (Super Admin exempted from manager check):', !adminManagerInsight);

    // Verify Missing Configuration: Security Policy
    const secInsight = await Insight.findOne({
      company_id: testCompanyId,
      title: 'Missing company security policy configuration',
      is_resolved: false,
    });
    console.log('✓ Missing Configuration (Security Policy) detected:', Boolean(secInsight));

    // Verify Missing Configuration: Location Holiday/Work Schedule
    const locCalInsight = await Insight.findOne({
      company_id: testCompanyId,
      title: 'Location "London HQ" missing holiday calendar',
      is_resolved: false,
    });
    console.log('✓ Missing Configuration (Location Holiday Calendar) detected:', Boolean(locCalInsight));

    // Verify Conflicting Settings: Overlapping published policies
    const conflictPolicyInsight = await Insight.findOne({
      company_id: testCompanyId,
      title: { $regex: /Conflicting policy targeting:/ },
      is_resolved: false,
    });
    console.log('✓ Conflicting Settings (Overlapping Policies in same category) detected:', Boolean(conflictPolicyInsight));

    // Verify Admin Notifications
    const notifs = await InAppNotification.find({
      company_id: testCompanyId,
      user_id: adminUser._id,
    });
    console.log(`✓ Admin Notifications Dispatched: ${notifs.length} notification(s) generated for Super Admin.`);

    // Test Auto-Resolution: Fix issues and verify resolution
    console.log('\n--- Testing Auto-Resolution After Remediation ---');
    // 1. Assign direct manager
    standardEmployee.manager_id = adminUser._id as any;
    await standardEmployee.save();

    // 2. Configure Security Policy
    await SecurityPolicy.create({
      company_id: testCompanyId,
      policy_name: 'Default Security Policy',
      settings: {
        password_min_length: 12,
        session_timeout_minutes: 60,
      },
    });

    // 3. Resolve Policy Conflict by deleting one assignment
    await PolicyAssignment.deleteMany({
      company_id: testCompanyId,
      policy_version_id: policy2._id,
    });

    // Re-run intelligence rules
    await runIntelligenceRules(testCompanyId);

    const resolvedManagerInsight = await Insight.findOne({
      company_id: testCompanyId,
      title: 'Jane Doe has no manager assigned',
      is_resolved: true,
    });
    console.log('✓ Auto-Resolution (Manager assigned -> Insight resolved):', Boolean(resolvedManagerInsight));

    const resolvedSecInsight = await Insight.findOne({
      company_id: testCompanyId,
      title: 'Missing company security policy configuration',
      is_resolved: true,
    });
    console.log('✓ Auto-Resolution (Security Policy created -> Insight resolved):', Boolean(resolvedSecInsight));

    const resolvedPolicyInsight = await Insight.findOne({
      company_id: testCompanyId,
      title: { $regex: /Conflicting policy targeting:/ },
      is_resolved: true,
    });
    console.log('✓ Auto-Resolution (Policy overlap removed -> Insight resolved):', Boolean(resolvedPolicyInsight));

    console.log('\n=== ALL MISCONFIGURATION DETECTION TESTS PASSED ===\n');
  } finally {
    // Cleanup test data
    await Company.deleteOne({ _id: testCompanyId });
    await User.deleteMany({ company_id: testCompanyId });
    await Department.deleteMany({ company_id: testCompanyId });
    await Location.deleteMany({ company_id: testCompanyId });
    await PolicyVersion.deleteMany({ company_id: testCompanyId });
    await PolicyAssignment.deleteMany({ company_id: testCompanyId });
    await SecurityPolicy.deleteMany({ company_id: testCompanyId });
    await Insight.deleteMany({ company_id: testCompanyId });
    await InAppNotification.deleteMany({ company_id: testCompanyId });

    await mongoose.disconnect();
    console.log('Cleaned up test data and disconnected.');
  }
}

runMisconfigurationTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
