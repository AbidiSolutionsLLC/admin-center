# ADMIN CENTER — Design Structure Reference
> This file exists for ONE purpose: keep every AI-generated page and component visually consistent.
> Read this before building ANY screen, component, or UI element.
> If it's not in here, check admin-frontend-guidelines.md. If it's not there either, ask.

---

## THE DESIGN IN ONE SENTENCE

**Deep navy sidebar + crisp white card surfaces on a light gray canvas, with bold amber-orange primary actions — structured, information-dense, and purposeful.**

---

## COLORS — QUICK REFERENCE

Never hardcode a hex value. Use Tailwind classes mapped to these tokens. If you need a hex value for a non-Tailwind context, reference this table only.

| Token Name | Hex | Tailwind Class | Use Case |
|---|---|---|---|
| **Primary** | `#E8870A` | `bg-primary` / `text-primary` | CTA buttons, active nav accent, focus rings, key actions |
| **Primary Hover** | `#C97208` | `hover:bg-primary-hover` | Button hover state |
| **Primary Light** | `#FEF3E2` | `bg-primary-light` | Selected rows, highlighted backgrounds, empty state icons bg |
| **Accent (Indigo)** | `#4F46E5` | `bg-accent` / `text-accent` | Links, secondary interactive, action code pills |
| **Accent Light** | `#EEF2FF` | `bg-accent-light` | Indigo tint backgrounds |
| **Sidebar BG** | `#0F1629` | `bg-sidebar-bg` | Sidebar only |
| **Sidebar Active BG** | `#1E2A42` | `bg-sidebar-active-bg` | Active nav item background |
| **Sidebar Text** | `#8B95AA` | `text-sidebar-text` | Inactive nav item text |
| **Sidebar Group Label** | `#4A566E` | `text-sidebar-group-label` | Nav group headings |
| **Canvas** | `#F7F8FA` | `bg-[#F7F8FA]` | Page background |
| **Surface** | `#FFFFFF` | `bg-white` | Cards, modals, panels, table container |
| **Surface Alt** | `#F1F3F7` | `bg-surface-alt` | Table header rows, hover states, alt backgrounds |
| **Border** | `#E2E6ED` | `border-line` | Card borders, dividers, input borders |
| **Border Strong** | `#C8CDD8` | `border-line-strong` | Section dividers, strong borders |
| **Text Primary** | `#0F1629` | `text-ink` | Headings, body text, data values |
| **Text Secondary** | `#5A6478` | `text-ink-secondary` | Labels, captions, metadata |
| **Text Muted** | `#9BA5B7` | `text-ink-muted` | Placeholders, disabled text, helper text |
| **Success** | `#059669` | `text-emerald-600` / `bg-emerald-50` | Success states, active badges |
| **Warning** | `#D97706` | `text-amber-600` / `bg-amber-50` | Warning states |
| **Error** | `#DC2626` | `text-red-600` / `bg-red-50` | Error states, critical insights |
| **Info** | `#0284C7` | `text-sky-600` / `bg-sky-50` | Info states |

---

## TYPOGRAPHY — QUICK REFERENCE

**Font family:** `DM Sans` for all UI text. `JetBrains Mono` for code, IDs, action pills.

| Use Case | Classes |
|---|---|
| Page title (H1) | `text-[22px] font-semibold tracking-tight text-ink` |
| Section title (H2) | `text-base font-semibold text-ink` |
| Card title | `text-sm font-semibold text-ink` |
| Table column header | `text-[11px] font-semibold text-ink-secondary uppercase tracking-wider` |
| Body text | `text-sm text-ink` |
| Secondary / caption | `text-xs text-ink-secondary` |
| Muted / helper | `text-xs text-ink-muted` |
| Form label | `text-sm font-medium text-ink` |
| Nav item | `text-[13px] font-medium` |
| Code / IDs / action pills | `font-mono text-xs` |
| Stat card value | `text-[28px] font-bold tracking-tight text-ink` |

---

## SPACING — QUICK REFERENCE

Use Tailwind spacing units. Common patterns:

