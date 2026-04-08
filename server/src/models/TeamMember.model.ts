// server/src/models/TeamMember.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface ITeamMember extends Document {
  company_id: Types.ObjectId | string;
  team_id: Types.ObjectId | string;
  user_id: Types.ObjectId | string;
  role: 'member' | 'lead' | 'admin';
  joined_at: Date;
  created_at: Date;
  updated_at: Date;
}

const TeamMemberSchema = new Schema<ITeamMember>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  team_id: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['member', 'lead', 'admin'], default: 'member' },
  joined_at: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// ── Indexes ──────────────────────────────────────────────────────────────────
// Unique constraint: no duplicate memberships (same user in same team)
TeamMemberSchema.index({ company_id: 1, team_id: 1, user_id: 1 }, { unique: true });
TeamMemberSchema.index({ company_id: 1, user_id: 1 });
TeamMemberSchema.index({ team_id: 1, is_active: 1 });

export const TeamMember = model<ITeamMember>('TeamMember', TeamMemberSchema);
