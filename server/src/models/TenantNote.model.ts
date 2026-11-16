// server/src/models/TenantNote.model.ts — Command Center internal notes on a tenant (DRD 4.1). Append-only: no edit.
import { Schema, model, Document, Types } from 'mongoose';

export interface ITenantNote extends Document {
  company_id: Types.ObjectId;
  operator_id: Types.ObjectId;
  operator_email: string;
  body: string;
  created_at: Date;
}

const TenantNoteSchema = new Schema<ITenantNote>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  operator_id: { type: Schema.Types.ObjectId, ref: 'OperatorAccount', required: true },
  operator_email: { type: String, required: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

TenantNoteSchema.index({ company_id: 1, created_at: -1 });

export const TenantNote = model<ITenantNote>('TenantNote', TenantNoteSchema);