| Pattern | Class |
|---|---|
| Page outer padding | `p-6` |
| Space between page sections | `space-y-5` |
| Card inner padding (standard) | `p-5` |
| Card inner padding (compact) | `p-4` |
| Modal inner padding | `px-6 py-5` |
| Form field gap | `space-y-1.5` (label → input) |
| Form section gap | `space-y-4` |
| Button gap in header | `gap-2` |
| Filter bar gap | `gap-3` |
| Table cell padding | `h-14 px-4` (data) / `h-10 px-4` (header) |
| Sidebar nav item | `h-9 flex items-center gap-2.5 px-3 mx-2` |
| Icon size (nav) | `w-4 h-4` |
| Icon size (card icon) | `w-6 h-6` |
| Avatar (small) | `w-7 h-7` |
| Avatar (medium) | `w-8 h-8` |

---

## BORDER RADIUS — QUICK REFERENCE

| Element | Radius Class |
|---|---|
| Buttons | `rounded-md` (6px) |
| Inputs | `rounded-md` (6px) |
| Cards | `rounded-lg` (8px) |
| Modals | `rounded-xl` (12px) |
| Badges / pills (text) | `rounded-full` |
| Badge (status, square-ish) | `rounded-md` or `rounded-full` |
| Icon containers | `rounded-md` |
| Tooltips | `rounded-md` |
| Dropdown menus | `rounded-lg` |
| Sidebar nav items | `rounded-md` |

---

## SHADOWS — QUICK REFERENCE

| Use Case | Class |
|---|---|
| Standard card | `shadow-card` = `shadow-[0_1px_3px_0_rgba(15,22,41,0.06),0_1px_2px_-1px_rgba(15,22,41,0.04)]` |
| Card on hover | `hover:shadow-card-hover` |
| Modal | `shadow-[0_20px_60px_-10px_rgba(15,22,41,0.25)]` |
| Dropdown | `shadow-[0_8px_24px_-4px_rgba(15,22,41,0.14)]` |
| No shadow (table inside card) | no shadow on the table itself — the container card has it |

---

## PAGE LAYOUT — COPY THIS TEMPLATE EXACTLY

Every page MUST follow this exact structure. No exceptions.

```tsx
// PageName.tsx
export default function PageNamePage() {
  return (
    <div className="space-y-5">

      {/* ─── Page Header ─── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            Page Title
          </h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            One line description of what this page does.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Secondary action (outline) */}
          <button className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors">
            Export
          </button>
          {/* Primary action (amber) */}
          <button className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors">
            Create Something
          </button>
        </div>
      </div>

      {/* ─── Intelligence Banner (only if critical insights exist for this module) ─── */}
      {/* <IntelligenceBanner module="organization" /> */}

      {/* ─── Filter Bar ─── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          {/* Search input */}
        </div>
        {/* Filter selects */}
      </div>

      {/* ─── Main Content Card ─── */}
      <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
        {/* Table OR grid OR form content */}
      </div>

    </div>
  );
}
```

---

## SIDEBAR — COPY THIS EXACTLY

```tsx
// Sidebar.tsx — do not deviate from this structure

// Container
<aside className="w-60 flex-shrink-0 bg-[#0F1629] flex flex-col h-screen border-r border-[#1E2A42]">

  {/* Logo + Company */}
  <div className="h-16 flex items-center px-4 border-b border-[#1E2A42]">
    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
      {/* Company logo or initials */}
    </div>
    <span className="ml-2.5 text-sm font-semibold text-white truncate">Company Name</span>
  </div>

  {/* Nav */}
  <nav className="flex-1 py-4 overflow-y-auto">
    {navGroups.map(group => (
      <div key={group.label} className="mb-4">
        {group.label && (
          <p className="px-5 mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#4A566E]">
            {group.label}
          </p>
        )}
        {group.items.map(item => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) => cn(
              'flex items-center gap-2.5 h-9 mx-2 px-3 rounded-md text-[13px] font-medium transition-colors duration-100',
              isActive
                ? 'bg-[#1E2A42] text-white border-l-2 border-[#E8870A] pl-[10px]'  // note: pl adjusted for border
                : 'text-[#8B95AA] hover:bg-[#1A2540] hover:text-white border-l-2 border-transparent pl-[10px]'
            )}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </div>
    ))}
  </nav>

  {/* User footer */}
  <div className="border-t border-[#1E2A42] p-3">
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-[#1A2540] cursor-pointer">
      <div className="w-7 h-7 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0">
        <span className="text-[11px] font-bold text-primary">TK</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white truncate">User Name</p>
        <p className="text-[11px] text-[#8B95AA] truncate">super_admin</p>
      </div>
    </div>
  </div>

</aside>
```

