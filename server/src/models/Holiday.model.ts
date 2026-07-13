// server/src/models/Holiday.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type RecurringType = 'yearly' | 'monthly' | 'quarterly' | 'custom';

export interface IHoliday extends Document {
  name: string;
  date: Date;
  recurring_type: RecurringType;
  recurring_details?: {
    year?: number;
    month?: number;
    day?: number;
    pattern?: string;
    end_date?: Date;
  };
  calendar_id: Types.ObjectId;
  holiday_code?: string;
  is_observed?: boolean;
  created_at: Date;
  updated_at: Date;
}

const HolidaySchema = new Schema<IHoliday>({
  name: { type: String, required: true },
  date: { type: Date, required: true },
  recurring_type: {
    type: String,
    enum: ['yearly', 'monthly', 'quarterly', 'custom'],
    default: 'yearly',
    required: true
  },
  recurring_details: {
    year: Number,
    month: Number,
    day: Number,
    pattern: String,
    end_date: Date
  },
  calendar_id: { type: Schema.Types.ObjectId, ref: 'HolidayCalendar', required: true, index: true },
  holiday_code: String,
  is_observed: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

HolidaySchema.index({ calendar_id: 1, date: 1 });
HolidaySchema.index({ calendar_id: 1, recurring_type: 1 });
HolidaySchema.index({ recurring_type: 1, 'recurring_details.end_date': 1 });

export const Holiday = model<IHoliday>('Holiday', HolidaySchema);
