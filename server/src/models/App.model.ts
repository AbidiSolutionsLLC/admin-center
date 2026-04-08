// server/src/models/App.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IApp extends Document {
  name: string;
  slug: string;
  description?: string;
  icon_url?: string;
  category: string;
  provider?: string;
  status: 'active' | 'inactive' | 'maintenance';
  is_system_app: boolean;
  company_id?: Types.ObjectId;
  is_active: boolean;
  /** Slugs of apps that must be assigned first */
  dependencies?: string[];
  created_at: Date;
  updated_at: Date;
}

const AppSchema = new Schema<IApp>({
  name: { type: String, required: true },
  slug: { type: String, required: true, index: true },
  description: String,
  icon_url: String,
  category: { type: String, required: true },
  provider: String,
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active',
  },
  is_system_app: { type: Boolean, default: false },
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
  is_active: { type: Boolean, default: true },
  dependencies: [{ type: String }],
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Unique index for system apps (slug only) and company apps (company_id + slug)
AppSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { company_id: { $exists: false } } });
AppSchema.index({ company_id: 1, slug: 1 }, { unique: true, partialFilterExpression: { company_id: { $exists: true } } });
AppSchema.index({ company_id: 1, is_active: 1 });
AppSchema.index({ category: 1, is_active: 1 });

export const App = model<IApp>('App', AppSchema);
