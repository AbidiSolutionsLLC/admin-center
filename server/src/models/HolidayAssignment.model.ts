// server/src/models/HolidayAssignment.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IHolidayAssignment extends Document {
  company_id: Types.ObjectId;
  location_id: Types.ObjectId;
  calendar_id: Types.ObjectId;
  is_primary: boolean;
  effective_date: Date;
  expiry_date?: Date;
  created_at: Date;
  updated_at: Date;
}

const HolidayAssignmentSchema = new Schema<IHolidayAssignment>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  location_id: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
  calendar_id: { type: Schema.Types.ObjectId, ref: 'HolidayCalendar', required: true, index: true },
  is_primary: { type: Boolean, default: false },
  effective_date: { type: Date, default: Date.now },
  expiry_date: Date,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

HolidayAssignmentSchema.index({ location_id: 1, is_primary: 1 });
HolidayAssignmentSchema.index({ company_id: 1, calendar_id: 1 });

export const HolidayAssignment = model<IHolidayAssignment>('HolidayAssignment', HolidayAssignmentSchema);
