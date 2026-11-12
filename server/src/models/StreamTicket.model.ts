// server/src/models/StreamTicket.model.ts — Single-use SSE stream tickets (05 §3)
import { Schema, model, Document, Types } from 'mongoose';

export const STREAM_TICKET_TTL_MS = 60 * 1000;

export interface IStreamTicket extends Document {
  ticketHash: string;
  member: Types.ObjectId;
  company: Types.ObjectId;
  sid: string;
  expiresAt: Date;
  createdAt: Date;
}

const StreamTicketSchema = new Schema<IStreamTicket>(
  {
    ticketHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    member: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    sid: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + STREAM_TICKET_TTL_MS),
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

StreamTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const StreamTicket = model<IStreamTicket>('StreamTicket', StreamTicketSchema);
