import { Schema, model, Document, Types } from 'mongoose';

export type IpRestrictionTargetType = 'portal' | 'all_apps' | 'app';
export type SubjectType = 'all_users' | 'user' | 'group' | 'role' | 'department';

export interface IIpRestriction extends Document {
  company_id: Types.ObjectId;
  label: string;
  ip_address: string; // CIDR or exact IP
  target_type: IpRestrictionTargetType;
  target_id?: Types.ObjectId; // Only if target_type is 'app'
  target_label?: string; // App name for convenience
  subject_type: SubjectType;
  subject_id?: Types.ObjectId; // ID of the specific user, group, role, or department
  subject_label?: string;      // Denormalized name (e.g., "Contractors Group") for UI performance
  is_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

const IpRestrictionSchema = new Schema<IIpRestriction>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  label: { type: String, required: true },
  ip_address: { type: String, required: true },
  target_type: { 
    type: String, 
    enum: ['portal', 'all_apps', 'app'], 
    required: true 
  },
  target_id: { type: Schema.Types.ObjectId, ref: 'App' },
  target_label: { type: String },
  subject_type: {
    type: String,
    enum: ['all_users', 'user', 'group', 'role', 'department'],
    required: true,
    default: 'all_users'
  },
  subject_id: { type: Schema.Types.ObjectId },
  subject_label: { type: String },
  is_enabled: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Quick lookups
IpRestrictionSchema.index({ company_id: 1, target_type: 1 });
IpRestrictionSchema.index({ company_id: 1, is_enabled: 1 });

export const IpRestriction = model<IIpRestriction>('IpRestriction', IpRestrictionSchema);