---

## TABLE — COPY THIS EXACTLY

Every list table uses this structure. No custom table markup.

```tsx
// Table container
<div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">

  {/* Table header — sticky */}
  <table className="w-full">
    <thead>
      <tr className="bg-[#F7F8FA] border-b border-line">
        <th className="h-10 px-4 text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
          Column Name
        </th>
        {/* ... more columns */}
      </tr>
    </thead>
    <tbody>
      {data.map(row => (
        <tr
          key={row._id}
          className="border-b border-line last:border-0 hover:bg-[#F7F8FA] cursor-pointer transition-colors duration-100"
          onClick={() => navigate(ROUTES.DETAIL(row._id))}
        >
          <td className="h-14 px-4 text-sm text-ink">
            {/* Cell content */}
          </td>
        </tr>
      ))}
    </tbody>
  </table>

  {/* Pagination row */}
  <div className="border-t border-line px-4 py-3 flex items-center justify-between bg-[#F7F8FA]">
    <span className="text-xs text-ink-secondary">
      Showing {start}–{end} of {total}
    </span>
    <div className="flex items-center gap-1">
      {/* Prev / Next buttons */}
    </div>
  </div>

</div>
```

---

## BUTTONS — COPY THESE EXACTLY

```tsx
// Primary (amber) — main CTA
<button className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors duration-150">
  Create Department
</button>

// Outline — secondary action
<button className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors duration-150">
  Export
</button>

// Ghost — tertiary / text action
<button className="h-9 px-3 text-sm font-medium text-ink-secondary hover:text-ink hover:bg-surface-alt rounded-md transition-colors duration-150">
  Cancel
</button>

// Danger — destructive action
<button className="h-9 px-4 text-sm font-medium rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors duration-150">
  Delete
</button>

// Icon button — square
<button className="h-8 w-8 flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface-alt transition-colors duration-150">
  <MoreHorizontal className="w-4 h-4" />
</button>

// Loading state (on primary)
<button className="h-9 px-4 text-sm font-medium rounded-md bg-primary text-white opacity-70 cursor-not-allowed flex items-center gap-2" disabled>
  <Loader2 className="w-4 h-4 animate-spin" />
  Saving...
</button>
```

---

## FORM FIELDS — COPY THESE EXACTLY

```tsx
// Standard text input
<div className="space-y-1.5">
  <label className="text-sm font-medium text-ink">
    Field Label
    {required && <span className="text-error ml-0.5">*</span>}
  </label>
  <input
    type="text"
    placeholder="Placeholder text"
    className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
               placeholder:text-ink-muted
               focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
               disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed
               transition-all duration-150"
  />
  {error && <p className="text-xs text-error">{error}</p>}
  {description && <p className="text-xs text-ink-muted">{description}</p>}
</div>

// Error state — add these classes to the input
// border-error focus:border-error focus:ring-error/30

// Select
<select className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                   focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                   transition-all duration-150">
  <option value="">Select an option</option>
</select>
```

---

## MODAL — COPY THIS STRUCTURE EXACTLY

```tsx
// Modal shell (use shadcn Dialog as the base)
<Dialog open={isOpen} onOpenChange={onClose}>
  <DialogContent className="bg-white rounded-xl shadow-[0_20px_60px_-10px_rgba(15,22,41,0.25)] p-0 overflow-hidden max-w-xl">

    {/* Header */}
    <div className="px-6 py-5 border-b border-line">
      <DialogTitle className="text-[15px] font-semibold text-ink">Modal Title</DialogTitle>
      <DialogDescription className="mt-0.5 text-sm text-ink-secondary">
        Brief description of what this modal does.
      </DialogDescription>
    </div>

    {/* Content */}
    <div className="px-6 py-5 space-y-4">
      {/* Form fields */}
    </div>

    {/* Footer */}
    <div className="px-6 py-4 border-t border-line bg-[#F7F8FA] flex justify-end gap-2">
      <button onClick={onClose} className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors">
        Cancel
      </button>
      <button className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors">
        Confirm
      </button>
    </div>

  </DialogContent>
</Dialog>
```

