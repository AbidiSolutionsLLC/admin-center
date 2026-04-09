# Sprint 1 Verification Guide

This guide will walk you through the process of testing the **Authentication**, **Organization**, and **People** modules implemented in Sprint 1.

---

## 1. Initial Setup

### Step 1: Create your Admin User
Open a terminal in the `server` directory and run the following command:
```bash
npm run seed
```
> [!IMPORTANT]
> Your credentials are now:
> - **Email**: `admin@example.com`
> - **Password**: `password123`

### Step 2: Start the Servers
Ensure both backend and frontend are running:
- **Server**: `npm run dev` (in `server/`)
- **Client**: `npm run dev` (in `client/`)
- **Access**: Go to `http://localhost:5173`

---

## 2. Testing Authentication

- [ ] **Login**: Go to the login page and use the admin credentials.
    - Expected: Redirected to `/overview` or `/dashboard`.
- [ ] **Persistance**: Refresh the page.
    - Expected: You should remain logged in.
- [ ] **Logout**: Click the sign-out button in the sidebar.
    - Expected: Redirected back to the login page.
- [ ] **Security**: Try to visit `http://localhost:5173/organization` while logged out.
    - Expected: Redirected to login.

---

## 3. Testing Organization Module (Tayyab)

Go to the **Organization** tab in the sidebar.

- [ ] **Department Table**: You should see an empty table (or one with default depts if seeded).
- [ ] **Create Department**:
    - Click **"Create Department"**.
    - Add "Engineering", select "Department" as type.
    - Expected: Row appears in the table with "Active" status.
- [ ] **Edit Department**:
    - Click "Edit" on a department row.
    - Change the name to "Core Engineering".
    - Expected: Name updates immediately.
- [ ] **Org Chart View**:
    - Switch the view toggle to **"Org Chart"**.
    - Expected: You see a hierarchical tree view of your departments.
- [ ] **Archive Department**:
    - Click "Archive" on a row.
    - Confirm the dialog.
    - Expected: Status changes to "Archived" (or disappears from active view).

---

## 4. Testing People Module (Hammad)

Go to the **People** tab in the sidebar.

- [ ] **User List**: You should see yourself (Admin User) in the list.
- [ ] **Invite User**:
    - Click **"Invite User"**.
    - Enter `new.hire@example.com`.
    - Expected: User appears in the list with "Invited" status.
- [ ] **Lifecycle Transition**:
    - Open the lifecycle selector for the new user.
    - Change status from `Invited` to `Onboarding` or `Active`.
    - Expected: Status badge updates and timestamp is recorded.
- [ ] **Bulk Invite**:
    - Try uploading a sample CSV with `full_name,email` headers.
    - Expected: Preview appears, and users are created after confirmation.

---

## 5. Testing Intelligence (Automated Checks)

- [ ] **RULE-02**: Create a department with no manager.
    - Expected: A warning dot appears on the row, or an intelligence banner appears at the top.
- [ ] **RULE-03**: Check if users with no department show a warning signal.

---

## 6. Audit Logs

- [ ] **Audit Trail**: Every action above (creating depts, inviting users) should generate an entry in the backend `AuditLog` collection. (You can check this via MongoDB Compass or a future Audit page).
