Tickets: SOWAYE - 11

Review Date: 2026-04-28

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

SOWAYE-11 — Assign Managers to Teams

Files: server/src/controllers/teams.controller.ts

🟠 SOWAYE-11 | Missing Duplicate Team Member Validation

Path: server/src/controllers/teams.controller.ts



  const member = await TeamMember.create({
    company_id: req.user.company_id,
    team_id: team._id,
    user_id: user._id,
    role: input.role,
  });
Problem: In `addTeamMember`, there is no check to see if the user is already a member of the team. This allows the same user to be added multiple times via POST requests, creating duplicate `TeamMember` records.

Fix: Add an existence check before creating the member:



  const existingMember = await TeamMember.exists({ team_id: team._id, user_id: user._id });
  if (existingMember) throw new AppError('User is already a member of this team', 400, 'DUPLICATE_MEMBER');
 Tickets: SOWAYE - 12

Review Date: 2026-04-28

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

SOWAYE-12 — Define Secondary Reporting Lines

Files: server/src/controllers/reportingLines.controller.ts

🔴 SOWAYE-12 | Exponential Loop & Array Mutation in Direct Reports Fetching

Path: server/src/controllers/reportingLines.controller.ts



    // Recursively get indirect reports
    for (const reportId of reportIds) {
      const indirectReports = await getAllDirectReports(reportId);
      reportIds.push(...indirectReports);
    }
Problem: In `wouldCreateCircularChain`, the `getAllDirectReports` function pushes `indirectReports` into the `reportIds` array while iterating over it with a `for...of` loop. Because `getAllDirectReports` is already recursive, pushing the results back into the array being iterated causes the loop to re-process descendants repeatedly, leading to exponential memory leaks and server crashes (OOM).

Fix: Do not mutate the array you are iterating. Use a separate array to collect results:



    const allReports = [...reportIds];
    for (const reportId of reportIds) {
      const indirectReports = await getAllDirectReports(reportId);
      allReports.push(...indirectReports);
    }
    return allReports;Tickets: SOWAYE - 22

Review Date: 2026-04-28

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

SOWAYE-22 — Define Required Employee Fields

Files: server/src/controllers/people.controller.ts

🟠 SOWAYE-22 | Required Fields Validation Fails on Nested Keys

