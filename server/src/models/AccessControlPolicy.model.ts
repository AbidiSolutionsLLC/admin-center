import { Schema, model, Document, Types } from 'mongoose';

export type Effect = 'allow' | 'deny';

export interface IAccessControlPolicy extends Document {
  company_id: Types.ObjectId;
  name: string;
  description: string;
  is_active: boolean;
  effect: Effect;
  subjects: {
    users?: Types.ObjectId[];
    roles?: Types.ObjectId[];
    departments?: Types.ObjectId[];
    locations?: Types.ObjectId[];
  };
  resources: string[]; // e.g., 'Document', 'FinancialReport', 'User'
  actions: string[]; // e.g., 'read', 'write', 'delete'
  conditions?: Record<string, any>; // ABAC style conditions (e.g., { "location": "US" })
  priority: number; // For conflict resolution, higher number wins
  created_at: Date;
  updated_at: Date;
}

const AccessControlPolicySchema = new Schema<IAccessControlPolicy>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  is_active: { type: Boolean, default: true },
  effect: { type: String, enum: ['allow', 'deny'], required: true },
  subjects: {
    users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    roles: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
    departments: [{ type: Schema.Types.ObjectId, ref: 'Department' }],
    locations: [{ type: Schema.Types.ObjectId, ref: 'Location' }]
  },
  resources: [{ type: String, required: true }],
  actions: [{ type: String, required: true }],
  conditions: { type: Schema.Types.Mixed, default: {} },
  priority: { type: Number, default: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

AccessControlPolicySchema.index({ company_id: 1, name: 1 }, { unique: true });

export const AccessControlPolicy = model<IAccessControlPolicy>('AccessControlPolicy', AccessControlPolicySchema);
