// server/src/models/Announcement.model.ts — platform announcement shown to tenants (DRD 4.1, PRD CC-AN-1; Plan 4.12).
// Several rows can exist over time; at most one is "current": the latest one whose window contains now.
import { Schema, model, Document, Types } from 'mongoose';

export const ANNOUNCEMENT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AnnouncementSeverity = (typeof ANNOUNCEMENT_SEVERITIES)[number];

export interface IAnnouncement extends Document {
  message: string;
  severity: AnnouncementSeverity;
  starts_at: Date;
  ends_at: Date;
  created_by: Types.ObjectId;
  created_at: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>({
  message: { type: String, required: true, maxlength: 280 },
  severity: { type: String, enum: ANNOUNCEMENT_SEVERITIES, default: 'info' },
  starts_at: { type: Date, required: true },
  ends_at: { type: Date, required: true },
  created_by: { type: Schema.Types.ObjectId, ref: 'OperatorAccount', required: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });
AnnouncementSchema.index({ ends_at: 1 });

export const Announcement = model<IAnnouncement>('Announcement', AnnouncementSchema);
