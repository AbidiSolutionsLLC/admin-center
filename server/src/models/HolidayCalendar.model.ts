// server/src/models/HolidayCalendar.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IHolidayCalendar extends Document {
  company_id: Types.ObjectId;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const HolidayCalendarSchema = new Schema<IHolidayCalendar>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  description: String,
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

HolidayCalendarSchema.index({ company_id: 1, name: 1 });
HolidayCalendarSchema.index({ company_id: 1, is_active: 1 });

export const HolidayCalendar = model<IHolidayCalendar>('HolidayCalendar', HolidayCalendarSchema);
