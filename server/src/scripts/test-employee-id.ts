import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { Company } from '../models/Company.model';
import { User } from '../models/User.model';
import { validateEmployeeIdFormat, generateEmployeeId } from '../services/employeeId';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required in .env');
  }

  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(mongoUri, {
    dbName: process.env.DB_NAME || 'admin_center',
  });
  console.log('✅ Connected to MongoDB');

  const slug = 'employee-id-test';
  let company = await Company.findOneAndUpdate(
    { slug },
    {
      name: 'Employee ID Test Company',
      slug,
      employee_id_format: 'EMP-{counter:5}',
      employee_id_counter: 0,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log(`🏢 Using company: ${company.name} (${company._id})`);

  const persist = async () => {
    const email = `employee-id-test-${crypto.randomBytes(4).toString('hex')}@example.com`;
    const user = await User.create({
      company_id: company._id,
      full_name: 'Employee ID Test User',
      email,
      password_hash: crypto.randomBytes(16).toString('hex'),
      role: 'Employee',
      lifecycle_state: 'invited',
      is_active: false,
    } as any);
    return user;
  };

  console.log('▶️ Testing format validation...');
  const validResult = validateEmployeeIdFormat('EMP-{YYYY}-{counter:4}');
  if (!validResult.valid) {
    throw new Error(`Expected valid format, got errors: ${validResult.errors.map((e) => e.message).join('; ')}`);
  }

  const validSevenDigitResult = validateEmployeeIdFormat('EMP-{counter:7}');
  if (!validSevenDigitResult.valid) {
    throw new Error(`Expected valid 7-digit counter format, got errors: ${validSevenDigitResult.errors.map((e) => e.message).join('; ')}`);
  }

  const invalidResult = validateEmployeeIdFormat('EMP-$COUNTER:4');
  if (invalidResult.valid) {
    throw new Error('Expected invalid format to fail validation.');
  }
  console.log('   ✓ Format validation passes for valid patterns and rejects invalid tokens.');

  console.log('▶️ Testing ID generation from format...');
  const generated = generateEmployeeId('EMP-{YYYY}-{counter:4}', {
    date: new Date('2026-04-14T00:00:00Z'),
    company: { name: 'Test Corp', code: 'TST' },
    user: { department: 'Engineering', departmentCode: 'ENG', location: 'NYC', jobTitle: 'Developer' },
    counter: 12,
  });

  if (generated !== 'EMP-2026-0012') {
    throw new Error(`Unexpected generated ID: ${generated}`);
  }
  console.log('   ✓ Token generation works correctly: ', generated);

  const generatedSevenDigit = generateEmployeeId('EMP-{counter:7}', {
    date: new Date('2026-04-14T00:00:00Z'),
    company: { name: 'Test Corp', code: 'TST' },
    user: { department: 'Engineering', departmentCode: 'ENG', location: 'NYC', jobTitle: 'Developer' },
    counter: 12,
  });

  if (generatedSevenDigit !== 'EMP-0000012') {
    throw new Error(`Unexpected generated 7-digit ID: ${generatedSevenDigit}`);
  }
  console.log('   ✓ 7-digit counter generation works correctly: ', generatedSevenDigit);

  console.log('▶️ Testing atomic user creation and counter increment...');
  const testUser1 = await persist();
  company = await Company.findById(company._id).orFail();
  if (testUser1.employee_id !== 'EMP-00001') {
    throw new Error(`Expected first user employee_id EMP-00001, got ${testUser1.employee_id}`);
  }
  if (company.employee_id_counter !== 1) {
    throw new Error(`Expected company counter 1 after first user, got ${company.employee_id_counter}`);
  }
  console.log('   ✓ First user assigned EMP-00001 and counter advanced to 1.');

  const testUser2 = await persist();
  company = await Company.findById(company._id).orFail();
  if (testUser2.employee_id !== 'EMP-00002') {
    throw new Error(`Expected second user employee_id EMP-00002, got ${testUser2.employee_id}`);
  }
  if (company.employee_id_counter !== 2) {
    throw new Error(`Expected company counter 2 after second user, got ${company.employee_id_counter}`);
  }
  console.log('   ✓ Second user assigned EMP-00002 and counter advanced to 2.');

  console.log('✅ Employee ID generation tests passed successfully.');
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error('❌ Employee ID test failed:', error);
  process.exit(1);
});
