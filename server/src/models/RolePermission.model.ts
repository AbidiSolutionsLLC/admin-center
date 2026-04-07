// server/src/models/RolePermission.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IRolePermission extends Document {
  role_id: Types.ObjectId;
  permission_id: Types.ObjectId;
  granted: boolean;
}

const RolePermissionSchema = new Schema<IRolePermission>({
  role_id: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
  permission_id: { type: Schema.Types.ObjectId, ref: 'Permission', required: true },
  granted: { type: Boolean, required: true },
}, { timestamps: false });

// Unique index: one grant/deny per (role, permission) combination
RolePermissionSchema.index({ role_id: 1, permission_id: 1 }, { unique: true });

export const RolePermission = model<IRolePermission>('RolePermission', RolePermissionSchema);
