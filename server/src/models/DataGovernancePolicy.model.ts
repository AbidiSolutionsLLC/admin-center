import { Schema, model, Document, Types } from 'mongoose';

export type Granularity = 'row' | 'column';

export interface IDataGovernancePolicy extends Document {
  company_id: Types.ObjectId;
  name: string;
  description: string;
  is_active: boolean;
  resource: string; // The data model (e.g., 'Employee', 'Salary')
  granularity: Granularity;
  rules: {
    fields?: string[]; // Used if granularity is 'column' (e.g. ['ssn', 'salary'])
    condition?: Record<string, any>; // Used if granularity is 'row'
    action: 'mask' | 'hide' | 'encrypt';
    mask_pattern?: string; // Optional mask pattern, e.g., '***-**-####'
  }[];
  applied_to: {
    roles?: Types.ObjectId[];
    departments?: Types.ObjectId[];
  };
  created_at: Date;
  updated_at: Date;
}

const DataGovernancePolicySchema = new Schema<IDataGovernancePolicy>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  is_active: { type: Boolean, default: true },
  resource: { type: String, required: true },
  granularity: { type: String, enum: ['row', 'column'], required: true },
  rules: [{
    fields: [String],
    condition: Schema.Types.Mixed,
    action: { type: String, enum: ['mask', 'hide', 'encrypt'], required: true },
    mask_pattern: String
  }],
  applied_to: {
    roles: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
    departments: [{ type: Schema.Types.ObjectId, ref: 'Department' }]
  }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

DataGovernancePolicySchema.index({ company_id: 1, name: 1 }, { unique: true });

export const DataGovernancePolicy = model<IDataGovernancePolicy>('DataGovernancePolicy', DataGovernancePolicySchema);
