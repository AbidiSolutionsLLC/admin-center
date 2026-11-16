// server/src/models/Job.model.ts — generic background work (DRD 4.1 / 10.2, Plan 4.5). Runner: lib/jobs.ts.
import { Schema, model, Document } from 'mongoose';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface IJob extends Document {
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  run_at: Date;
  locked_until?: Date;
  last_error?: string;
  created_at: Date;
  finished_at?: Date;
}

const JobSchema = new Schema<IJob>({
  type: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
  attempts: { type: Number, default: 0 },
  run_at: { type: Date, default: () => new Date() },
  locked_until: Date,
  last_error: String,
  finished_at: Date,
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

JobSchema.index({ status: 1, run_at: 1 });
JobSchema.index({ type: 1, status: 1 });
// Finished and failed jobs are kept 30 days, then removed (the field is only set when a job finishes).
JobSchema.index({ finished_at: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export const Job = model<IJob>('Job', JobSchema);