---

## BADGE / STATUS PILL — COPY THESE EXACTLY

```tsx
// Lifecycle state badges
const lifecycleBadge = {
  active:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
  invited:    'bg-amber-50 text-amber-700 border border-amber-200',
  onboarding: 'bg-sky-50 text-sky-700 border border-sky-200',
  probation:  'bg-violet-50 text-violet-700 border border-violet-200',
  on_leave:   'bg-yellow-50 text-yellow-700 border border-yellow-200',
  terminated: 'bg-red-50 text-red-700 border border-red-200',
  archived:   'bg-surface-alt text-ink-muted border border-line',
};

// Badge element:
<span className={cn(
  'inline-flex items-center text-[11px] font-semibold tracking-wide rounded-full px-2.5 py-0.5',
  lifecycleBadge[state]
)}>
  {label}
</span>

// Module / action badge (code-style pill for audit log):
<span className="inline-flex items-center font-mono text-xs bg-accent-light text-accent border border-indigo-200 rounded-md px-2 py-0.5">
  user.lifecycle_changed
</span>

// Severity badge:
const severityBadge = {
  critical: 'bg-red-100 text-red-700',
  warning:  'bg-amber-100 text-amber-700',
  info:     'bg-sky-100 text-sky-700',
};
```

---

## EMPTY STATE — COPY THIS EXACTLY

```tsx
<div className="flex flex-col items-center justify-center py-16 px-4 text-center">
  {/* Icon container — amber tinted */}
  <div className="w-12 h-12 rounded-xl bg-primary-light flex items-center justify-center mb-4">
    <Building2 className="w-6 h-6 text-primary" />
  </div>
  <h3 className="text-sm font-semibold text-ink mb-1">No items yet</h3>
  <p className="text-sm text-ink-secondary mb-5 max-w-xs">
    Descriptive sentence about what you can create here.
  </p>
  <button className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors">
    Create First Item
  </button>
</div>
```

---

## ERROR STATE — COPY THIS EXACTLY

```tsx
<div className="flex flex-col items-center justify-center py-16 px-4 text-center">
  <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
    <AlertTriangle className="w-6 h-6 text-error" />
  </div>
  <h3 className="text-sm font-semibold text-ink mb-1">Failed to load data</h3>
  <p className="text-sm text-ink-secondary mb-5">
    Something went wrong fetching this data. Try again.
  </p>
  <button
    onClick={refetch}
    className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
  >
    Retry
  </button>
</div>
```

---

## SKELETON LOADING — COPY THIS EXACTLY

```tsx
// Table skeleton (use this when loading list pages)
const TableSkeleton = ({ rows = 8, columns = 5 }) => (
  <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
    {/* Fake header */}
    <div className="h-10 px-4 border-b border-line bg-[#F7F8FA] flex items-center gap-6">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="h-3 bg-[#EDF0F5] rounded animate-pulse" style={{ width: `${60 + i * 20}px` }} />
      ))}
    </div>
    {/* Fake rows */}
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-14 px-4 border-b border-line last:border-0 flex items-center gap-6">
        <div className="w-8 h-8 rounded-full bg-[#EDF0F5] animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-[#EDF0F5] rounded animate-pulse w-1/3" />
          <div className="h-2.5 bg-[#EDF0F5] rounded animate-pulse w-1/4" />
        </div>
        <div className="h-3 bg-[#EDF0F5] rounded animate-pulse w-20" />
        <div className="h-5 bg-[#EDF0F5] rounded-full animate-pulse w-16" />
      </div>
    ))}
  </div>
);

// Stat card skeleton
const StatCardSkeleton = () => (
  <div className="bg-white rounded-lg border border-line shadow-card p-5">
    <div className="flex items-center justify-between mb-3">
      <div className="h-3 bg-[#EDF0F5] rounded animate-pulse w-24" />
      <div className="w-8 h-8 rounded-md bg-[#EDF0F5] animate-pulse" />
    </div>
    <div className="h-8 bg-[#EDF0F5] rounded animate-pulse w-20 mb-2" />
    <div className="h-2.5 bg-[#EDF0F5] rounded animate-pulse w-28" />
  </div>
);
```

