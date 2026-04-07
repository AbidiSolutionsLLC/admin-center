# ADMIN CENTER — Backend Structure Document
> How MongoDB + Express.js is organized, how hooks call services, naming conventions, and patterns.
> Feed this to Cursor when building any hook, service, route, or anything that touches the database.

**Stack:** Node.js · Express.js · TypeScript · MongoDB · Mongoose · JWT Auth

---

## 1. EXPRESS SERVER SETUP

```
server/
  src/
    index.ts                  → Express app entry point
    app.ts                    → Express app factory (middleware, routes)
    config/
      db.ts                   → MongoDB connection via Mongoose
      env.ts                  → Typed env var loader (uses dotenv)
    middleware/
      auth.ts                 → JWT verification + attach req.user
      requireRole.ts          → Role-based route guard
      requireCompany.ts       → Inject + validate company_id from JWT
      auditMiddleware.ts      → Auto-log writes (wraps mutation handlers)
      errorHandler.ts         → Global error handler
      rateLimiter.ts          → express-rate-limit config
    routes/
      auth.routes.ts
      organization.routes.ts
      people.routes.ts
      roles.routes.ts
      apps.routes.ts
      policies.routes.ts
      workflows.routes.ts
      locations.routes.ts
      security.routes.ts
      dataFields.routes.ts
      notifications.routes.ts
      integrations.routes.ts
      auditLogs.routes.ts
      intelligence.routes.ts
    controllers/
      auth.controller.ts
      organization.controller.ts
      people.controller.ts
      roles.controller.ts
      apps.controller.ts
      policies.controller.ts
      workflows.controller.ts
      locations.controller.ts
      security.controller.ts
      dataFields.controller.ts
      notifications.controller.ts
      integrations.controller.ts
      auditLogs.controller.ts
      intelligence.controller.ts
    models/
      Company.model.ts
      Department.model.ts
      User.model.ts
      Role.model.ts
      Permission.model.ts
      RolePermission.model.ts
      UserRole.model.ts
      Group.model.ts
      GroupMember.model.ts
      App.model.ts
      AppAssignment.model.ts
      Policy.model.ts
      Location.model.ts
      AuditEvent.model.ts
      CustomField.model.ts
      Insight.model.ts
      SecurityEvent.model.ts
      SecurityPolicy.model.ts
      NotificationTemplate.model.ts
      RefreshToken.model.ts
    lib/
      auditLogger.ts           → Audit event writer (always server-side)
      rbac.ts                  → Permission resolution helpers
      lifecycle.ts             → Lifecycle state machine
      intelligence.ts          → Rule runner
      tokenService.ts          → JWT sign/verify/rotate
      emailService.ts          → Nodemailer/SendGrid wrapper
    utils/
      AppError.ts              → Typed error class
      asyncHandler.ts          → Wraps async controllers (removes try/catch boilerplate)
      slugify.ts
      formatters.ts
    types/
      express.d.ts             → Extend req.user type
      index.ts                 → All shared interfaces
```

---

## 2. MONGODB CONNECTION

```typescript
// server/src/config/db.ts
import mongoose from 'mongoose';

export const connectDB = async (): Promise<void> => {
  const conn = await mongoose.connect(process.env.MONGODB_URI!, {
    dbName: process.env.DB_NAME ?? 'admin_center',
  });
  console.log(`MongoDB connected: ${conn.connection.host}`);
};
```

```typescript
// server/src/index.ts
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { connectDB } from './config/db';
import { errorHandler } from './middleware/errorHandler';
import { allRoutes } from './routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/v1', allRoutes);
app.use(errorHandler);

connectDB().then(() => {
  app.listen(process.env.PORT ?? 5000, () => {
    console.log(`Server running on port ${process.env.PORT ?? 5000}`);
  });
});
```

---

## 3. AUTHENTICATION MODEL