Path: server/src/controllers/people.controller.ts



  for (const field of requiredFields) {
    const value = body[field];
Problem: `validateRequiredFields` iterates over required fields and checks `body[field]`. For dynamic custom fields (e.g., `custom_fields.ssn`), `body["custom_fields.ssn"]` evaluates to `undefined`, incorrectly throwing a validation error even when the data is provided correctly as a nested object in the request payload.

Fix: Extract nested values using a dot-notation resolver:



  const getNestedValue = (obj: any, path: string) => path.split('.').reduce((acc, part) => acc && acc[part], obj);
  const value = getNestedValue(body, field)2
Tickets: SOWAYE - 24

Review Date: 2026-04-28

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

SOWAYE-24 — Detect Duplicate and Incomplete User Data

Files: server/src/controllers/people.controller.ts

🔴 SOWAYE-24 | Bulk Invite Fails on In-Payload Duplicates

Path: server/src/controllers/people.controller.ts



    if (existingEmails.has(email)) {
      results.push({
        row: rowNumber,
        email,
        success: false,
        error: 'User with this email already exists',
      });
      continue;
    }
Problem: In `bulkInviteUsers`, the code checks for duplicate emails only against the database (`existingEmails`). It does not track emails already processed in the current bulk payload. If a user uploads a CSV with the same email twice, both will pass the check and be sent to `User.create()`, which will trigger a MongoDB `E11000` duplicate key error and crash the entire bulk operation.

Fix: Add processed emails to the `existingEmails` set during the loop:



    if (existingEmails.has(email)) {
       continue;
    }
    existingEmails.add(email);

    Tickets: SOWAYE - 26

Review Date: 2026-04-28

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

SOWAYE-26 — Track User Lifecycle History

Files: server/src/controllers/people.controller.ts

🔴 SOWAYE-26 | Sensitive Password & Token Hashes Leaked in Audit Logs

Path: server/src/controllers/people.controller.ts



 const beforeState = user.toObject();
  // Update lifecycle state
  user.lifecycle_state = targetState;
Problem: In `updateUserLifecycle`, the `beforeState` object is passed directly to the `auditLogger` without sanitizing sensitive fields. Unlike the `updateUser` function which properly sanitizes it, this function fails to delete `password_hash` and `refresh_token_hash`, causing these secrets to be stored in plaintext within the `AuditEvent` logs.

Fix: Explicitly delete sensitive fields from `beforeState` before logging:



  const safeBeforeState = user.toObject();
  delete safeBeforeState.password_hash;
  delete safeBeforeState.refresh_token_hash;

  Tickets: SOWAYE - 23

Review Date: 2026-04-28

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

SOWAYE-23 — Enforce Email and Domain Rules

Files: server/src/controllers/people.controller.ts

🔴 SOWAYE-23 | Insecure Domain Matching Allows Subdomain Bypass

Path: server/src/controllers/people.controller.ts



    const isDomainAllowed = allowed_domains.some(domain => {
      const normalizedDomain = domain.toLowerCase();
      return emailDomain === normalizedDomain || emailDomain.endsWith(normalizedDomain);
    });
Problem: In `validateEmailDomain`, the code checks if `emailDomain.endsWith(normalizedDomain)`. Because `emailDomain` includes the `@` prefix (e.g., `@hacker-company.com`), an attacker can bypass domain enforcement by registering a domain that ends with the allowed domain name (e.g., if allowed is `company.com`, `@hacker-company.com` is accepted).

Fix: Remove the `@` from the email domain and strictly compare it, or check for exact subdomain structure:



    const cleanEmailDomain = emailDomain.substring(1);
    const isDomainAllowed = allowed_domains.some(domain => {
      const normalized = domain.toLowerCase();
      return cleanEmailDomain === normalized || cleanEmailDomain.endsWith('.' + normalized);
    });
 

 Tickets: SOWAYE - 14a, 14b

Review Date: 2026-04-28

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

 

SOWAYE-14 — Detect Structural Issues

Files: server/src/controllers/organization.controller.ts

 

🔴 SOWAYE-14-A | Missing Parent Validation: Creating Orphaned Departments

Path: server/src/controllers/organization.controller.ts



const CreateDepartmentSchema = DepartmentBaseSchema.refine(data => {
  if (data.type !== 'business_unit' && !data.parent_id) {
    return false;
  }
  return true;
});
Problem: When creating or updating a department, the system checks for circular references but NEVER verifies if the `parent_id` actually exists in the database. A user can pass a random or deleted ObjectId as `parent_id`, leading to corrupted hierarchy trees and orphaned departments.

Fix: Add a database check for the parent department before saving:



if (input.parent_id) {
  const parentExists = await Department.exists({ _id: input.parent_id, company_id: req.user.company_id, is_active: true });
  if (!parentExists) throw new AppError('Parent department not found', 404, 'NOT_FOUND');
}
 

🔴 SOWAYE-14-B | Infinite Recursion on Cyclic Hierarchies

Path: server/src/controllers/organization.controller.ts



  const buildTree = (parentId: string): OrgTreeNode[] => {
    const children = allOrgUnits.filter(
      (u) => u.parent_id?.toString() === parentId
    );
Problem: In `getBUTree`, `buildTree(childId)` traverses the department list recursively. If a circular reference somehow exists in the database, this will cause an infinite loop (Stack Overflow), crashing the entire server on a simple GET request.

Fix: Pass a `visited` set to the recursive function to break cycles:



const buildTree = (parentId: string, visited = new Set<string>()): OrgTreeNode[] => {
  if (visited.has(parentId)) return [];
  visited.add(parentId);
  // ...
 

 Tickets: SOWAYE - 21

Review Date: 2026-04-17

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

 

SOWAYE-21 — Trigger Actions on Lifecycle Changes

Files: server/src/controllers/people.controller.ts · server/src/middleware/auth.ts

🔴 SOWAYE-21 | Security Vulnerability: Terminated users maintain valid access tokens

Path: server/src/middleware/auth.ts



export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });
  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded; // company_id, userId, user_role always available downstream
    next();
  } catch {
// ...
 

Problem: When an employee's lifecycle state changes to terminated or archived in people.controller.ts, their refresh tokens are revoked and is_active is set to false. However, the authentication middleware (requireAuth) only verifies the cryptographic signature of the existing JWT access token. It never checks the database to verify is_active is true. This exposes a massive security hole where a terminated employee can freely access protected routes until their access token naturally expires.

 

Fix: Require requireAuth to look up the user by userId and check their is_active status before authorizing the route.



+ import { User } from '../models/User.model';
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });
  try {
    const decoded = verifyAccessToken(token);
+   
+   // Guard: Prevent terminated users from proceeding with unexpired tokens
+   const user = await User.findById(decoded.userId).select('is_active');
+   if (!user || !user.is_active) {
+     return res.status(403).json({ error: 'Account inactive or terminated', code: 'FORBIDDEN' });
+   }
+
    req.user = decoded; 
    next();
  } catch {


Tickets: SOWAYE - 10

Review Date: 2026-04-17

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

 

SOWAYE-10 — Restructure Organization via Drag-and-Drop

Files: server/src/controllers/organization.controller.ts

🔴 SOWAYE-10 | Circular Dependency Loophole: A department can be assigned as its own parent

Path: server/src/controllers/organization.controller.ts



export const moveDepartment = asyncHandler(async (req: Request, res: Response) => {
  // ...
  // If parent_id is changing, validate no circular reference
  if (input.parent_id !== undefined && input.parent_id !== oldParentId?.toString()) {
    // Check for circular reference: new parent cannot be a descendant of this department
    if (input.parent_id) {
      const isDescendant = await isDescendantOf(dept._id.toString(), input.parent_id, req.user.company_id as string);
      if (isDescendant) {
        throw new AppError('Cannot move department to one of its own descendants...', 400);
      }
    }
    dept.parent_id = input.parent_id || undefined;
  }
 

Problem: The isDescendantOf helper perfectly guards against moving a department into one of its children, but it does NOT check if the new parent_id is exactly the same as the department's own ID (req.params.id). This allows a malicious or buggy API call to set a unit's parent to itself, creating an infinite loop that breaks tree rendering and counting functions.

 

Fix: Explicitly reject the request if the incoming parent_id matches the department's _id.



if (input.parent_id !== undefined && input.parent_id !== oldParentId?.toString()) {
+   // Check if trying to set self as parent
+   if (input.parent_id === dept._id.toString()) {
+     throw new AppError('A department cannot be its own parent.', 400, 'CIRCULAR_HIERARCHY');
+   }
+
    // Check for circular reference: new parent cannot be a descendant of this department
    if (input.parent_id) {
 
 Tickets: SOWAYE - 20a, 20b, 20c, 20d, 20e

Review Date: 2026-04-14

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

 

SOWAYE-20 — Manage User Lifecycle States
Files: server/src/controllers/people.controller.ts — updateUserLifecycle · server/src/lib/lifecycle.ts

🔴 SOWAYE-20-A | Lifecycle Transition Key Uses Garbled Unicode Characters
Path: server/src/controllers/people.controller.ts lines 398–499



const transitionKey = `${currentState}→${targetState}`; // renders as garbled unicode
// ...
if (transitionKey === 'invited→onboarding') { // garbled character — never matches!
The → arrow character in the source file has been corrupted (renders as → in some contexts but is stored as garbled multi-byte sequences due to the file's encoding issues). This means none of the automation blocks will ever execute — the if conditions can never be true because the string comparison fails.

This means:

Welcome emails on invited → onboarding transition: SILENTLY NEVER SENT

Default role assignment on onboarding → active: SILENTLY NEVER RUNS

Session revocation on active → terminated: REFRESH TOKENS ARE NEVER REVOKED

PII anonymization on terminated → archived: USER DATA IS NEVER ANONYMIZED

These are catastrophic silent failures affecting security (session revocation) and legal compliance (PII anonymization/GDPR).

Fix: Replace the garbled unicode arrows with ASCII strings:



const transitionKey = `${currentState}_to_${targetState}`;
if (transitionKey === 'invited_to_onboarding') { ... }
if (transitionKey === 'active_to_terminated') { ... }
🟠 SOWAYE-20-B | Bulk Lifecycle Change Does Not Fire Lifecycle Automations
Path: server/src/controllers/people.controller.ts — bulkUpdateLifecycle



user.lifecycle_state = targetState;
await user.save();
await auditLogger.log(...);
// ← NO automation block, NO token revocation, NO welcome email
When bulkUpdateLifecycle is called to transition users to terminated, refresh tokens are not revoked. Terminated users retain active sessions. This is a security hole — a bulk termination action should fire the same automations as a single termination.

🟠 SOWAYE-20-C | No Role Restriction on Lifecycle Change Endpoints
Path: server/src/routes/people.routes.ts



router.put('/:id/lifecycle', updateUserLifecycle); // ← no role check
router.put('/bulk-lifecycle', bulkUpdateLifecycle); // ← no role check (+ unreachable due to route order)
Any authenticated user can terminate, archive, or change the lifecycle state of any other user in the company. Combined with the fact that archiving triggers PII anonymization (when the encoding bug is fixed), any employee could irreversibly wipe another person's data.

🟡 SOWAYE-20-D | onboarding → active Automation Is a TODO with No Implementation
Path: server/src/controllers/people.controller.ts lines 446–458



if (transitionKey === 'onboarding→active') {
  // TODO: Assign default Employee role from department's role mapping
  // For now, log the automation event
  await auditLogger.log({
    // ...
    after_state: { automation: 'default_role_assigned', note: 'Employee role assignment pending RBAC integration' },
  });
}
The audit log says "default_role_assigned" but the actual role assignment is a TODO that never happens. The audit log is lying — it creates a false record that a role was assigned when it wasn't. This could cause compliance or security issues if the audit trail is relied upon.

Fix: Change the audit log message to "default_role_assignment_pending" until the feature is implemented.

🟡 SOWAYE-20-E | is_active Not Set to false on terminated Transition
Path: server/src/controllers/people.controller.ts — updateUserLifecycle



if (targetState === 'active') {
  user.is_active = true;
}
// ← No is_active = false when moving to 'terminated'
if (targetState === 'archived') {
  user.is_active = false; // ← Only archived sets is_active=false
}
When a user is terminated, is_active remains true. This means terminated users can still appear in queries that filter by is_active: true (e.g., team membership queries, getUsers endpoint). A terminated user would still show up as active until manually archived.

Tickets: SOWAYE - 19a, 19b

Review Date: 2026-04-14

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

 

SOWAYE-19 — Define Custom Employee ID Formats
Files: server/src/models/Company.model.ts · server/src/models/User.model.ts

🔴 SOWAYE-19-A | No API Endpoint Exists to Update the employee_id_format
The Company model has an employee_id_format field, but there is no controller or route that allows setting or changing this field. Checking all routes:

GET /organization/* — department/team management only

No /company or /settings route exists

This means the feature described in SOWAYE-19 ("Define Custom Employee ID Formats") is not yet implemented on the backend. There is no way for an admin to change the format through the API — it can only be set directly in the database or via the seed script.

🟡 SOWAYE-19-B | Regex Used in employee_id Generation Is Not Protected Against Injection
Path: server/src/models/User.model.ts — pre-save hook



this.employee_id = format.replace(/\{counter:(\d+)\}/, (match, digits) => {
  const paddingLength = parseInt(digits, 10);
  return counter.toString().padStart(paddingLength, '0');
});
The format string itself comes from the database (company.employee_id_format). If an admin ever has the ability to set this format (SOWAYE-19), and they set it to something like EMP-${'x'.repeat(10000)}, there's no length cap. A malicious or misconfigured format string could cause string operations to hang.

Fix: Add a max-length validator on the format field (e.g., max 50 characters) and sanitize the format before processing.

Tickets: SOWAYE - 18a, 18b, 18c

Review Date: 2026-04-14

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

 

SOWAYE-18 — Generate Employee IDs Automatically
Files: server/src/models/User.model.ts · server/src/models/Company.model.ts

🟠 SOWAYE-18-A | Employee ID Counter Race Condition Under Concurrent Requests
Path: server/src/models/User.model.ts — pre('save') hook



UserSchema.pre('save', async function() {
  if (this.isNew && !this.employee_id) {
    const company = await Company.findOneAndUpdate(
      { _id: this.company_id },
      { $inc: { employee_id_counter: 1 } },
      { new: true }
    );
    // ...generate ID from counter
  }
});
The $inc on the company counter is atomic — this part is correct. However, the counter starts at 1 (the default) and the first user ever created gets ID with counter = 1. The issue is that employee_id_counter default is 1, but the pre-save hook increments it then uses the result. This means the very first employee gets counter 2 (incremented from the default 1), skipping 1.

More importantly, if the user document fails to save after the counter increment (e.g., due to a validation error), the counter is permanently incremented with no user to show for it — creating gaps in employee IDs. Gaps are expected, but should be documented.

🟡 SOWAYE-18-B | No Validation That employee_id_format Contains the {counter:N} Placeholder
Path: server/src/models/Company.model.ts



employee_id_format: { type: String, default: 'EMP-{counter:5}' },
The format string is stored without validating that it contains the {counter:N} placeholder. If an admin sets the format to "EMPLOYEE" (no counter), the pre-save regex replace silently does nothing and all users get the same employee_id = "EMPLOYEE". This causes a duplicate key error on the second user created — a confusing, cryptic failure.

Fix: Add a Mongoose validator:



employee_id_format: {
  type: String,
  default: 'EMP-{counter:5}',
  validate: {
    validator: (v: string) => /\{counter:\d+\}/.test(v),
    message: 'employee_id_format must contain a {counter:N} placeholder',
  },
},
🟡 SOWAYE-18-C | Employee ID Exposed in Invite Email Plain-Text
Path: server/src/lib/emailService.ts — welcome email template



<strong>Your Employee ID:</strong> ${employee_id}<br>
This is by design for the welcome email. However, the employee_id is now also exposed in the invite link URL query string and audit logs. Treating it as sensitive (which it is in many HR systems) means it should not appear in URLs.

Tickets: SOWAYE - 17a, 17b, 17c, 17d, 17e, 17f

Review Date: 2026-04-14

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

 

SOWAYE-17 — Create and Invite Users
Files: server/src/controllers/people.controller.ts · server/src/routes/people.routes.ts

🔴 SOWAYE-17-A | Temporary Password Exposed in Plain Text in Email URL
Path: server/src/controllers/people.controller.ts line 260



invite_link: `${process.env.CLIENT_URL}/onboarding?token=${tempPassword}&email=${user.email}`,
The raw plaintext temporary password is embedded directly in the invite URL as a query parameter. This means:

The password appears in email server logs, browser history, proxy logs, and any HTTP referrer headers if the user clicks any link after landing on the page.

The user's email is also in the URL — clicking any external link from that onboarding page will leak both credentials via the Referer header.

No expiry exists — if the email is forwarded or the link is shared, it's valid forever.

Fix: Generate a separate, time-limited, single-use invite token stored in a dedicated InviteToken collection. The URL should only contain the token, with the email verified server-side.



// Use a cryptographic token, not the password
const inviteToken = crypto.randomBytes(32).toString('hex');
await InviteToken.create({
  user_id: user._id,
  token_hash: crypto.createHash('sha256').update(inviteToken).digest('hex'),
  expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours
});
invite_link: `${process.env.CLIENT_URL}/onboarding?token=${inviteToken}` // email NOT in URL
🔴 SOWAYE-17-B | Bulk Invite Processes Users Sequentially — N+1 DB Queries
Path: server/src/controllers/people.controller.ts — bulkInviteUsers



for (let i = 0; i < input.users.length; i++) {
  const existingUser = await User.findOne(...); // 1 query per user
  const user = await User.create(...);          // 1 query per user
  await auditLogger.log(...);                   // 1 query per user
}
For 500 users (the maximum allowed), this fires 1,500+ sequential database queries. This will:

Time out on any reasonable HTTP gateway (30-60 second limit)

Block the entire Node.js event loop

Potentially crash the server

Fix: Use insertMany with ordered: false for bulk creation, batch the duplicate-check via a single find with $in, and batch audit logs.

🟠 SOWAYE-17-C | console.log of Full User Request Body in Production
Path: server/src/controllers/people.controller.ts line 292



console.log("Update User Request Body:", req.body);
This logs all user profile data — including phone numbers, custom fields, and potentially sensitive HR data — to standout on every user update. This is a serious data-exposure risk in any log-forwarding setup.

🟠 SOWAYE-17-D | No Role Authorization on Invite Endpoint
Path: server/src/routes/people.routes.ts



router.post('/invite', inviteUser);         // ← no role restriction
router.post('/bulk-invite', bulkInviteUsers); // ← no role restriction
Any authenticated user — including employee role — can invite new users to the company, generating accounts and sending emails on the company's behalf.

🟡 SOWAYE-17-E | Invited User's Audit Log Snapshot Includes password_hash
Path: server/src/controllers/people.controller.ts — inviteUser (and similar)



await auditLogger.log({
  // ...
  after_state: user.toObject(), // ← includes password_hash in the audit log!
});
user.toObject() returns the full Mongoose document, including password_hash. This hash is written to the AuditEvent collection in MongoDB. While a bcrypt hash cannot be reversed easily, storing it in audit logs:

Violates data minimization principles (GDPR, etc.)

Means anyone with read access to audit logs gets the hash (useful for offline attacks)

Fix:



const { password_hash, refresh_token_hash, ...safeState } = user.toObject();
await auditLogger.log({ ..., after_state: safeState });
🟡 SOWAYE-17-F | email Not Normalized to Lowercase on Invite
Path: server/src/controllers/people.controller.ts — InviteUserSchema

The InviteUserSchema accepts email as-is without forcing it to lowercase:



email: z.string().email('Invalid email address'),
// no .toLowerCase() transform
Meanwhile, the User model schema has email: { ..., lowercase: true }, meaning Mongoose lowercases it on save. But the duplicate check before creation uses the raw input:



const existingUser = await User.findOne({
  company_id: req.user.company_id,
  email: input.email, // ← could be "John@EXAMPLE.COM"
});
If the existing user is stored as "john@example.com", this check would miss the duplicate for "John@EXAMPLE.COM", and create a second account with duplicate email (or throw a duplicate key error from MongoDB — an unhandled path).

Fix: Add .transform(v => v.toLowerCase()) to the email field in the Zod schema.

 Tickets: SOWAYE-7a, 7b, 7c, 7d, 7e

Review Date: 2026-04-14

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

 

SOWAYE-7 — Create and Manage Teams within Departments
Files: server/src/controllers/teams.controller.ts · server/src/routes/teams.routes.ts

🟠 SOWAYE-7-A | No Role Authorization on Team Mutation Endpoints
Path: server/src/routes/teams.routes.ts



router.post('/', createTeam);   // ← no role restriction
router.put('/:id', updateTeam); // ← no role restriction
router.delete('/:id', deleteTeam); // ← no role restriction
router.post('/:id/members', addTeamMember);  // ← no role restriction
router.delete('/:id/members/:memberId', removeTeamMember); // ← no role restriction
Any authenticated employee can create a team, add themselves as a team lead, and remove other members. This is a significant authorization gap for an admin panel.

🟠 SOWAYE-7-B | Team-Department Association Not Validated on Create
Path: server/src/controllers/teams.controller.ts — createTeam



const input = CreateTeamSchema.parse(req.body);
// ← department_id is validated as a string but NEVER checked against the DB
const team = await Team.create({ ...input, company_id: req.user.company_id });
A user can pass any string as department_id — including another company's department ID. The team is created without verifying:

That the department exists

That the department belongs to req.user.company_id

That the department is active

Fix:



const dept = await Department.findOne({
  _id: input.department_id,
  company_id: req.user.company_id,
  is_active: true,
});
if (!dept) throw new AppError('Department not found or access denied', 404, 'NOT_FOUND');
🟠 SOWAYE-7-C | Team Lead Not Validated Against Company Boundary
Path: server/src/controllers/teams.controller.ts — createTeam and updateTeam



team_lead_id: z.string().optional().nullable()
// ← stored directly with no DB validation
The team_lead_id field is accepted and stored without checking that the user:

Exists in the database

Belongs to req.user.company_id

Is active

A malicious actor could assign a user from a different company as team lead, potentially exposing that user's profile information.

🔵 SOWAYE-7-D | console.log with Full Request Body Left in Production
Path: server/src/controllers/teams.controller.ts line 138



console.log("Update Team Request Body:", req.body);
Same issue as SOWAYE-6-E. Debug statement logging full request body. Remove before production.

🔵 SOWAYE-7-E | enrichTeams Uses any[] Throughout
Path: server/src/controllers/teams.controller.ts lines 36-51



async function enrichTeams(teams: any[]): Promise<any[]> {
Both input and output types are any[]. This function handles sensitive team data and fully disables type checking.

 

Tickets: SOWAYE-6a, 6b, 6c, 6d, 6e, 6f

Review Date: 2026-04-14

Severity Legend

Icon

Level

🔴

Critical — Security risk or broken behavior

🟠

High — Must fix before production

🟡

Medium — Fix before v1.0

🔵

Low — Standards / professionalism

SOWAYE-6 — Create and Manage Departments

Files: server/src/controllers/organization.controller.ts · server/src/routes/organization.routes.ts · server/src/models/Department.model.ts

🔴 SOWAYE-6-A | Route Shadowing: /business-units/:id is never reachable

Path: server/src/routes/organization.routes.ts



router.get('/:id', getDepartmentById);           // line 22 — registered FIRST
router.delete('/business-units/:id', deleteBusinessUnit); // line 27 — NEVER REACHED
Problem: Express matches from top-to-bottom. When a DELETE /organization/business-units/abc123 request arrives, Express sees the /:id pattern registered on line 22 and matches id = "business-units", then tries /:id which also exists as GET — ultimately it sends a 404 or wrong response. The deleteBusinessUnit handler is effectively dead code.

Fix: Register all static path segments before parameterized routes:



// Static routes first
router.get('/tree', getOrgTree);
router.get('/bu-tree', getBUTree);
router.get('/business-units', getBusinessUnits);
router.get('/health', getOrgHealth);
router.get('/history', getOrgHistory);
router.delete('/business-units/:id', deleteBusinessUnit); //  before /:id
// Parameterized routes last
router.get('/:id', getDepartmentById);
router.put('/:id', updateDepartment);
router.put('/:id/move', moveDepartment);
router.delete('/:id', deleteDepartment);
 

 

🟠 SOWAYE-6-B | No Authorization Check on Mutation Endpoints — Any Authenticated User Can Create/Delete Departments

Path: server/src/routes/organization.routes.ts



router.post('/', createDepartment);    // ← no role check
router.put('/:id', updateDepartment);  // ← no role check
router.delete('/:id', deleteDepartment); // ← no role check
The entire organization route group applies only requireAuth. Any authenticated user — including a basic employee — can create, update, delete, and move departments. Compare this to roles routes which uses requireRole(['Super Admin', 'HR Admin', 'IT Admin']).

Fix: Wrap all mutation routes with appropriate role guards:



const DEPT_MANAGERS = ['Super Admin', 'HR Admin', 'Ops Admin'];
router.post('/', requireRole(DEPT_MANAGERS), createDepartment);
router.put('/:id', requireRole(DEPT_MANAGERS), updateDepartment);
router.delete('/:id', requireRole(DEPT_MANAGERS), deleteDepartment);
 

 

🟠 SOWAYE-6-C | No Input Sanitization on date_from / date_to Query Params — Potential DoS

Path: server/src/controllers/organization.controller.ts — getOrgHistory function



const { object_type, date_from, date_to } = req.query;
// ...
if (date_from) {
  (query.created_at as any).$gte = new Date(date_from as string); // ← raw user input
}
new Date(undefined) = Invalid Date. new Date("not-a-date") = Invalid Date. MongoDB will receive Invalid Date as the query value and either silently fail, return wrong results, or throw an uncaught error.

Additionally, object_type is passed directly to the MongoDB query without validation against an allowed list — a user can pass any arbitrary string and probe the model's internal field names.

Fix:



const ALLOWED_OBJECT_TYPES = ['Department', 'Team', 'BusinessUnit'];
if (object_type && !ALLOWED_OBJECT_TYPES.includes(String(object_type))) {
  throw new AppError('Invalid object_type filter', 400, 'INVALID_FILTER');
}
const fromDate = date_from ? new Date(String(date_from)) : null;
if (fromDate && isNaN(fromDate.getTime())) {
  throw new AppError('Invalid date_from format', 400, 'INVALID_DATE');
}
 

 

🟡 SOWAYE-6-D | No Cascading Validation When Deleting Departments

Path: server/src/controllers/organization.controller.ts — deleteDepartment

When a department is soft-deleted, there is no check for:

Active users still assigned to it

Child departments still pointing to it as parent_id

Teams with department_id pointing to it

The deleteBusinessUnit handler blocks deletion if children exist (line 621), but the generic deleteDepartment handler for non-BU departments has no such guard — it silently soft-deletes and leaves all related records pointing to a now-inactive department.

 

 

 

🟠 SOWAYE-6-E | console.log with Full Request Body Left in Production Code

Path: server/src/controllers/organization.controller.ts line 201



console.log("Update Department Request Body:", req.body);
This is a debug statement left from development. It logs the entire request body to standout on every department update — which may include sensitive manager IDs and custom fields. In a production environment with log aggregation, this is a data leak.

Fix: Remove this line entirely. Use structured logging with debug level if tracing is needed.

 

 

🔵 SOWAYE-6-F | Pervasive as any Type Assertions — 24+ Instances in Organization Controller Alone

 

Path: server/src/controllers/organization.controller.ts



} as any);  // lines 157, 175, 212, 227, 277, 316, 356 ... (24+ occurrences)
The as any cast is used on almost every Mongoose query in this file. This defeats TypeScript's type system entirely, hiding potential runtime errors. The root cause is that the Mongoose model types aren't properly aligned with the query structures.

Fix: Define proper TypeScript interfaces for query filters and align Mongoose model types:

 



interface DepartmentFilter {
  company_id: string;
  is_active?: boolean;
  type?: string;
  parent_id?: string | null;
}
const filter: DepartmentFilter = { company_id: req.user.company_id, is_active: true };
await Department.find(filter); // no cast needed