---

## STAT CARD — COPY THIS EXACTLY

```tsx
// Dashboard stat card
<div className="bg-white rounded-lg border border-line shadow-card p-5">
  <div className="flex items-center justify-between mb-3">
    <span className="text-sm font-medium text-ink-secondary">Total Users</span>
    <div className="w-8 h-8 rounded-md bg-primary-light flex items-center justify-center">
      <Users className="w-4 h-4 text-primary" />
    </div>
  </div>
  <div className="text-[28px] font-bold tracking-tight text-ink leading-none">
    247
  </div>
  <div className="mt-1.5 flex items-center gap-1">
    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
    <span className="text-xs text-emerald-600 font-medium">+12 this month</span>
  </div>
</div>
```

---

## INSIGHT CARD — COPY THIS EXACTLY

```tsx
// severity: 'critical' | 'warning' | 'info'
const config = {
  critical: { dot: 'bg-red-500',    bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700' },
  warning:  { dot: 'bg-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700' },
  info:     { dot: 'bg-sky-500',    bg: 'bg-sky-50',    border: 'border-sky-200',    badge: 'bg-sky-100 text-sky-700' },
};

<div className={`rounded-lg border p-4 flex items-start gap-3 ${config[severity].bg} ${config[severity].border}`}>
  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${config[severity].dot}`} />
  <div className="flex-1 min-w-0">
    <div className="flex items-start justify-between gap-2 mb-1">
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 flex-shrink-0 ${config[severity].badge}`}>
        {severity}
      </span>
    </div>
    <p className="text-sm text-ink-secondary">{description}</p>
    {reasoning && <p className="mt-1 text-xs text-ink-muted italic">{reasoning}</p>}
    <div className="mt-2.5 flex items-center gap-3">
      <a href={remediation_url} className="text-xs font-semibold text-accent hover:underline">
        View issue →
      </a>
      <button className="text-xs text-ink-muted hover:text-ink transition-colors">
        Dismiss
      </button>
    </div>
  </div>
</div>
```

---

## CONFIRM DIALOG — COPY THIS EXACTLY

```tsx
// For destructive actions (delete, archive, force-logout)
<Dialog open={isOpen} onOpenChange={onClose}>
  <DialogContent className="bg-white rounded-xl shadow-modal p-0 overflow-hidden max-w-md">
    <div className="px-6 py-5">
      {/* Icon */}
      <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-5 h-5 text-error" />
      </div>
      <h2 className="text-[15px] font-semibold text-ink mb-1">Confirm Action</h2>
      <p className="text-sm text-ink-secondary">
        Are you sure? This action cannot be undone.
      </p>
    </div>
    <div className="px-6 py-4 border-t border-line bg-[#F7F8FA] flex justify-end gap-2">
      <button onClick={onClose} className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors">
        Cancel
      </button>
      <button onClick={onConfirm} className="h-9 px-4 text-sm font-medium rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors">
        Confirm
      </button>
    </div>
  </DialogContent>
</Dialog>
```

---

## FILTER BAR — COPY THIS EXACTLY

```tsx
<div className="flex items-center gap-3">

  {/* Search input */}
  <div className="relative flex-1 max-w-xs">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
    <input
      type="text"
      placeholder="Search..."
      className="w-full h-9 pl-8 pr-4 text-sm rounded-md border border-line bg-white text-ink
                 placeholder:text-ink-muted
                 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                 transition-all duration-150"
    />
  </div>

  {/* Filter selects */}
  <select className="h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                     focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                     transition-all duration-150 min-w-[130px]">
    <option value="">All Status</option>
    <option value="active">Active</option>
  </select>

  {/* Clear filters — only when active filters exist */}
  {activeFilterCount > 0 && (
    <button className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors">
      Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
    </button>
  )}

</div>
```

