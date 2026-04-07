// server/src/models/Permission.model.ts
import { Schema, model, Document } from 'mongoose';

export interface IPermission extends Document {
  module: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'export';
  data_scope: 'own' | 'department' | 'all';
}

const PermissionSchema = new Schema<IPermission>({
  module: { type: String, required: true },
  action: { 
    type: String, 
    enum: ['create', 'read', 'update', 'delete', 'export'], 
    required: true 
  },
  data_scope: { 
    type: String, 
    enum: ['own', 'department', 'all'], 
    required: true 
  },
}, { timestamps: false });

// Unique index: one permission per (module, action, data_scope) combination
PermissionSchema.index({ module: 1, action: 1, data_scope: 1 }, { unique: true });

export const Permission = model<IPermission>('Permission', PermissionSchema);
