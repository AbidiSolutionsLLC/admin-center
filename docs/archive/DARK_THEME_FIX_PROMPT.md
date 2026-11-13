# ADMIN CENTER — Dark Theme Consistency Fix
# Agent: Antigravity | Skill: /ui-ux-pro-max/SKILL.md
# Mission: Hunt and fix every remaining white/light element. Full dark-glass consistency.

---

## READ BEFORE TOUCHING ANYTHING

```
1. Load /ui-ux-pro-max/SKILL.md — apply its principles on every decision
2. This is a COLOR FIX pass only. Zero changes to:
   - Business logic, hooks, API calls, TanStack Query, Zustand
   - TypeScript types, component props, exported signatures
   - Route structure, backend, auth
3. Your output is pure visual — how things LOOK, not what they DO
```

---

## THE PROBLEM

After the initial migration, these elements are still rendering with white/light backgrounds:

- `<select>` / shadcn `<Select>` / Radix dropdowns → white popup menus
- All `<input>`, `<textarea>`, `<select>` form fields → white/gray bg
- shadcn `<Dialog>` / `<Sheet>` inner content → white panel
- shadcn `<Popover>` / `<Command>` / `<DropdownMenu>` → white popups
- React Day Picker (shadcn `<Calendar>`) → white date picker
- Org chart drag-and-drop nodes (`@dnd-kit`) → white cards
- Permission matrix → white rows and checkboxes with white bg
- shadcn `<Tabs>` / `<TabsList>` → light gray pill
- shadcn `<Switch>` / toggles → gray off-state
- shadcn `<Checkbox>` → white box
- shadcn `<Badge>` → light colored backgrounds (uses Tailwind bg-X-50)
- shadcn `<Separator>` → light gray line
- shadcn `<Skeleton>` → light gray pulse
- Sonner toast → light bg in some states
- Scrollbars → default browser white/gray
- Table selected row → still using light amber bg-primary-light
- EmptyState / ErrorState container → still bg-white
- Filter bar input → still white bg
- TableSkeleton shimmer → still light colors
- bg-white and bg-[#F7F8FA] still scattered across page files
- OrgChart node border and background still white

---

## DESIGN TOKENS — THE ONLY REFERENCE

Use these values everywhere. No improvising colors.

### BACKGROUNDS
- Page bg:         #0b0f19
- Glass card:      linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))
- Glass field:     rgba(255,255,255,0.04)
- Glass hover:     rgba(255,255,255,0.06)
- Glass active:    rgba(255,255,255,0.08)
- Popup/dropdown:  linear-gradient(145deg, rgba(20,25,35,0.95), rgba(15,20,30,0.98))
- Modal panel:     linear-gradient(160deg, rgba(22,28,48,0.97), rgba(11,15,28,0.99))
- SideSheet:       same as modal panel
- Table header:    rgba(255,255,255,0.02)
- Table row hover: rgba(255,255,255,0.03)
- Selected row:    rgba(245,176,42,0.08)
- Skeleton base:   rgba(255,255,255,0.06)
- Skeleton shine:  rgba(255,255,255,0.10)

### BORDERS
- Standard:  rgba(255,255,255,0.08)
- Hover:     rgba(255,255,255,0.14)
- Focus:     rgba(245,176,42,0.35)
- Divider:   rgba(255,255,255,0.06)

### TEXT
- Primary:     #f8fafc
- Secondary:   #94a3b8
- Muted:       rgba(148,163,184,0.6)
- Placeholder: rgba(148,163,184,0.45)