---

## INTELLIGENCE BANNER (MODULE-LEVEL) — COPY THIS

```tsx
// Shown above the main content card when critical insights exist for a module
{criticalInsightCount > 0 && (
  <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
    <p className="text-sm text-amber-800 font-medium">
      {criticalInsightCount} critical issue{criticalInsightCount > 1 ? 's' : ''} detected in this module.
    </p>
    <a href="/overview" className="ml-auto text-xs font-semibold text-accent hover:underline flex-shrink-0">
      View all issues →
    </a>
  </div>
)}
```

---

## TOPBAR — COPY THIS EXACTLY

```tsx
<header className="h-16 flex-shrink-0 bg-white border-b border-line flex items-center justify-between px-6">

  {/* Left: Page title */}
  <div>
    <h1 className="text-[15px] font-semibold text-ink">{pageTitle}</h1>
    {/* Optional breadcrumb */}
  </div>

  {/* Right: actions */}
  <div className="flex items-center gap-3">

    {/* Notification bell */}
    <button className="h-8 w-8 flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface-alt transition-colors relative">
      <Bell className="w-4 h-4" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full text-[9px] font-bold text-white flex items-center justify-center">
          {unreadCount}
        </span>
      )}
    </button>

    {/* User avatar + dropdown */}
    <div className="flex items-center gap-2 cursor-pointer">
      <div className="w-7 h-7 rounded-full bg-primary-light flex items-center justify-center">
        <span className="text-[11px] font-bold text-primary">TK</span>
      </div>
      <div className="hidden sm:block">
        <p className="text-[13px] font-medium text-ink leading-none">{userName}</p>
        <p className="text-[11px] text-ink-secondary leading-none mt-0.5">{userRole}</p>
      </div>
      <ChevronDown className="w-3.5 h-3.5 text-ink-muted" />
    </div>

  </div>
</header>
```

---

## DON'TS — NEVER DO THESE

| ❌ Wrong | ✅ Right |
|---|---|
| Hardcode any hex color (`#E8870A`) in component | Use Tailwind class (`bg-primary`) |
| Use `bg-blue-600` for primary actions | Use `bg-primary` (amber) |
| Use `bg-gray-900` for sidebar | Use `bg-[#0F1629]` |
| Use `Inter` or `Roboto` font | Use `DM Sans` |
| Use `shadow-sm` for cards | Use `shadow-card` |
| Use `rounded-full` on buttons | Use `rounded-md` on buttons |
| Mix different border colors | Use `border-line` (`#E2E6ED`) consistently |
| Show a spinner for page-level loading | Show `TableSkeleton` or `StatCardSkeleton` |
| Make table rows without hover state | Always add `hover:bg-[#F7F8FA] transition-colors` |
| Use custom pixel values not in the spacing scale | Use Tailwind spacing units |
| Leave modal footer without `bg-[#F7F8FA]` | Always add `bg-[#F7F8FA]` to modal footer |
| Create a primary button that's blue, purple, or green | Primary button is ALWAYS amber (`bg-primary`) |
| Put content directly on the page without a card | All content lives in `bg-white rounded-lg border border-line shadow-card` |

---

## CHECKLIST — BEFORE SUBMITTING ANY COMPONENT

- [ ] All colors come from Tailwind classes (no hardcoded hex in className strings)
- [ ] Page uses the exact page layout template from this doc
- [ ] Loading state uses skeleton (not spinner)
- [ ] Error state uses the error template from this doc
- [ ] Empty state uses the empty template from this doc
- [ ] Primary buttons are amber (`bg-primary`)
- [ ] Table container uses `bg-white rounded-lg border border-line shadow-card overflow-hidden`
- [ ] Modals use the exact modal template (header / content / footer with gray bg)
- [ ] Badges use `rounded-full` with the correct color pair from the badge section
- [ ] Font is `DM Sans` — no other sans-serif
- [ ] IDs, code, action pills use `font-mono`
- [ ] Intelligence banner shown when module has critical insights
- [ ] All four data states handled: loading, error, empty, data
