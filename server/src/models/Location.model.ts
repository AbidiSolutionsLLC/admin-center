// server/src/models/Location.model.ts
import { Schema, model, Document, Types } from 'mongoose';

/**
 * Location Model
 * Represents physical/regional presence for policy and compliance context.
 * Supports a hierarchy: Region → Country → City → Office.
 */

export type LocationType = 'region' | 'country' | 'city' | 'office';

export interface ILocation extends Document {
  company_id: Types.ObjectId;
  name: string;
  type: LocationType;
  parent_id?: Types.ObjectId;
  timezone: string;
  is_headquarters: boolean;
  address?: string;
  working_hours?: {
    start: string;
    end: string;
    days: number[];
  };
  created_at: Date;
  updated_at: Date;
}

const LocationSchema = new Schema<ILocation>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['region', 'country', 'city', 'office'],
    default: 'office',
    required: true
  },
  parent_id: { type: Schema.Types.ObjectId, ref: 'Location' },
  timezone: { type: String, required: true, default: 'UTC' },
  is_headquarters: { type: Boolean, default: false },
  address: String,
  working_hours: {
    start: String,
    end: String,
    days: [Number]
  }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// ── Indexes ──────────────────────────────────────────────────────────────────
LocationSchema.index({ company_id: 1, name: 1 });
LocationSchema.index({ company_id: 1, type: 1 });
LocationSchema.index({ parent_id: 1 });

export const Location = model<ILocation>('Location', LocationSchema);
