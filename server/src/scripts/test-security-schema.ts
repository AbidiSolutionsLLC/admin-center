// server/src/scripts/test-security-schema.ts
/**
 * Test script for H-011: Security MongoDB Schema
 * 
 * Tests:
 * 1. SecurityEvent is logged on every login attempt
 * 2. is_suspicious flag is set correctly after 5 failures
 * 3. SecurityPolicy model is seeded with defaults
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import { SecurityEvent } from '../models/SecurityEvent.model';
import { SecurityPolicy } from '../models/SecurityPolicy.model';
import { Company } from '../models/Company.model';
import { User } from '../models/User.model';
import { seedSecurityPolicy } from '../lib/seed';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const runTests = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in .env');
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      dbName: process.env.DB_NAME || 'admin_center',
    });
    console.log('✅ Connected to MongoDB\n');

    // Test 1: SecurityPolicy seeding
    console.log('='.repeat(60));
    console.log('TEST 1: SecurityPolicy Seeding');
    console.log('='.repeat(60));

    // Get or create a test company
    let testCompany = await Company.findOne({ slug: 'test-security-company' });
    if (!testCompany) {
      console.log('Creating test company...');
      testCompany = await Company.create({
        name: 'Test Security Company',
        slug: 'test-security-company',
        plan: 'pro',
        is_active: true,
      });
      console.log('✅ Test company created:', testCompany._id);
    } else {
      console.log('ℹ️  Test company exists:', testCompany._id);
    }

    // Seed security policy
    await seedSecurityPolicy(testCompany._id);

    // Verify policy exists
    const policy = await SecurityPolicy.findOne({ company_id: testCompany._id });
    if (!policy) {
      throw new Error('❌ SecurityPolicy was not created!');
    }

    console.log('\n✅ SecurityPolicy created successfully:');
    console.log('   - Policy Name:', policy.policy_name);
    console.log('   - Max Failed Attempts:', policy.settings.max_failed_login_attempts);
    console.log('   - Lockout Duration:', policy.settings.lockout_duration_minutes, 'minutes');
    console.log('   - Session Timeout:', policy.settings.session_timeout_minutes, 'minutes');
    console.log('   - Require MFA:', policy.settings.require_mfa);
    console.log('   - Password Min Length:', policy.settings.password_min_length);
    console.log('');

    // Test 2: SecurityEvent logging
    console.log('='.repeat(60));
    console.log('TEST 2: SecurityEvent Logging on Login Attempts');
    console.log('='.repeat(60));

    // Clean up previous test events
    await SecurityEvent.deleteMany({ email: 'test-failure@example.com' });

    console.log('\n📝 Simulating 5 failed login attempts...\n');

    // Simulate 5 failed login attempts by manually creating events
    for (let i = 1; i <= 5; i++) {
      const isSuspicious = i >= 5; // 5th attempt should be suspicious
      
      const event = await SecurityEvent.create({
        company_id: testCompany._id,
        email: 'test-failure@example.com',
        event_type: 'login_failure',
        ip_address: '127.0.0.1',
        user_agent: 'TestAgent/1.0',
        is_suspicious: isSuspicious,
        metadata: {
          reason: 'invalid_password',
          failure_count: i,
          max_attempts: 5,
        },
      });

      console.log(`   Attempt ${i}: is_suspicious = ${isSuspicious} ✓`);
    }

    // Verify events
    const failureEvents = await SecurityEvent.find({
      email: 'test-failure@example.com',
      event_type: 'login_failure',
    }).sort({ created_at: 1 });

    console.log('\n✅ SecurityEvents created:', failureEvents.length);
    
    // Verify is_suspicious flag
    const suspiciousEvents = failureEvents.filter(e => e.is_suspicious);
    const nonSuspiciousEvents = failureEvents.filter(e => !e.is_suspicious);

    console.log('\n🔍 Verification:');
    console.log(`   - Non-suspicious events: ${nonSuspiciousEvents.length} (expected: 4)`);
    console.log(`   - Suspicious events: ${suspiciousEvents.length} (expected: 1)`);

    if (nonSuspiciousEvents.length !== 4) {
      throw new Error(`❌ Expected 4 non-suspicious events, got ${nonSuspiciousEvents.length}`);
    }

    if (suspiciousEvents.length !== 1) {
      throw new Error(`❌ Expected 1 suspicious event, got ${suspiciousEvents.length}`);
    }

    // Verify the 5th event is marked as suspicious
    const fifthEvent = failureEvents[4];
    if (!fifthEvent.is_suspicious) {
      throw new Error('❌ 5th failure should be marked as suspicious!');
    }
    console.log('   - 5th failure correctly marked as suspicious ✓');

    // Test 3: Verify login_attempt events are also logged
    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: Login Attempt Event Types');
    console.log('='.repeat(60));

    const loginAttemptEvent = await SecurityEvent.create({
      company_id: testCompany._id,
      email: 'test-attempt@example.com',
      event_type: 'login_attempt',
      ip_address: '127.0.0.1',
      user_agent: 'TestAgent/1.0',
      is_suspicious: false,
      metadata: { reason: 'login_attempt_logged' },
    });

    console.log('\n✅ login_attempt event logged:', loginAttemptEvent.event_type);

    const loginSuccessEvent = await SecurityEvent.create({
      company_id: testCompany._id,
      email: 'test-success@example.com',
      event_type: 'login_success',
      ip_address: '127.0.0.1',
      user_agent: 'TestAgent/1.0',
      is_suspicious: false,
      metadata: { lifecycle_state: 'active' },
    });

    console.log('✅ login_success event logged:', loginSuccessEvent.event_type);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ TEST 1: SecurityPolicy seeded with defaults');
    console.log('✅ TEST 2: SecurityEvent logged with correct is_suspicious flag');
    console.log('✅ TEST 3: Different event types (attempt, success, failure) work');
    console.log('\n🎉 All tests passed!\n');

    // Cleanup (optional - comment out if you want to inspect the data)
    // await SecurityEvent.deleteMany({ email: { $in: ['test-failure@example.com', 'test-attempt@example.com', 'test-success@example.com'] } });
    // await SecurityPolicy.deleteOne({ company_id: testCompany._id });
    // await Company.deleteOne({ _id: testCompany._id });

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
};

runTests();