JWT access token (15 min) + refresh token (7 days) in httpOnly cookie.

```typescript
// server/src/lib/tokenService.ts
import jwt from 'jsonwebtoken';

export interface AdminClaim {
  userId: string;
  user_role: 'super_admin' | 'hr_admin' | 'it_admin' | 'ops_admin' | 'manager' | 'compliance';
  company_id: string;
}

export const signAccessToken = (payload: AdminClaim): string =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });

export const signRefreshToken = (payload: Pick<AdminClaim, 'userId'>): string =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });

export const verifyAccessToken = (token: string): AdminClaim =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as AdminClaim;
```

```typescript
// server/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/tokenService';

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded; // company_id, userId, user_role always available downstream
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalid or expired', code: 'INVALID_TOKEN' });
  }
};
```

```typescript
// server/src/types/express.d.ts
import { AdminClaim } from '../lib/tokenService';

declare global {
  namespace Express {
    interface Request {
      user: AdminClaim;
    }
  }
}
```

---

## 4. MULTI-TENANCY PATTERN

Every query MUST include `company_id`. The `requireAuth` middleware injects it from JWT.

```typescript
// CORRECT — always scope to company
const departments = await Department.find({
  company_id: req.user.company_id,
  is_active: true,
}).sort({ created_at: 1 });

// WRONG — missing company scope
const departments = await Department.find({ is_active: true }); // NEVER DO THIS
```

Mongoose plugin to auto-scope (optional, add to all schemas):
```typescript
// server/src/utils/companyScope.ts
import { Schema } from 'mongoose';

export const companyScopePlugin = (schema: Schema) => {
  schema.pre('find', function () {
    if (!this.getFilter().company_id) {
      throw new Error('Mongoose query missing company_id scope — tenant isolation violated');
    }
  });
};
```

---

## 5. MONGODB SCHEMAS (MONGOOSE)

### Company
```typescript
// server/src/models/Company.model.ts
import { Schema, model, Document } from 'mongoose';

export interface ICompany extends Document {
  name: string;
  slug: string;
  logo_url?: string;
  domain?: string;
  employee_id_format: string;       // e.g. 'EMP-{counter:5}'
  employee_id_counter: number;
  setup_progress: {
    org: boolean;
    users: boolean;
    roles: boolean;
    apps: boolean;
    security: boolean;
  };
  plan: 'free' | 'starter' | 'pro';
  is_active: boolean;
  created_at: Date;
}

const CompanySchema = new Schema<ICompany>({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  logo_url: String,
  domain: String,
  employee_id_format: { type: String, default: 'EMP-{counter:5}' },
  employee_id_counter: { type: Number, default: 1 },
  setup_progress: {
    org: { type: Boolean, default: false },
    users: { type: Boolean, default: false },
    roles: { type: Boolean, default: false },
    apps: { type: Boolean, default: false },
    security: { type: Boolean, default: false },
  },
  plan: { type: String, enum: ['free', 'starter', 'pro'], default: 'free' },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const Company = model<ICompany>('Company', CompanySchema);
```

### Department
```typescript
// server/src/models/Department.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface IDepartment extends Document {
  company_id: Types.ObjectId;
  name: string;
  slug: string;
  type: 'business_unit' | 'division' | 'department' | 'team' | 'cost_center';
  parent_id?: Types.ObjectId;
  primary_manager_id?: Types.ObjectId;
  secondary_manager_id?: Types.ObjectId;
  is_active: boolean;
}

const DepartmentSchema = new Schema<IDepartment>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  type: { type: String, enum: ['business_unit', 'division', 'department', 'team', 'cost_center'], required: true },
  parent_id: { type: Schema.Types.ObjectId, ref: 'Department' },
  primary_manager_id: { type: Schema.Types.ObjectId, ref: 'User' },
  secondary_manager_id: { type: Schema.Types.ObjectId, ref: 'User' },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

DepartmentSchema.index({ company_id: 1, slug: 1 }, { unique: true });

export const Department = model<IDepartment>('Department', DepartmentSchema);
```

