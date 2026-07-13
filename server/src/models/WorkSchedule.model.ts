// server/src/models/WorkSchedule.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IWorkSchedule extends Document {
  company_id: Types.ObjectId;
  name: string;
  description?: string;
  timezone: string;
  working_days: number[];
  working_hours: {
    start: string;
    end: string;
  };
  break_hours?: {
    start: string;
    end: string;
  };
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const WorkScheduleSchema = new Schema<IWorkSchedule>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  description: String,
  timezone: { type: String, required: true, default: 'UTC' },
  working_days: { type: [Number], required: true, default: [1, 2, 3, 4, 5] },
  working_hours: {
    start: { type: String, required: true },
    end: { type: String, required: true },
  },
  break_hours: {
    start: String,
    end: String,
  },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

WorkScheduleSchema.index({ company_id: 1, name: 1 });
WorkScheduleSchema.index({ company_id: 1, is_active: 1 });

export const WorkSchedule = model<IWorkSchedule>('WorkSchedule', WorkScheduleSchema);
