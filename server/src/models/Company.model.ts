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
    timezone: string;                 // Company default timezone (e.g. 'America/New_York')
    locale: string;                   // Company locale (e.g. 'en-US')
    default_location_id?: string;     // Default location for users without location assignment
    audit_log_retention_days: number; // 0 for infinite, otherwise days to retain
    insight_sensitivity: 'low' | 'medium' | 'high'; // low: critical/high, medium: +medium, high: all
    ip_restrictions_enabled: boolean; // Enable/disable IP-based access restrictions globally
  };
  plan: string; // operator plan key (Plan.key); legacy values free/starter/pro remain valid
  /** 04 §2 - written only by operator realm or seed; kept in sync with legacy is_active */
  status: 'provisioning' | 'active' | 'suspended' | 'closed';
  is_active: boolean;
  /** Operator tags (Plan 4.3): at most 10, each at most 30 characters. */
  tags: string[];
  /** Informational plus a signal; nothing is suspended automatically (DRD 3.2 rule 7). */
  trial_ends_at?: Date | null;
  /** Set at sign-in, at most once per hour per tenant (`recordLoginSuccess`). */
  last_activity_at?: Date;
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
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    locale: {
      type: String,
      default: 'en-US',
    },
    default_location_id: {
      type: String,
      default: null,
    },
    audit_log_retention_days: {
      type: Number,
      default: 0,
    },
    insight_sensitivity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    ip_restrictions_enabled: {
      type: Boolean,
      default: false,
    },
  },
  plan: { type: String, default: 'free' },
  status: { type: String, enum: ['provisioning', 'active', 'suspended', 'closed'], default: 'active' },
  is_active: { type: Boolean, default: true },
  tags: {
    type: [{ type: String, trim: true, maxlength: [30, 'A tag must be 30 characters or fewer'] }],
    default: [],
    validate: { validator: (v: string[]) => v.length <= 10, message: 'A tenant can have at most 10 tags' },
  },
  trial_ends_at: { type: Date, default: null },
  last_activity_at: Date,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

CompanySchema.index({ status: 1, created_at: -1 });
CompanySchema.index({ plan: 1 });
CompanySchema.index({ tags: 1 });
CompanySchema.index({ trial_ends_at: 1 }, { sparse: true });

// Auto-generate slug from name if modified
CompanySchema.pre('validate', function() {
  if (this.isModified('name') && this.name && !this.slug) {
    this.slug = slugify(this.name);
  }
});

export const Company = model<ICompany>('Company', CompanySchema);