### User
```typescript
// server/src/models/User.model.ts
import { Schema, model, Document, Types } from 'mongoose';

export type LifecycleState = 'invited' | 'onboarding' | 'active' | 'probation' | 'on_leave' | 'terminated' | 'archived';
export type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'intern';

export interface IUser extends Document {
  company_id: Types.ObjectId;
  employee_id: string;
  full_name: string;
  email: string;
  password_hash: string;
  phone?: string;
  avatar_url?: string;
  department_id?: Types.ObjectId;
  team_id?: Types.ObjectId;
  manager_id?: Types.ObjectId;
  lifecycle_state: LifecycleState;
  lifecycle_changed_at: Date;
  hire_date?: Date;
  termination_date?: Date;
  employment_type: EmploymentType;
  location_id?: Types.ObjectId;
  custom_fields: Record<string, unknown>;
  last_login?: Date;
  mfa_enabled: boolean;
  refresh_token_hash?: string;
  is_active: boolean;
}

const UserSchema = new Schema<IUser>({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  employee_id: { type: String, required: true },
  full_name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  password_hash: { type: String, required: true },
  phone: String,
  avatar_url: String,
  department_id: { type: Schema.Types.ObjectId, ref: 'Department' },
  team_id: { type: Schema.Types.ObjectId, ref: 'Department' },
  manager_id: { type: Schema.Types.ObjectId, ref: 'User' },
  lifecycle_state: {
    type: String,
    enum: ['invited', 'onboarding', 'active', 'probation', 'on_leave', 'terminated', 'archived'],
    default: 'invited',
  },
  lifecycle_changed_at: { type: Date, default: Date.now },
  hire_date: Date,
  termination_date: Date,
  employment_type: { type: String, enum: ['full_time', 'part_time', 'contractor', 'intern'], default: 'full_time' },
  location_id: { type: Schema.Types.ObjectId, ref: 'Location' },
  custom_fields: { type: Schema.Types.Mixed, default: {} },
  last_login: Date,
  mfa_enabled: { type: Boolean, default: false },
  refresh_token_hash: String,
  is_active: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

UserSchema.index({ company_id: 1, email: 1 }, { unique: true });
UserSchema.index({ company_id: 1, employee_id: 1 }, { unique: true });

export const User = model<IUser>('User', UserSchema);
```

### Role + Permissions
```typescript
// server/src/models/Role.model.ts
const RoleSchema = new Schema({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['system', 'custom'], default: 'custom' },
  parent_role_id: { type: Schema.Types.ObjectId, ref: 'Role' },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at' } });

// server/src/models/Permission.model.ts
const PermissionSchema = new Schema({
  module: { type: String, required: true },
  action: { type: String, enum: ['create', 'read', 'update', 'delete', 'export'], required: true },
  data_scope: { type: String, enum: ['own', 'department', 'all'], required: true },
});
PermissionSchema.index({ module: 1, action: 1, data_scope: 1 }, { unique: true });

// server/src/models/RolePermission.model.ts
const RolePermissionSchema = new Schema({
  role_id: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
  permission_id: { type: Schema.Types.ObjectId, ref: 'Permission', required: true },
  granted: { type: Boolean, required: true },
});
RolePermissionSchema.index({ role_id: 1, permission_id: 1 }, { unique: true });

// server/src/models/UserRole.model.ts
const UserRoleSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role_id: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
  assigned_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  assigned_at: { type: Date, default: Date.now },
});
UserRoleSchema.index({ user_id: 1, role_id: 1 }, { unique: true });
```

