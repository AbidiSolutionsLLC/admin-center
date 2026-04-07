// server/src/models/Insight.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IInsight extends Document {
  company_id: Types.ObjectId | string;
  category: 'health' | 'misconfiguration' | 'recommendation' | 'data_consistency';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  reasoning?: string;
  affected_object_type?: string;
  affected_object_id?: string;
  affected_object_label?: string;
  remediation_url?: string;
  remediation_action?: string;
  is_resolved: boolean;
  detected_at: Date;
  resolved_at?: Date;
}

const InsightSchema = new Schema<IInsight>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  category: { 
    type: String, 
    enum: ['health', 'misconfiguration', 'recommendation', 'data_consistency'], 
    required: true 
  },
  severity: { 
    type: String, 
    enum: ['critical', 'warning', 'info'], 
    required: true,
    index: true
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  reasoning: { type: String },
  affected_object_type: { type: String },
  affected_object_id: { type: String },
  affected_object_label: { type: String },
  remediation_url: { type: String },
  remediation_action: { type: String },
  is_resolved: { type: Boolean, default: false, index: true },
  detected_at: { type: Date, default: Date.now },
  resolved_at: { type: Date },
}, { timestamps: false });

// Compound index for efficient querying of active insights by company and severity
InsightSchema.index({ company_id: 1, is_resolved: 1, severity: 1 });

// Index for querying insights by affected object
InsightSchema.index({ company_id: 1, affected_object_id: 1, is_resolved: 1 });

export const Insight = model<IInsight>('Insight', InsightSchema);
