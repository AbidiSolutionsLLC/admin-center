// server/src/models/Team.model.ts
import { Schema, model, Document, Types } from 'mongoose';
import { slugify } from '../utils/slugify';

export interface ITeam extends Document {
  company_id: Types.ObjectId | string;
  name: string;
  slug: string;
  description?: string;
  department_id?: Types.ObjectId | string | null;
  team_lead_id?: Types.ObjectId | string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const TeamSchema = new Schema<ITeam>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  description: { type: String },
  department_id: { type: Schema.Types.ObjectId, ref: 'Department' },
  team_lead_id: { type: Schema.Types.ObjectId, ref: 'User' },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// ── Indexes ──────────────────────────────────────────────────────────────────
TeamSchema.index({ company_id: 1, slug: 1 }, { unique: true });
TeamSchema.index({ company_id: 1, is_active: 1 });
TeamSchema.index({ company_id: 1, department_id: 1 });

// ── Pre-save Hook: Auto-generate slug from name ──────────────────────────────
TeamSchema.pre('validate', function() {
  if (this.isModified('name') && this.name) {
    this.slug = slugify(this.name);
  }
});

export const Team = model<ITeam>('Team', TeamSchema);