### AuditEvent (immutable)
```typescript
// server/src/models/AuditEvent.model.ts
// NO updateOne, no findByIdAndUpdate, no deleteOne — immutable by convention + middleware guard

const AuditEventSchema = new Schema({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  actor_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actor_email: { type: String, required: true },
  action: { type: String, required: true },
  module: { type: String, required: true },
  object_type: { type: String, required: true },
  object_id: { type: String, required: true },
  object_label: { type: String, required: true },
  before_state: Schema.Types.Mixed,
  after_state: Schema.Types.Mixed,
  ip_address: String,
  user_agent: String,
}, { timestamps: { createdAt: 'created_at' }, versionKey: false });

// Immutability: no update/delete routes exist for this model
```

### Insight
```typescript
// server/src/models/Insight.model.ts
const InsightSchema = new Schema({
  company_id: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  category: { type: String, enum: ['health', 'misconfiguration', 'recommendation', 'data_consistency'], required: true },
  severity: { type: String, enum: ['critical', 'warning', 'info'], required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  reasoning: String,
  affected_object_type: String,
  affected_object_id: String,
  affected_object_label: String,
  remediation_url: String,
  remediation_action: String,
  is_resolved: { type: Boolean, default: false },
  detected_at: { type: Date, default: Date.now },
  resolved_at: Date,
}, { timestamps: false });
```

---

## 6. CONTROLLER PATTERN

Every controller uses `asyncHandler` to remove try/catch boilerplate.

```typescript
// server/src/utils/asyncHandler.ts
import { Request, Response, NextFunction } from 'express';
export const asyncHandler = (fn: Function) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
```

```typescript
// server/src/controllers/organization.controller.ts
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { Department } from '../models/Department.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';

export const getDepartments = asyncHandler(async (req: Request, res: Response) => {
  const departments = await Department.find({
    company_id: req.user.company_id, // ALWAYS scope to company
    is_active: true,
  })
    .populate('primary_manager_id', 'full_name avatar_url')
    .sort({ created_at: 1 });

  res.status(200).json({ success: true, data: departments });
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const dept = await Department.create({
    ...req.body,
    company_id: req.user.company_id, // injected from JWT, never from body
  });

  // MANDATORY: audit log every write
  await auditLogger.log({
    req,
    action: 'department.created',
    module: 'organization',
    object_type: 'Department',
    object_id: dept._id.toString(),
    object_label: dept.name,
    before_state: null,
    after_state: dept.toObject(),
  });

  res.status(201).json({ success: true, data: dept });
});
```

---

## 7. AUDIT LOGGER

```typescript
// server/src/lib/auditLogger.ts
import { Request } from 'express';
import { AuditEvent } from '../models/AuditEvent.model';

interface LogParams {
  req: Request;
  action: string;
  module: string;
  object_type: string;
  object_id: string;
  object_label: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
}

export const auditLogger = {
  log: async (params: LogParams): Promise<void> => {
    await AuditEvent.create({
      company_id: params.req.user.company_id,
      actor_id: params.req.user.userId,
      actor_email: params.req.user.email,  // stored on req.user from JWT
      action: params.action,
      module: params.module,
      object_type: params.object_type,
      object_id: params.object_id,
      object_label: params.object_label,
      before_state: params.before_state,
      after_state: params.after_state,
      ip_address: params.req.ip,
      user_agent: params.req.headers['user-agent'],
    });
  },
};
```

---

## 8. ROUTES PATTERN

```typescript
// server/src/routes/organization.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getOrgTree,
} from '../controllers/organization.controller';

const router = Router();

router.use(requireAuth); // all org routes require auth

router.get('/', getDepartments);
router.get('/tree', getOrgTree);
router.get('/:id', getDepartmentById);
router.post('/', requireRole(['super_admin', 'ops_admin']), createDepartment);
router.put('/:id', requireRole(['super_admin', 'ops_admin']), updateDepartment);
router.delete('/:id', requireRole(['super_admin']), deleteDepartment);

export default router;
```

---

## 9. LIFECYCLE ENGINE

