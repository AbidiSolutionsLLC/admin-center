// server/src/models/PolicyVersion.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type PolicyCategory = 'hr' | 'it' | 'security' | 'compliance' | 'operations' | 'other';
export type PolicyStatus = 'draft' | 'published' | 'archived';

export interface IPolicyVersion extends Document {
  company_id: Types.ObjectId;
  policy_key: string;             // Unique identifier for the policy (e.g., 'remote-work-policy')
  title: string;
  content: string;                // Full policy text (Markdown or HTML)
  version_number: number;         // Auto-incremented per policy_key
  status: PolicyStatus;
  category: PolicyCategory;
  effective_date: Date;
  published_by?: Types.ObjectId;  // User who published this version
  published_at?: Date;
  summary?: string;               // Brief description of changes in this version
  custom_fields: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const PolicyVersionSchema = new Schema<IPolicyVersion>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  policy_key: { type: String, required: true, index: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  version_number: { type: Number, required: true, default: 1 },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  category: { type: String, enum: ['hr', 'it', 'security', 'compliance', 'operations', 'other'], required: true },
  effective_date: { type: Date, required: true },
  published_by: { type: Schema.Types.ObjectId, ref: 'User' },
  published_at: { type: Date },
  summary: { type: String },
  custom_fields: { type: Schema.Types.Mixed, default: {} },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// ── Indexes ──────────────────────────────────────────────────────────────────
// Compound index for querying policy versions by company + policy key
PolicyVersionSchema.index({ company_id: 1, policy_key: 1, version_number: 1 }, { unique: true });
// Index for filtering by company + status
PolicyVersionSchema.index({ company_id: 1, status: 1 });
// Index for filtering by company + category
PolicyVersionSchema.index({ company_id: 1, category: 1 });
// Index for sorting by creation date
PolicyVersionSchema.index({ company_id: 1, created_at: -1 });

// ── Immutability Guard: No UPDATE or DELETE on published versions ────────────
/**
 * PolicyVersion is immutable once published.
 * This pre-save hook prevents modifications to any document with status='published'.
 * New versions should be created instead of updating existing ones.
 */
PolicyVersionSchema.pre('save', function(next: any) {
  if (this.isModified() && !this.isNew && this.status === 'published') {
    const error = new Error('Cannot modify published policy version. Create a new version instead.');
    return next(error);
  }
  next();
});

// Prevent updates via Mongoose middleware
PolicyVersionSchema.pre('updateOne', function(next: any) {
  const filter = this.getFilter();
  if (filter.status === 'published') {
    const error = new Error('Cannot update published policy version. Create a new version instead.');
    return next(error);
  }
  next();
});

PolicyVersionSchema.pre('findOneAndUpdate', function(next: any) {
  const filter = this.getFilter();
  if (filter.status === 'published') {
    const error = new Error('Cannot update published policy version. Create a new version instead.');
    return next(error);
  }
  next();
});

PolicyVersionSchema.pre('updateMany', function(next: any) {
  const filter = this.getFilter();
  if (filter.status === 'published') {
    const error = new Error('Cannot update published policy version. Create a new version instead.');
    return next(error);
  }
  next();
});

export const PolicyVersion = model<IPolicyVersion>('PolicyVersion', PolicyVersionSchema);
