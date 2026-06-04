import { Schema, model, Document, Types } from 'mongoose';
import { PolicyCategory } from './PolicyVersion.model';

export interface IPolicyTemplate extends Document {
  company_id: Types.ObjectId; // Nullable if system-wide template
  name: string;
  description: string;
  category: PolicyCategory;
  default_content: string;
  variables: string[]; // e.g., ['COMPANY_NAME', 'EFFECTIVE_DATE']
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const PolicyTemplateSchema = new Schema<IPolicyTemplate>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  category: { type: String, enum: ['hr', 'it', 'security', 'compliance', 'operations', 'other'], required: true },
  default_content: { type: String, required: true },
  variables: [{ type: String }],
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Company ID and name should be unique
PolicyTemplateSchema.index({ company_id: 1, name: 1 }, { unique: true });

export const PolicyTemplate = model<IPolicyTemplate>('PolicyTemplate', PolicyTemplateSchema);
