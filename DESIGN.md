# Karbexa Admin: design rules

Shared tokens (brand amber, charcoal, text and surface colours) are defined once in `../docs/DESIGN.md`. This file covers how the **Admin** web app applies them. Admin uses a **dark glass** theme on purpose: it signals "admin mode" next to the light products app.

## Where the theme lives

| File | Holds |
|---|---|
| `client/tailwind.config.ts` | Tailwind tokens: `primary` (amber), `surface`, `ink` (text), `line` (borders), `sidebar`, semantic `success/warning/error/info`, shadows, radii, fonts |
| `client/src/index.css` | CSS variables (`--primary`, `--bg-color`, glass values) and utility classes (`.glass-panel`, `.glass-card`) |
| `client/src/constants/theme.ts` | The same values for code that needs them in JS (charts, inline styles) |
| `client/src/components/ui/` | Shared components: `button`, `input`, `card`, `checkbox`, `switch` (shadcn), `DataTable`, `Modal`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `StatusBadge`, `TableSkeleton`, `PermissionGate`, user/role pickers |
| `client/src/components/layout/` | `AdminShell` (sidebar + top bar), `AuthLayout` (signed-out pages), `AppLauncher` |
| `server/src/identity/html.ts` | Hosted sign-in pages (server-rendered; dark skin for Admin, see `shellForClient`) |

## Rules

1. **Tokens only.** Use `bg-primary`, `text-ink`, `text-ink-secondary`, `border-line`, `bg-surface`, `.glass-card`. Do not add hex values. `bg-white`, `bg-card` and `bg-surface-base` are not defined in this theme: they render as transparent or as a light patch on a dark page.
2. **Amber buttons use dark text** (`text-black`); white on amber fails contrast.
3. **Pages** sit inside `AdminShell`. A list page uses `DataTable` with `TableSkeleton` while loading, `EmptyState` when empty and `ErrorState` on failure.
4. **Signed-out pages** use `AuthLayout` with a card of class `AUTH_CARD_CLASS`.
5. **Permissions:** hide controls the user cannot use with `PermissionGate` / `useMyPermissions`. The server still enforces every rule; the UI only hides.
6. **Forms:** `react-hook-form` + zod; field errors under the field in `text-error`.
7. **Data:** TanStack Query hooks in `features/<area>/hooks/`; query keys in `constants/queryKeys.ts`.

## Adding a page

1. Add the path to `client/src/constants/routes.ts` and the route to `client/src/App.tsx` (inside the guarded `AdminShell` routes).
2. Add a sidebar entry in `components/layout/Sidebar.tsx`, gated by permission if needed.
3. Put data hooks in `features/<area>/hooks/` and components in `features/<area>/components/`.
4. Use the shared components above. Check loading, empty, error and no-permission states.
5. `npm run build` must stay green.
6. Document the page in `docs/portals/admin.md` (or `operator.md`).

Older design notes (blue palette, page-by-page audits) are in `docs/archive/design-system-2026-06/`. They are background only; this file and `../docs/DESIGN.md` win.
