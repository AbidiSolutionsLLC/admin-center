// server/src/models/Health.model.ts — platform health (DRD 4.1, 7.1; Plan 4.9). Written by lib/health, read by operator/health.ts.
import { Schema, model, Document } from 'mongoose';

export const HEALTH_STATES = ['healthy', 'degraded', 'critical', 'unknown'] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export interface IHealthCheck extends Document {
  component: string;
  state: HealthState;
  detail: string;
  metrics?: Record<string, unknown>;
  checked_at: Date;
}

/** Latest state per component. */
const HealthCheckSchema = new Schema<IHealthCheck>({
  component: { type: String, required: true },
  state: { type: String, enum: HEALTH_STATES, required: true },
  detail: { type: String, default: '', maxlength: 500 },
  metrics: Schema.Types.Mixed,
  checked_at: { type: Date, required: true },
});
HealthCheckSchema.index({ component: 1 }, { unique: true });

export const HealthCheck = model<IHealthCheck>('HealthCheck', HealthCheckSchema);

export interface IHealthEvent extends Document {
  component: string;
  from: HealthState;
  to: HealthState;
  detail: string;
  at: Date;
}

/** One row per state change (CC-PH-5), kept 7 days. */
const HealthEventSchema = new Schema<IHealthEvent>({
  component: { type: String, required: true },
  from: { type: String, enum: HEALTH_STATES, required: true },
  to: { type: String, enum: HEALTH_STATES, required: true },
  detail: { type: String, default: '', maxlength: 500 },
  at: { type: Date, required: true },
});
HealthEventSchema.index({ at: -1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export const HealthEvent = model<IHealthEvent>('HealthEvent', HealthEventSchema);

export interface IRouteMetric extends Document {
  instance: string;
  /** Start of the minute (UTC). */
  minute: Date;
  count: number;
  errors_5xx: number;
  /** Request counts per latency bucket (lib/health/routeMetrics.ts BUCKETS_MS, last = over the largest bound). */
  buckets: number[];
  groups: Array<{ group: string; count: number; errors_5xx: number }>;
}

/** One document per Admin instance per minute (DRD 7.3), kept 24 hours. */
const RouteMetricSchema = new Schema<IRouteMetric>({
  instance: { type: String, required: true },
  minute: { type: Date, required: true },
  count: { type: Number, default: 0 },
  errors_5xx: { type: Number, default: 0 },
  buckets: { type: [Number], default: [] },
  groups: { type: [{ _id: false, group: String, count: Number, errors_5xx: Number }], default: [] },
});
RouteMetricSchema.index({ instance: 1, minute: 1 }, { unique: true });
RouteMetricSchema.index({ minute: 1 }, { expireAfterSeconds: 24 * 3600 });

export const RouteMetric = model<IRouteMetric>('RouteMetric', RouteMetricSchema);