### PRIMARY
- Solid:    #f5b02a
- Gradient: linear-gradient(135deg, #f5b02a, #fcd34d)
- Bg tint:  rgba(245,176,42,0.10)
- Border:   rgba(245,176,42,0.20)
- Glow:     0 0 20px rgba(245,176,42,0.35)

### SEMANTIC
- Success: text #34d399  | bg rgba(16,185,129,0.12)  | border rgba(16,185,129,0.25)
- Warning: text #fbbf24  | bg rgba(245,176,42,0.12)  | border rgba(245,176,42,0.25)
- Error:   text #f87171  | bg rgba(239,68,68,0.12)   | border rgba(239,68,68,0.25)
- Info:    text #60a5fa  | bg rgba(59,130,246,0.12)  | border rgba(59,130,246,0.25)

### SHADOWS
- Glass card:  0 8px 32px rgba(0,0,0,0.37)
- Popup:       0 8px 32px rgba(0,0,0,0.5)
- SideSheet:   -12px 0 60px rgba(0,0,0,0.6)
- Glow button: 0 4px 15px rgba(245,176,42,0.4)
- Focus ring:  0 0 0 3px rgba(245,176,42,0.06), 0 0 24px rgba(245,176,42,0.06)

---

## FIX #1 — GLOBAL CSS OVERRIDES (index.css / globals.css)

Open the main CSS file. Add these blocks. Do NOT remove existing glass utilities.

```css
/* ═══════════════════════════════════════════════════════
   DARK GLASS SYSTEM — GLOBAL OVERRIDES
═══════════════════════════════════════════════════════ */

/* 1. Native HTML inputs, selects, textareas */
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
textarea,
select {
  background: rgba(255,255,255,0.04) !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 12px !important;
  padding: 12px 16px !important;
  font-size: 14px !important;
  color: #f8fafc !important;
  outline: none !important;
  transition: all 0.25s ease !important;
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
}

input::placeholder,
textarea::placeholder {
  color: rgba(148,163,184,0.45) !important;
}

input:focus,
textarea:focus,
select:focus {
  background: rgba(255,255,255,0.07) !important;
  border-color: rgba(245,176,42,0.35) !important;
  box-shadow: 0 0 0 3px rgba(245,176,42,0.06), 0 0 24px rgba(245,176,42,0.06) !important;
}

input:disabled,
textarea:disabled,
select:disabled {
  opacity: 0.4 !important;
  cursor: not-allowed !important;
}

/* 2. Native select options */
select option {
  background: #141925 !important;
  color: #f8fafc !important;
}

/* 3. Form labels */
label:not([class*="switch"]):not([class*="checkbox"]) {
  display: block;
  font-size: 10px !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.14em !important;
  color: #94a3b8 !important;
  margin-bottom: 8px !important;
}

/* 4. Radix / shadcn — Popovers & Dropdowns */
[data-radix-popper-content-wrapper] > div,
[data-radix-select-content],
[data-radix-dropdown-menu-content],
[data-radix-context-menu-content],
[data-radix-popover-content],
[data-radix-tooltip-content],
[role="dialog"][data-state],
[role="listbox"] {
  background: linear-gradient(145deg, rgba(20,25,35,0.97) 0%, rgba(15,20,30,0.99) 100%) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255,255,255,0.09) !important;
  border-radius: 16px !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
  color: #f8fafc !important;
}

/* 5. Radix Select / Dropdown items */
[data-radix-select-item],
[data-radix-dropdown-menu-item],
[role="option"] {
  color: #94a3b8 !important;
  border-radius: 8px !important;
  font-size: 13px !important;
}

[data-radix-select-item][data-highlighted],
[data-radix-dropdown-menu-item][data-highlighted],
[role="option"]:hover,
[role="option"][aria-selected="true"] {
  background: rgba(245,176,42,0.10) !important;
  color: #f5b02a !important;
  outline: none !important;
}

[data-radix-select-item][data-state="checked"] {
  color: #f5b02a !important;
}

/* 6. shadcn Select trigger */
[role="combobox"],
button[aria-haspopup="listbox"] {
  background: rgba(255,255,255,0.04) !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 12px !important;
  color: #f8fafc !important;
  transition: all 0.2s ease !important;
}

[role="combobox"]:hover,
button[aria-haspopup="listbox"]:hover {
  background: rgba(255,255,255,0.07) !important;
  border-color: rgba(255,255,255,0.14) !important;
}

/* 7. Dialog / Sheet panel */
[data-radix-dialog-content],
[data-radix-sheet-content] {
  background: linear-gradient(160deg, rgba(22,28,48,0.97) 0%, rgba(11,15,28,0.99) 100%) !important;
  backdrop-filter: blur(32px) !important;
  -webkit-backdrop-filter: blur(32px) !important;
  border: 1px solid rgba(255,255,255,0.09) !important;
  border-radius: 24px !important;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6) !important;
  color: #f8fafc !important;
}

[data-radix-sheet-content][data-side="right"] {
  border-radius: 28px 0 0 28px !important;
  box-shadow: -12px 0 60px rgba(0,0,0,0.6) !important;
}

[data-radix-dialog-overlay],
[data-radix-sheet-overlay] {
  background: rgba(6,8,13,0.78) !important;
  backdrop-filter: blur(6px) !important;
  -webkit-backdrop-filter: blur(6px) !important;
}

/* 8. Command palette */
[cmdk-root],
[cmdk-dialog] {
  background: linear-gradient(145deg, rgba(20,25,35,0.97) 0%, rgba(15,20,30,0.99) 100%) !important;
  border: 1px solid rgba(255,255,255,0.09) !important;
  border-radius: 20px !important;
  backdrop-filter: blur(24px) !important;
}

[cmdk-input] {
  background: transparent !important;
  border: none !important;
  border-bottom: 1px solid rgba(255,255,255,0.06) !important;
  border-radius: 0 !important;
  color: #f8fafc !important;
  padding: 16px 20px !important;
}

[cmdk-item] {
  color: #94a3b8 !important;
  border-radius: 8px !important;
  padding: 10px 14px !important;
  font-size: 13px !important;
}

[cmdk-item][aria-selected="true"],
[cmdk-item]:hover {
  background: rgba(245,176,42,0.10) !important;
  color: #f5b02a !important;
}

[cmdk-group-heading] {
  color: rgba(148,163,184,0.5) !important;
  font-size: 10px !important;
  font-weight: 900 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.16em !important;
}

/* 9. React Day Picker / shadcn Calendar */
.rdp,
.rdp-root,
[class*="rdp"] {
  background: linear-gradient(145deg, rgba(20,25,35,0.97) 0%, rgba(15,20,30,0.99) 100%) !important;
  border: 1px solid rgba(255,255,255,0.09) !important;
  border-radius: 16px !important;
  padding: 16px !important;
  color: #f8fafc !important;
}

.rdp-button:hover:not(.rdp-day_selected),
.rdp-nav_button:hover {
  background: rgba(255,255,255,0.08) !important;
}

.rdp-day_selected,
.rdp-day_selected:hover {
  background: #f5b02a !important;
  color: #000 !important;
  font-weight: 700 !important;
}

.rdp-day_today:not(.rdp-day_selected) {
  border: 1px solid rgba(255,255,255,0.15) !important;
  background: rgba(255,255,255,0.05) !important;
}

.rdp-head_cell {
  color: rgba(148,163,184,0.5) !important;
  font-size: 10px !important;
  font-weight: 900 !important;
  text-transform: uppercase !important;
}

/* 10. shadcn Tabs */
[role="tablist"] {
  background: rgba(255,255,255,0.04) !important;
  border: 1px solid rgba(255,255,255,0.07) !important;
  border-radius: 12px !important;
  padding: 4px !important;
}

[role="tab"] {
  color: #94a3b8 !important;
  border-radius: 9px !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  transition: all 0.2s ease !important;
}

[role="tab"][data-state="active"],
[role="tab"][aria-selected="true"] {
  background: rgba(245,176,42,0.12) !important;
  color: #f5b02a !important;
  box-shadow: none !important;
}

/* 11. shadcn Checkbox */
[role="checkbox"],
button[role="checkbox"] {
  background: rgba(255,255,255,0.05) !important;
  border: 1px solid rgba(255,255,255,0.15) !important;
  border-radius: 5px !important;
  transition: all 0.2s ease !important;
}

[role="checkbox"][data-state="checked"],
button[role="checkbox"][aria-checked="true"] {
  background: #f5b02a !important;
  border-color: #f5b02a !important;
  color: #000 !important;
}

/* 12. shadcn Switch */
[role="switch"],
button[role="switch"] {
  background: rgba(255,255,255,0.10) !important;
  border: 1px solid rgba(255,255,255,0.06) !important;
  transition: all 0.25s ease !important;
}

[role="switch"][data-state="checked"],
button[role="switch"][aria-checked="true"] {
  background: #f5b02a !important;
  border-color: rgba(245,176,42,0.5) !important;
  box-shadow: 0 0 12px rgba(245,176,42,0.3) !important;
}

[role="switch"] span { background: rgba(255,255,255,0.7) !important; }
[role="switch"][data-state="checked"] span { background: #000 !important; }

/* 13. Badge color overrides (replace Tailwind bg-X-50) */
.bg-emerald-50  { background: rgba(16,185,129,0.12) !important; }
.text-emerald-700, .text-emerald-600 { color: #34d399 !important; }
.border-emerald-200 { border-color: rgba(16,185,129,0.25) !important; }

.bg-amber-50, .bg-yellow-50 { background: rgba(245,176,42,0.12) !important; }
.text-amber-700, .text-amber-600 { color: #fbbf24 !important; }
.border-amber-200 { border-color: rgba(245,176,42,0.25) !important; }

.bg-red-50 { background: rgba(239,68,68,0.12) !important; }
.text-red-700, .text-red-600 { color: #f87171 !important; }
.border-red-200 { border-color: rgba(239,68,68,0.25) !important; }

.bg-sky-50, .bg-blue-50 { background: rgba(59,130,246,0.12) !important; }
.text-sky-700, .text-blue-700 { color: #60a5fa !important; }
.border-sky-200, .border-blue-200 { border-color: rgba(59,130,246,0.25) !important; }

.bg-violet-50, .bg-purple-50 { background: rgba(168,85,247,0.12) !important; }
.text-violet-700 { color: #c084fc !important; }
.border-violet-200 { border-color: rgba(168,85,247,0.25) !important; }

.bg-gray-50, .bg-slate-50 { background: rgba(255,255,255,0.05) !important; }
.text-gray-500, .text-slate-500 { color: #94a3b8 !important; }
.border-gray-200, .border-slate-200 { border-color: rgba(255,255,255,0.08) !important; }

/* 14. Separator / HR */
[role="separator"], hr, .separator {
  background: rgba(255,255,255,0.07) !important;
  border: none !important;
  height: 1px !important;
}

/* 15. Skeleton pulse */
div.animate-pulse, span.animate-pulse {
  background: rgba(255,255,255,0.06) !important;
}

/* 16. Scrollbars */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.12) transparent;
}
*::-webkit-scrollbar { width: 6px; height: 6px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.10);
  border-radius: 10px;
}
*::-webkit-scrollbar-thumb:hover {
  background: rgba(245,176,42,0.35);
}

/* 17. Sonner Toasts */
[data-sonner-toaster] [data-sonner-toast] {
  background: linear-gradient(145deg, rgba(20,25,35,0.97) 0%, rgba(15,20,30,0.99) 100%) !important;
  backdrop-filter: blur(12px) !important;
  border: 1px solid rgba(255,255,255,0.09) !important;
  border-radius: 14px !important;
  color: #f8fafc !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
}
[data-sonner-toast][data-type="success"] { border-left: 3px solid #34d399 !important; }
[data-sonner-toast][data-type="error"]   { border-left: 3px solid #f87171 !important; }
[data-sonner-toast][data-type="warning"] { border-left: 3px solid #fbbf24 !important; }

/* 18. Tooltip */
[data-radix-tooltip-content] {
  background: rgba(22,28,48,0.97) !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  border-radius: 10px !important;
  color: #f8fafc !important;
  font-size: 12px !important;
  padding: 7px 12px !important;
}

/* 19. Progress bar */
[data-radix-progress-root], [role="progressbar"] {
  background: rgba(255,255,255,0.08) !important;
  border-radius: 9999px !important;
}
[data-radix-progress-indicator] {
  background: linear-gradient(90deg, #f5b02a, #fcd34d) !important;
  border-radius: 9999px !important;
}

/* 20. AlertDialog */
[role="alertdialog"] > div {
  background: linear-gradient(160deg, rgba(22,28,48,0.97) 0%, rgba(11,15,28,0.99) 100%) !important;
  border: 1px solid rgba(255,255,255,0.09) !important;
  border-radius: 20px !important;
  backdrop-filter: blur(24px) !important;
}

/* 21. Accordion */
[data-radix-accordion-content],
[data-radix-accordion-trigger] {
  background: transparent !important;
  color: #f8fafc !important;
  border-bottom: 1px solid rgba(255,255,255,0.07) !important;
}
[data-radix-accordion-trigger]:hover {
  background: rgba(255,255,255,0.03) !important;
}

/* 22. Remaining white/light bg patterns */
.bg-white { background: rgba(255,255,255,0.03) !important; }
.bg-gray-50, .bg-slate-50, .bg-neutral-50 { background: rgba(255,255,255,0.03) !important; }
.bg-gray-100, .bg-slate-100 { background: rgba(255,255,255,0.05) !important; }
.bg-\[#F7F8FA\], .bg-\[#F1F3F7\] { background: rgba(255,255,255,0.02) !important; }
.text-gray-900, .text-slate-900 { color: #f8fafc !important; }
.text-gray-700, .text-slate-700 { color: #f8fafc !important; }
.text-gray-600, .text-slate-600 { color: #94a3b8 !important; }
.text-gray-500, .text-slate-500 { color: #94a3b8 !important; }
.text-gray-400, .text-slate-400 { color: rgba(148,163,184,0.6) !important; }
.border-gray-200, .border-slate-200 { border-color: rgba(255,255,255,0.08) !important; }
.divide-gray-200 > * + * { border-color: rgba(255,255,255,0.07) !important; }

/* 23. Focus ring */
:focus-visible {
  outline: none !important;
  box-shadow: 0 0 0 2px rgba(245,176,42,0.35) !important;
}
```

---

## FIX #2 — ORG CHART NODES (OrgChart.tsx)

PRESERVE all @dnd-kit drag handlers, onNodeClick, DndContext, SortableContext, useSortable, every prop and callback.
Only change the visual card wrapper and text styling.

Find the node card div (any variant of bg-white / border-2 / rounded-lg on the node wrapper) and replace with:

```tsx
<div
  style={{
    minWidth: 180,
    padding: '14px 16px',
    borderRadius: 14,
    border: node.isSelected
      ? '1px solid rgba(245,176,42,0.35)'
      : node.hasMissingManager
      ? '1px dashed rgba(245,176,42,0.40)'
      : '1px solid rgba(255,255,255,0.09)',
    background: node.isSelected
      ? 'rgba(245,176,42,0.09)'
      : 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    boxShadow: node.isSelected
      ? '0 0 20px rgba(245,176,42,0.12), 0 8px 32px rgba(0,0,0,0.37)'
      : '0 8px 32px rgba(0,0,0,0.37)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
  }}
  onMouseEnter={e => {
    if (!node.isSelected) {
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)';
      e.currentTarget.style.transform = 'translateY(-2px)';
    }
  }}
  onMouseLeave={e => {
    if (!node.isSelected) {
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)';
      e.currentTarget.style.transform = 'translateY(0)';
    }
  }}
>
  {node.isSelected && (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: 1,
      background: 'linear-gradient(90deg, rgba(245,176,42,0.5), transparent)',
      borderRadius: '14px 14px 0 0',
      pointerEvents: 'none',
    }} />
  )}
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
    <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(148,163,184,0.5)' }}>
      {node.type}
    </span>
    {node.has_intelligence_flag && (
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.6)', display: 'inline-block' }} />
    )}
  </div>
  <p style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', margin: 0 }}>{node.name}</p>
  {node.manager && (
    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{node.manager.full_name}</p>
  )}
  <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', marginTop: 6 }}>{node.headcount} members</p>
</div>
```

Also add to global CSS for connector lines:
```css
.org-chart-line,
[class*="org-chart"] line,
[class*="org-chart"] path,
svg[class*="tree"] line,
svg[class*="tree"] path {
  stroke: rgba(255,255,255,0.12) !important;
}
```

---

## FIX #3 — PERMISSION MATRIX (PermissionMatrix.tsx)

PRESERVE all checkbox onChange handlers, batch save logic, permission state. Restyle shell only.

```tsx
// Container wrapper
style={{
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(12px)',
  overflow: 'hidden',
}}

// Header row
style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}

// Column header cells
style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(148,163,184,0.5)', textAlign: 'center', padding: '12px 8px' }}

// Module name cell (left sticky column)
style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', padding: '14px 20px', background: 'rgba(255,255,255,0.02)' }}

// Data rows
style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.15s ease' }}
onMouseEnter: e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
onMouseLeave: e.currentTarget.style.background = 'transparent'

// Grant all / Clear all link
style={{ fontSize: 11, fontWeight: 700, color: '#f5b02a', cursor: 'pointer' }}
```

---

## FIX #4 — ALL FORM INPUTS ACROSS FEATURES

Search these files for className containing bg-white, border-line, border-gray, rounded-md on inputs:

```
client/src/features/organization/components/DepartmentForm.tsx
client/src/features/people/components/UserForm.tsx
client/src/features/people/components/InviteModal.tsx
client/src/features/roles/components/RolesTable.tsx
client/src/features/apps/components/AssignmentRuleBuilder.tsx
client/src/features/audit/components/AuditFilters.tsx
client/src/pages/security/SecurityPage.tsx
client/src/pages/policies/PoliciesPage.tsx
client/src/pages/notifications/NotificationsPage.tsx
client/src/pages/data-fields/DataFieldsPage.tsx
client/src/pages/locations/LocationsPage.tsx
```

For every raw input / textarea / select, replace className with inline style:

```tsx
style={{
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '12px 16px',
  fontSize: 14,
  color: '#f8fafc',
  outline: 'none',
  transition: 'all 0.25s ease',
}}
onFocus={e => {
  e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
  e.currentTarget.style.borderColor = 'rgba(245,176,42,0.35)';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,176,42,0.06)';
}}
onBlur={e => {
  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
  e.currentTarget.style.boxShadow = 'none';
}}
```

For shadcn Input component, add:
```tsx
<Input className="field-input border-0 focus-visible:ring-0 focus-visible:ring-offset-0" />
```

---

## FIX #5 — DROPDOWN MENUS (all DropdownMenuContent)

Search all files for DropdownMenuContent. Apply style to each:

```tsx
<DropdownMenuContent
  align="end"
  className="border-0"
  style={{
    background: 'linear-gradient(145deg, rgba(20,25,35,0.97) 0%, rgba(15,20,30,0.99) 100%)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 14,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    minWidth: 180,
    padding: '6px',
  }}
>

// Each DropdownMenuItem:
<DropdownMenuItem
  style={{ borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 500, color: '#94a3b8', cursor: 'pointer' }}
  className="focus:bg-[rgba(245,176,42,0.10)] focus:text-[#f5b02a]"
>

// Destructive items:
<DropdownMenuItem
  style={{ color: '#f87171' }}
  className="focus:bg-[rgba(239,68,68,0.10)] focus:text-[#f87171]"
>
```

---

## FIX #6 — TABLE SKELETON (TableSkeleton.tsx)

PRESERVE rows/columns props and loop structure. Restyle only.

```tsx
const TableSkeleton = ({ rows = 8, columns = 5 }) => (
  <div style={{
    background: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    overflow: 'hidden',
  }}>
    {/* Header */}
    <div style={{
      height: 44, padding: '0 20px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(255,255,255,0.02)',
      display: 'flex', alignItems: 'center', gap: 32,
    }}>
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} style={{
          height: 10, width: 60 + i * 20,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 4,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>

    {/* Rows */}
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} style={{
        height: 60, padding: '0 20px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ height: 11, width: '30%', background: 'rgba(255,255,255,0.07)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ height: 9, width: '20%', background: 'rgba(255,255,255,0.05)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
        <div style={{ height: 20, width: 60, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </div>
    ))}
  </div>
);
```

---

## FIX #7 — STAT CARD SKELETON (StatCardSkeleton.tsx)

```tsx
const StatCardSkeleton = () => (
  <div style={{
    background: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 24,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
      <div style={{ height: 10, width: 80, background: 'rgba(255,255,255,0.08)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.07)', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
    <div style={{ height: 44, width: 90, background: 'rgba(255,255,255,0.08)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 10 }} />
    <div style={{ height: 10, width: 110, background: 'rgba(255,255,255,0.06)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
  </div>
);
```

---

## FIX #8 — EMPTY STATE & ERROR STATE

Replace container in EmptyState.tsx and ErrorState.tsx:

```tsx
// Container
<div style={{
  background: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20,
  padding: '64px 24px',
  textAlign: 'center',
}}>

// EmptyState icon container
<div style={{
  width: 54, height: 54, borderRadius: 14,
  background: 'rgba(245,176,42,0.10)',
  border: '1px solid rgba(245,176,42,0.20)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  margin: '0 auto 20px',
}}>
  {/* Icon color: #f5b02a */}
</div>

// ErrorState icon container
<div style={{
  width: 54, height: 54, borderRadius: 14,
  background: 'rgba(239,68,68,0.10)',
  border: '1px solid rgba(239,68,68,0.20)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  margin: '0 auto 20px',
}}>
  {/* Icon color: #f87171 */}
</div>
```

---

## FIX #9 — INSIGHT CARDS (InsightCard.tsx)

Replace bg-X-50 / border-X-200 color pattern with dark semantic tints:

```tsx
const severityConfig = {
  critical: {
    wrapper: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)', backdropFilter: 'blur(8px)' },
    dot: '#ef4444',
    badgeBg: 'rgba(239,68,68,0.15)',
    badgeText: '#f87171',
  },
  warning: {
    wrapper: { background: 'rgba(245,176,42,0.08)', border: '1px solid rgba(245,176,42,0.20)', backdropFilter: 'blur(8px)' },
    dot: '#f5b02a',
    badgeBg: 'rgba(245,176,42,0.15)',
    badgeText: '#fbbf24',
  },
  info: {
    wrapper: { background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.20)', backdropFilter: 'blur(8px)' },
    dot: '#3b82f6',
    badgeBg: 'rgba(59,130,246,0.15)',
    badgeText: '#60a5fa',
  },
};
// "View issue" link: color '#60a5fa', fontWeight 700
// "Dismiss" button: color 'rgba(148,163,184,0.6)'
```

---

## FIX #10 — CONFIRM DIALOG (ConfirmDialog.tsx)

PRESERVE open/onClose/onConfirm props. Restyle shell only.

```tsx
<DialogContent
  className="p-0 border-0"
  style={{
    background: 'linear-gradient(160deg, rgba(22,28,48,0.97) 0%, rgba(11,15,28,0.99) 100%)',
    backdropFilter: 'blur(32px)',
    WebkitBackdropFilter: 'blur(32px)',
    borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.09)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    maxWidth: 420,
    overflow: 'hidden',
  }}
>
  {/* Red top highlight stripe */}
  <div style={{ height: 1, width: '100%', background: 'linear-gradient(90deg, rgba(239,68,68,0.5), rgba(239,68,68,0.1), transparent)' }} />

  {/* Body */}
  <div style={{ padding: '28px 28px 20px' }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
      <AlertTriangle size={20} style={{ color: '#f87171' }} />
    </div>
    <h2 style={{ fontSize: 17, fontWeight: 800, color: '#f8fafc', margin: '0 0 8px' }}>Confirm Action</h2>
    <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>Are you sure? This action cannot be undone.</p>
  </div>

  {/* Footer */}
  <div style={{ padding: '16px 28px 24px', borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
    <button onClick={onClose} style={{ height: 38, padding: '0 18px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
      Cancel
    </button>
    <button onClick={onConfirm} style={{ height: 38, padding: '0 18px', background: 'linear-gradient(135deg, #ef4444, #f87171)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(239,68,68,0.35)' }}>
      Confirm
    </button>
  </div>
</DialogContent>
```

---

## FINAL SWEEP — CODEBASE-WIDE SEARCH

After all fixes, search and replace these strings globally:

| Search string       | Replace with                          |
|---------------------|---------------------------------------|
| `bg-white`          | `rgba(255,255,255,0.03)`              |
| `bg-[#F7F8FA]`      | `rgba(255,255,255,0.02)`              |
| `bg-[#F1F3F7]`      | `rgba(255,255,255,0.04)`              |
| `border-line`       | `rgba(255,255,255,0.08)`              |
| `bg-primary-light`  | `rgba(245,176,42,0.10)`               |
| `bg-emerald-50`     | `rgba(16,185,129,0.12)`               |
| `bg-red-50`         | `rgba(239,68,68,0.12)`                |
| `bg-amber-50`       | `rgba(245,176,42,0.12)`               |
| `bg-sky-50`         | `rgba(59,130,246,0.12)`               |
| `bg-violet-50`      | `rgba(168,85,247,0.12)`               |
| `bg-surface-alt`    | `rgba(255,255,255,0.04)`              |
| `shadow-card`       | `0 8px 32px rgba(0,0,0,0.37)`         |
| `text-ink\b`        | `#f8fafc`                             |
| `text-ink-secondary`| `#94a3b8`                             |
| `text-ink-muted`    | `rgba(148,163,184,0.6)`               |

---

## CONSISTENCY CHECKLIST — VERIFY BEFORE DONE

### Layout
- [ ] Body background is #0b0f19, no white anywhere
- [ ] Sidebar is frosted glass, floating in padding
- [ ] TopBar transparent with blur, no white header
- [ ] All page cards are glass (not bg-white)
- [ ] Page titles use amber gradient text

### Inputs
- [ ] All text inputs: rgba(255,255,255,0.04) bg, amber focus glow
- [ ] All select triggers: same glass style as text inputs
- [ ] All dropdown menus: dark popup with blur
- [ ] Date picker: dark glass popup
- [ ] Form labels: uppercase, 10px, #94a3b8, letter-spaced
- [ ] Error field: border rgba(239,68,68,0.35), red focus ring

### Interactive
- [ ] Checkboxes: dark glass bg → amber fill when checked
- [ ] Switches: dark bg → amber active with glow
- [ ] Tabs: dark glass pill, amber active state
- [ ] Progress bars: amber gradient fill
- [ ] Dropdown menus: dark glass popup, amber hover

### Data Display
- [ ] Tables: dark rows, no white bg
- [ ] Table header: rgba(255,255,255,0.02), uppercase muted text
- [ ] Table row hover: rgba(255,255,255,0.03) + translateY(-1px)
- [ ] Selected row: rgba(245,176,42,0.08)
- [ ] Status badges: dark tinted bg + colored text + border
- [ ] Skeleton loaders: rgba(255,255,255,0.06) base

### Overlays
- [ ] Modal dialogs: dark glass, rounded-2xl, amber top highlight
- [ ] SideSheet: dark glass, rounded-3xl left, slide-in
- [ ] Confirm dialog: dark glass, danger red top highlight
- [ ] Overlay backdrop: rgba(6,8,13,0.78) + blur
- [ ] Tooltips: dark popup, no white

### Special Components
- [ ] Org chart nodes: glass cards with amber selection state
- [ ] Org chart lines: rgba(255,255,255,0.12)
- [ ] Permission matrix: dark rows, amber checkboxes
- [ ] Insight cards: dark semantic bg, no bg-X-50
- [ ] Scrollbars: thin dark with amber hover
- [ ] Toasts: dark glass, colored left border
- [ ] Empty states: glass container, amber icon bg
- [ ] Error states: glass container, red icon bg

### Zero Remaining
- [ ] No bg-white in JSX anywhere
- [ ] No bg-[#F7F8FA] or bg-[#F1F3F7]
- [ ] No border-line class resolving to #E2E6ED
- [ ] No bg-X-50 Tailwind classes anywhere
- [ ] No white dropdown menu anywhere
- [ ] No white calendar popup
- [ ] No white org chart node
- [ ] `npx tsc --noEmit` → zero errors

---

## ZERO FUNCTIONAL CHANGES RULE

This entire prompt is visual-only. NEVER touch:

- server/**
- src/features/**/hooks/**
- src/lib/apiClient.ts | rbac.ts | queryClient.ts
- src/store/useAuthStore.ts | useUIStore.ts
- src/types/index.ts
- src/constants/queryKeys.ts | routes.ts | permissions.ts
- Component props interfaces
- TanStack Query queryFn / mutationFn
- Zod schemas
- Route definitions in App.tsx
