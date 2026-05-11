// server/src/scripts/seed-demo-apps.ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { Company, User, App } from '../models';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function seedDemoApps() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI is not defined in .env');

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, { dbName: process.env.DB_NAME ?? 'admin_center' });
    console.log('✅ Connected successfully.');

    // Find Company
    const company = await Company.findOne({ name: 'Abidi Solutions LLC' });
    if (!company) throw new Error('Company "Abidi Solutions LLC" not found. Run seed-first-user.ts first.');
    const companyId = company._id;

    // Find Super Admin User
    const superAdmin = await User.findOne({ email: 'tsaleem@abidisolutions.com' });
    if (!superAdmin) throw new Error('Super Admin user not found. Run seed-first-user.ts first.');
    const ownerId = superAdmin._id;

    // Clear existing apps
    console.log('🗑️ Clearing existing apps...');
    await App.deleteMany({});

    console.log('🌱 Seeding premium demo apps...');

    const appsData = [
      {
        name: 'Slack',
        slug: 'slack',
        description: 'Real-time team communication, channels, and instant messaging.',
        category: 'utilities',
        status: 'active',
        owner_id: ownerId,
        dependencies: [],
        is_system_app: true,
        is_active: true,
      },
      {
        name: 'GitHub',
        slug: 'github',
        description: 'Collaborative code hosting, pull requests, and version control repository.',
        category: 'engineering',
        status: 'active',
        company_id: companyId,
        owner_id: ownerId,
        dependencies: ['slack'],
        is_system_app: false,
        is_active: true,
      },
      {
        name: 'Jira Software',
        slug: 'jira',
        description: 'Issue tracking, agile project management, sprint planning, and bug tracking.',
        category: 'engineering',
        status: 'active',
        company_id: companyId,
        owner_id: ownerId,
        dependencies: ['slack'],
        is_system_app: false,
        is_active: true,
      },
      {
        name: 'AWS Cloud Console',
        slug: 'aws',
        description: 'Amazon Web Services cloud computing resource management and billing controller.',
        category: 'security',
        status: 'maintenance',
        company_id: companyId,
        owner_id: ownerId,
        dependencies: ['github'],
        is_system_app: false,
        is_active: true,
      },
      {
        name: 'Figma Design',
        slug: 'figma',
        description: 'Collaborative cloud-based UI/UX vector graphics editor and prototyping tool.',
        category: 'hr',
        status: 'active',
        company_id: companyId,
        owner_id: ownerId,
        dependencies: [],
        is_system_app: false,
        is_active: true,
      }
    ];

    await App.create(appsData);
    console.log('🎉 Seeded 5 premium demo apps successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed demo apps:', error);
    process.exit(1);
  }
}

seedDemoApps();
