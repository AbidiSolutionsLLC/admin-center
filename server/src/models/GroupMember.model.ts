import { Schema, model, Document, Types } from 'mongoose';

export interface IGroupMember extends Document {
  group_id: Types.ObjectId;
  user_id: Types.ObjectId;
  assigned_by: Types.ObjectId;
  assigned_at: Date;
}

const GroupMemberSchema = new Schema<IGroupMember>({
  group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assigned_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  assigned_at: { type: Date, default: Date.now },
});

// A user can only be in a group once
GroupMemberSchema.index({ group_id: 1, user_id: 1 }, { unique: true });

export const GroupMember = model<IGroupMember>('GroupMember', GroupMemberSchema);
