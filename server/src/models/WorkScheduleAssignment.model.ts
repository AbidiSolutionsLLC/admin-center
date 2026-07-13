// server/src/models/WorkScheduleAssignment.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IWorkScheduleAssignment extends Document {
  company_id: Types.ObjectId;
  location_id: Types.ObjectId;
  work_schedule_id: Types.ObjectId;
  is_primary: boolean;
  effective_date: Date;
  expiry_date?: Date;
  created_at: Date;
  updated_at: Date;
}

const WorkScheduleAssignmentSchema = new Schema<IWorkScheduleAssignment>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  location_id: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
  work_schedule_id: { type: Schema.Types.ObjectId, ref: 'WorkSchedule', required: true, index: true },
  is_primary: { type: Boolean, default: false },
  effective_date: { type: Date, default: Date.now },
  expiry_date: Date,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

WorkScheduleAssignmentSchema.index({ location_id: 1, is_primary: 1 });
WorkScheduleAssignmentSchema.index({ company_id: 1, work_schedule_id: 1 });

export const WorkScheduleAssignment = model<IWorkScheduleAssignment>('WorkScheduleAssignment', WorkScheduleAssignmentSchema);
