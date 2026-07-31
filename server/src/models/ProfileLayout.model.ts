// server/src/models/ProfileLayout.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IProfileLayoutField {
  field_id: Types.ObjectId;
  display_order: number;
  is_visible: boolean;
  is_editable: boolean;
}

export interface IProfileLayout extends Document {
  company_id: Types.ObjectId;
  target_object: 'user' | 'department' | 'policy';
  role_id?: Types.ObjectId;
  name: string;
  fields: IProfileLayoutField[];
  is_default: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const ProfileLayoutFieldSchema = new Schema<IProfileLayoutField>({
  field_id: { type: Schema.Types.ObjectId, ref: 'CustomField', required: true },
  display_order: { type: Number, required: true },
  is_visible: { type: Boolean, default: true },
  is_editable: { type: Boolean, default: true },
}, { _id: false });

const ProfileLayoutSchema = new Schema<IProfileLayout>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  target_object: {
    type: String,
    enum: ['user', 'department', 'policy'],
    required: true,
  },
  role_id: { type: Schema.Types.ObjectId, ref: 'Role' },
  name: { type: String, required: true },
  fields: [ProfileLayoutFieldSchema],
  is_default: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

ProfileLayoutSchema.index({ company_id: 1, target_object: 1, role_id: 1 }, { unique: true, sparse: true });

export const ProfileLayout = model<IProfileLayout>('ProfileLayout', ProfileLayoutSchema);
