import { Schema, model, Document, Types } from 'mongoose';

export interface IGroup extends Document {
  company_id: Types.ObjectId;
  name: string;
  description?: string;
  type: 'static' | 'dynamic';
  dynamic_rules?: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const GroupSchema = new Schema<IGroup>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['static', 'dynamic'], default: 'static' },
  dynamic_rules: { type: Schema.Types.Mixed },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Prevent duplicate group names within the same company (case-insensitive indexing usually done at query level, but we can do a normal index here)
GroupSchema.index({ company_id: 1, name: 1 }, { unique: true });

export const Group = model<IGroup>('Group', GroupSchema);