```typescript
// server/src/lib/lifecycle.ts

export const VALID_TRANSITIONS: Record<string, string[]> = {
  invited:     ['onboarding', 'archived'],
  onboarding:  ['active'],
  active:      ['probation', 'on_leave', 'terminated'],
  probation:   ['active', 'terminated'],
  on_leave:    ['active', 'terminated'],
  terminated:  ['archived'],
  archived:    [],
};

export const isValidTransition = (from: string, to: string): boolean =>
  VALID_TRANSITIONS[from]?.includes(to) ?? false;

// Lifecycle automations run after a valid state change:
export const LIFECYCLE_AUTOMATIONS: Record<string, (userId: string, companyId: string) => Promise<void>> = {
  'invited→onboarding': async (userId, companyId) => {
    // Send welcome email
  },
  'onboarding→active': async (userId, companyId) => {
    // Assign default Employee role
  },
  'active→terminated': async (userId, companyId) => {
    // Add to pending_session_revocations + invalidate refresh tokens
  },
  'terminated→archived': async (userId, companyId) => {
    // Anonymize PII: full_name='Archived User', phone=null, avatar_url=null
  },
};
```

---

## 10. RBAC ENGINE

```typescript
// server/src/lib/rbac.ts
import { UserRole } from '../models/UserRole.model';
import { RolePermission } from '../models/RolePermission.model';
import { Permission } from '../models/Permission.model';

export interface EffectivePermission {
  module: string;
  action: string;
  data_scope: 'own' | 'department' | 'all';
  granted: boolean;
}

export const resolveUserPermissions = async (userId: string): Promise<EffectivePermission[]> => {
  // 1. Get all roles for user
  const userRoles = await UserRole.find({ user_id: userId }).select('role_id');
  const roleIds = userRoles.map(ur => ur.role_id);

  // 2. Get all role permissions
  const rolePermissions = await RolePermission.find({ role_id: { $in: roleIds } })
    .populate('permission_id');

  // 3. Resolve conflicts: deny overrides grant
  const permMap = new Map<string, boolean>();
  for (const rp of rolePermissions) {
    const perm = rp.permission_id as typeof Permission.prototype;
    const key = `${perm.module}:${perm.action}:${perm.data_scope}`;
    // false (deny) always wins
    if (!permMap.has(key) || permMap.get(key) === true) {
      permMap.set(key, rp.granted);
    }
  }

  return Array.from(permMap.entries()).map(([key, granted]) => {
    const [module, action, data_scope] = key.split(':');
    return { module, action, data_scope: data_scope as 'own' | 'department' | 'all', granted };
  });
};

export const hasPermission = async (
  userId: string,
  module: string,
  action: string,
): Promise<boolean> => {
  const perms = await resolveUserPermissions(userId);
  return perms.some(p => p.module === module && p.action === action && p.granted);
};
```

---

## 11. INTELLIGENCE ENGINE

