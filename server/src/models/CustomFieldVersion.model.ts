// server/src/models/CustomFieldVersion.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type VersionChangeType = 'created' | 'updated' | 'deleted' | 'restored';

export interface ICustomFieldVersion extends Document {
  company_id: Types.ObjectId;
  field_id: Types.ObjectId;
  version_number: number;
  change_type: VersionChangeType;
  snapshot: Record<string, unknown>;
  changed_by: Types.ObjectId;
  change_summary?: string;
  created_at: Date;
}

const CustomFieldVersionSchema = new Schema<ICustomFieldVersion>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  field_id: { type: Schema.Types.ObjectId, ref: 'CustomField', required: true, index: true },
  version_number: { type: Number, required: true },
  change_type: {
    type: String,
    enum: ['created', 'updated', 'deleted', 'restored'],
    required: true,
  },
  snapshot: { type: Schema.Types.Mixed, required: true },
  changed_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  change_summary: String,
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

CustomFieldVersionSchema.index({ company_id: 1, field_id: 1, version_number: -1 });
CustomFieldVersionSchema.index({ company_id: 1, field_id: 1, created_at: -1 });

export const CustomFieldVersion = model<ICustomFieldVersion>('CustomFieldVersion', CustomFieldVersionSchema);
