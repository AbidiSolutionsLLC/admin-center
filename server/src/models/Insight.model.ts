// server/src/models/Insight.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low';
export type InsightCategory = 'health' | 'misconfiguration' | 'recommendation' | 'data_consistency';
export type InsightArea = 'Identity' | 'Access' | 'Workflow' | 'Organization' | 'Security' | 'Configuration' | string;

export interface IInsight extends Document {
  company_id: Types.ObjectId | string;
  category: InsightCategory;
  severity: InsightSeverity;
  affected_area?: InsightArea;
  title: string;
  description: string;
  reasoning?: string;
  affected_object_type?: string;
  affected_object_id?: string;
  affected_object_label?: string;
  remediation_url?: string;
  remediation_action?: string;
  auto_fix_available?: boolean;
  auto_fix_action?: string;
  auto_fix_payload?: any;
  recommendations?: Array<{
    action: string;
    url: string;
  }>;
  is_resolved: boolean;
  is_dismissed: boolean;
  detected_at: Date;
  resolved_at?: Date;
  dismissed_at?: Date;
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
    enum: ['critical', 'high', 'medium', 'low'], 
    required: true,
    index: true
  },
  affected_area: {
    type: String,
    enum: ['Identity', 'Access', 'Workflow', 'Organization', 'Security', 'Configuration', 'General'],
    default: 'General',
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
  auto_fix_available: { type: Boolean, default: false },
  auto_fix_action: { type: String },
  auto_fix_payload: { type: Schema.Types.Mixed },
  recommendations: [{
    action: { type: String, required: true },
    url: { type: String, required: true }
  }],
  is_resolved: { type: Boolean, default: false, index: true },
  is_dismissed: { type: Boolean, default: false, index: true },
  detected_at: { type: Date, default: Date.now },
  resolved_at: { type: Date },
  dismissed_at: { type: Date },
}, { timestamps: false });

// Compound index for efficient querying of active insights by company and severity
InsightSchema.index({ company_id: 1, is_resolved: 1, severity: 1 });

// Compound index for querying insights by affected area
InsightSchema.index({ company_id: 1, affected_area: 1, is_resolved: 1 });

// Index for querying insights by affected object
InsightSchema.index({ company_id: 1, affected_object_id: 1, is_resolved: 1 });

export const Insight = model<IInsight>('Insight', InsightSchema);