```typescript
// server/src/lib/intelligence.ts
import { User } from '../models/User.model';
import { Department } from '../models/Department.model';
import { UserRole } from '../models/UserRole.model';
import { Insight } from '../models/Insight.model';

export const runIntelligenceRules = async (companyId: string): Promise<void> => {
  const insights: Partial<typeof Insight.prototype>[] = [];

  // RULE-01: Active user with no role
  const usersNoRole = await User.find({ company_id: companyId, lifecycle_state: 'active', is_active: true });
  for (const user of usersNoRole) {
    const roleCount = await UserRole.countDocuments({ user_id: user._id });
    if (roleCount === 0) {
      insights.push({
        company_id: companyId,
        category: 'health', severity: 'critical',
        title: `${user.full_name} has no role assigned`,
        description: 'Active users without a role cannot access any module.',
        reasoning: `User ${user.email} is in 'active' lifecycle state but has 0 roles assigned.`,
        affected_object_type: 'User',
        affected_object_id: user._id.toString(),
        affected_object_label: user.full_name,
        remediation_url: `/people/${user._id}`,
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // RULE-02: Department with headcount > 0 and no manager
  const deptsNoManager = await Department.find({
    company_id: companyId, is_active: true, primary_manager_id: { $exists: false },
  });
  for (const dept of deptsNoManager) {
    const headcount = await User.countDocuments({ department_id: dept._id, is_active: true });
    if (headcount > 0) {
      insights.push({
        company_id: companyId,
        category: 'health', severity: 'critical',
        title: `${dept.name} has no manager assigned`,
        description: 'Departments with active members must have a primary manager.',
        affected_object_type: 'Department',
        affected_object_id: dept._id.toString(),
        affected_object_label: dept.name,
        remediation_url: `/organization/${dept._id}`,
        is_resolved: false,
        detected_at: new Date(),
      });
    }
  }

  // Upsert insights (avoid duplicates — match on object_id + action condition)
  for (const insight of insights) {
    await Insight.updateOne(
      { company_id: companyId, affected_object_id: insight.affected_object_id, title: insight.title, is_resolved: false },
      { $setOnInsert: insight },
      { upsert: true },
    );
  }
};
```

---

## 12. ERROR HANDLING

```typescript
// server/src/utils/AppError.ts
export class AppError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

// server/src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
};
```

---

## 13. ENVIRONMENT VARIABLES

```bash
# server/.env

# Server
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net
DB_NAME=admin_center

# JWT
JWT_ACCESS_SECRET=your_64_char_secret_here
JWT_REFRESH_SECRET=your_other_64_char_secret_here

# Email
SENDGRID_API_KEY=your_sendgrid_key
EMAIL_FROM=noreply@yourdomain.com

# Sentry
SENTRY_DSN=your_sentry_dsn
```

---

## 14. MONGODB INDEXES — REQUIRED BEFORE FIRST BUILD

Run these in MongoDB shell or migration script:

```javascript
// departments
db.departments.createIndex({ company_id: 1, is_active: 1 });
db.departments.createIndex({ company_id: 1, slug: 1 }, { unique: true });

// users
db.users.createIndex({ company_id: 1, lifecycle_state: 1 });
db.users.createIndex({ company_id: 1, email: 1 }, { unique: true });
db.users.createIndex({ company_id: 1, employee_id: 1 }, { unique: true });
db.users.createIndex({ company_id: 1, department_id: 1 });
db.users.createIndex({ last_login: 1 });

// roles
db.roles.createIndex({ company_id: 1 });
db.rolepermissions.createIndex({ role_id: 1 });
db.userroles.createIndex({ user_id: 1 });
db.userroles.createIndex({ role_id: 1 });

// audit_events
db.auditevents.createIndex({ company_id: 1, created_at: -1 });
db.auditevents.createIndex({ company_id: 1, actor_id: 1 });
db.auditevents.createIndex({ company_id: 1, module: 1 });

// insights
db.insights.createIndex({ company_id: 1, is_resolved: 1, severity: 1 });
```

---

## 15. BACKEND CHECKLIST — BEFORE FIRST BUILD

- [ ] MongoDB cluster created and URI added to `.env`
- [ ] All Mongoose models created and exported
- [ ] All indexes created (Section 14)
- [ ] JWT secrets generated (use `openssl rand -hex 64`)
- [ ] Auth middleware tested (protected route returns 401 without token)
- [ ] `requireCompany` middleware injects `company_id` from JWT on every request
- [ ] Seed system roles: `super_admin`, `hr_admin`, `it_admin`, `ops_admin`, `manager`, `employee`
- [ ] Seed all permissions (module × action × data_scope combinations)
- [ ] Seed system apps
- [ ] AuditEvent model has NO update/delete routes
- [ ] Intelligence engine runs on cron (every 60 seconds) or on-demand via `/api/v1/intelligence/run`
