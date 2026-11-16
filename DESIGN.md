# Karbexa Admin: design rules

Shared tokens (brand amber, charcoal, text and surface colours) are defined once in `../docs/DESIGN.md`. This file covers how the **Admin** web app applies them. Admin uses a **dark glass** theme on purpose: it signals "admin mode" next to the light products app.

## Where the theme lives

| File | Holds |
|---|---|
| `client/tailwind.config.ts` | Tailwind tokens: `primary` (amber), `surface`, `ink` (text), `line` (borders), `sidebar`, semantic `success/warning/error/info`, shadows, radii, fonts |
| `client/src/index.css` | CSS variables (`--primary`, `--bg-color`, glass values) and utility classes (`.glass-panel`, `.glass-card`) |
| `client/src/constants/theme.ts` | The same values for code that needs them in JS (charts, inline styles) |
| `client/src/components/ui/` | Shared components: `button`, `input`, `card`, `checkbox`, `switch` (shadcn), `DataTable`, `Modal`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `StatusBadge`, `TableSkeleton`, `PermissionGate`, user/role pickers, and the elevation kit (see "Shared kit" below) |
| `client/src/components/layout/` | `AppShell` + `navigation.ts` (the two shell configs) + `shells.tsx` (`TenantShell`, `OperatorShell`), `TenantTopActions`, `AuthLayout` (signed-out pages), `AppLauncher` |
| `client/src/components/templates/` | `ListPage`, `ObjectPage`, `DashboardPage`, `PageStates` |
| `server/src/identity/html.ts` | Hosted sign-in pages (server-rendered; dark skin for Admin, see `shellForClient`) |

## Rules

1. **Tokens only.** Use `bg-primary`, `text-ink`, `text-ink-secondary`, `border-line`, `bg-surface`, `.glass-card`. Do not add hex values. `bg-white`, `bg-card` and `bg-surface-base` are not defined in this theme: they render as transparent or as a light patch on a dark page.
2. **Amber buttons use dark text** (`text-black`); white on amber fails contrast.
3. **Pages** sit inside `AppShell` (through `TenantShell` or `OperatorShell`) and are built on a template (`ListPage`, `ObjectPage`, `DashboardPage`). A page file composes templates and feature components and has no layout CSS beyond grid placement. The template supplies the loading (`TableSkeleton`), empty (`EmptyState`), error (`ErrorState`) and no-access states.
4. **Signed-out pages** use `AuthLayout` with a card of class `AUTH_CARD_CLASS`.
5. **Permissions:** hide controls the user cannot use with `PermissionGate` / `useMyPermissions`. The server still enforces every rule; the UI only hides.
6. **Forms:** `react-hook-form` + zod; field errors under the field in `text-error`.
7. **Data:** TanStack Query hooks in `features/<area>/hooks/`; query keys in `constants/queryKeys.ts`.

## Adding a page

1. Add the path to `client/src/constants/routes.ts` and the route to `client/src/App.tsx` (inside the guarded `TenantShell` routes; operator pages go inside the `OperatorShell` routes).
2. Add a navigation entry in `components/layout/navigation.ts` (`ADMIN_SHELL` or `OPERATOR_SHELL`), gated by `permission` or `roles` if needed.
3. Put data hooks in `features/<area>/hooks/` and components in `features/<area>/components/`.
4. Use the shared components above. Check loading, empty, error and no-permission states.
5. `npm run build` must stay green.
6. Document the page in `docs/portals/admin.md` (or `operator.md`).

## Shared kit (elevation Phase 3)

Same dark theme and the same colours; this adds structure only. The products app is not touched: the two apps keep two design languages (decision S-11).

**Tokens** (`tailwind.config.ts`, mirrored in `constants/theme.ts`; DRD section 9.1)

| Token | Use |
|---|---|
| `text-label` (12, uppercase, tracked) `text-table` (13) `text-body` (14) `text-section` (16) `text-title` (20) `text-tile` (28) | The type scale. Use `.tabular` on numbers |
| `max-w-content` (1280), `px-gutter` (24), `px-gutter-lg` (32 at 1440 and up) | Content width and gutters |
| `w-rail` (248), `w-rail-collapsed` (64), `h-topbar` (56) | Shell sizes |
| `h-row` / `min-h-row` (44), `h-row-compact` (36) | Table row heights |
| `rounded-control` (8), `rounded-card` (12) | Radii for controls, and cards and drawers |
| `duration-fast` (150 ms), `duration-panel` (200 ms) | Motion. A reduced-motion rule in `index.css` switches animation off |
| `h-dot` / `w-dot` (8) | Status dot |

**Components** (`components/ui/`)

| Component | Notes |
|---|---|
| `PageHeader` | Breadcrumb, title, subtitle, status, one primary action, overflow menu |
| `Toolbar`, `FilterChip` | Search, filters, sort, view actions. Keep filter state in the URL with `hooks/useUrlParam` |
| `StatTile`, `KeyFacts`, `SeatMeter`, `HealthPill`, `Tag`, `CopyField`, `Timeline` | Small display parts |
| `Tabs` | URL-synced (`?tab=`), on `@radix-ui/react-tabs` |
| `Drawer` | Right side, 480 or 640 px, focus-trapped, Esc closes, on `@radix-ui/react-dialog` |
| `SectionBoundary` | Own loading, error and empty state for one dashboard section; also catches render errors |
| `DataTable` | Adds `stickyHeader`, cursor `paging`, keyboard rows (Tab, Enter or Space, Up or Down) |
| `ConfirmDialog` | Adds `requireText` (typed confirmation) and `reasonField`; `onConfirm(reason?)` |
| `StatusBadge` | Dot plus word; the filled pill only for `variant="action-needed"` |
| `FormField`, `Textarea`, `Select` | Label, hint, error, required marker. Pass a function as `FormField` children to receive `id` and the aria props. Not built yet: `Combobox`, `DatePicker` |

**Shell.** `AppShell` takes a config (`ADMIN_SHELL` or `OPERATOR_SHELL` in `navigation.ts`), the permission list and role used to filter items, and a top-bar slot. The operator config adds a red "Operator" marker (the `error` token) and has no launcher or notifications.

**Templates** (`components/templates/`): `ListPage` (header, toolbar, table, row-detail drawer), `ObjectPage` (header, key facts, tabs), `DashboardPage` (header, tile row, 12-column grid of `SectionBoundary` sections). Settings pages are an `ObjectPage` variant (left sub-navigation, sticky save bar) and are built in Phase 5.

**A page is migrated when:** it uses a template, shows all five states (loading, error, empty, no access, populated), has one primary action, can be used from the keyboard, has no raw hex, and `npm run build` is green.

Older design notes (blue palette, page-by-page audits) are in `docs/archive/design-system-2026-06/`. They are background only; this file and `../docs/DESIGN.md` win.
