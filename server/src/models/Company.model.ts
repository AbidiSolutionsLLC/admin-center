// server/src/models/Company.model.ts
import { Schema, model, Document } from 'mongoose';
import { slugify } from '../utils/slugify';
import { validateEmployeeIdFormat } from '../services/employeeId';

export interface ICompany extends Document {
  name: string;
  slug: string;
  logo_url?: string;
  domain?: string;
  employee_id_format: string;       // e.g. 'EMP-{counter:5}'
  employee_id_counter: number;
  setup_progress: {
    org: boolean;
    users: boolean;
    roles: boolean;
    apps: boolean;
    security: boolean;
  };
  settings: {
    required_user_fields: string[];  // Fields that must be filled when creating/updating a user
    employee_id_format: string;       // Format for auto-generated employee IDs
    allowed_domains: string[];        // Allowed email domains (e.g. ["@company.com", "company.org"])
    is_domain_enforcement_active: boolean; // Whether to enforce domain restrictions
  };
  plan: 'free' | 'starter' | 'pro';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const CompanySchema = new Schema<ICompany>({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  logo_url: String,
  domain: String,
  employee_id_format: {
    type: String,
    default: 'EMP-{counter:5}',
    maxlength: [50, 'employee_id_format must be 50 characters or fewer'], // FIX-12: Max length guard
    validate: {
      validator: (v: string) => validateEmployeeIdFormat(v).valid,
      message: 'employee_id_format must contain a valid format with {counter:N} and allowed tokens.',
    },
  },
  employee_id_counter: { type: Number, default: 0 },
  setup_progress: {
    org: { type: Boolean, default: false },
    users: { type: Boolean, default: false },
    roles: { type: Boolean, default: false },
    apps: { type: Boolean, default: false },
    security: { type: Boolean, default: false },
  },
  settings: {
    required_user_fields: { 
      type: [String], 
      default: ['email', 'full_name'] 
    },
    employee_id_format: { type: String, default: 'EMP-####' },
    allowed_domains: { 
      type: [String], 
      default: [] 
    },
    is_domain_enforcement_active: { 
      type: Boolean, 
      default: false 
    }
  },
  plan: { type: String, enum: ['free', 'starter', 'pro'], default: 'free' },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Auto-generate slug from name if modified
CompanySchema.pre('validate', function() {
  if (this.isModified('name') && this.name && !this.slug) {
    this.slug = slugify(this.name);
  }
});

export const Company = model<ICompany>('Company', CompanySchema);
