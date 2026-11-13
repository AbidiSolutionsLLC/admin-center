# ADMIN CENTER — Frontend Guidelines
> The definitive UI/UX reference for every component, pattern, and visual decision.
> If the PRD says what to build, this doc says exactly how it must look and behave.
> Stack: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui

---

## 1. DESIGN PHILOSOPHY

**Inspired by:** Rippling's color boldness + Zoho's structured, information-dense layout.
**Our direction:** "Confident Precision" — a dark-accented sidebar with a crisp light canvas. Bold amber-orange as the primary action color (inspired by Rippling's golden warmth), deep navy for authority, and clean whites for content breathing room. Everything feels purposeful, not decorative.

**Key principles:**
- **Density with clarity** — show maximum useful information without clutter (Zoho-like information architecture)
- **Bold, deliberate color** — amber-orange primary actions that demand attention; navy for structure and trust
- **No wasted space** — every pixel earns its place
- **Consistent depth** — subtle shadows and borders create hierarchy without noise

---

## 2. DESIGN TOKENS — THE ONLY SOURCE OF TRUTH

All values live in `src/constants/theme.ts`. Zero exceptions. Never hardcode hex values anywhere else.

```typescript
// src/constants/theme.ts
export const theme = {
  colors: {
    // ─── Primary Brand: Amber-Orange (Rippling-inspired warmth, our own character) ───
    primary: '#E8870A',           // Amber-orange — primary actions, CTA buttons, active nav accent
    primaryHover: '#C97208',      // Deeper amber on hover
    primaryLight: '#FEF3E2',      // Soft amber tint — selected rows, highlight backgrounds
    primaryForeground: '#FFFFFF', // White text on primary bg

    // ─── Accent: Electric Indigo ───
    accent: '#4F46E5',            // Indigo — secondary actions, links, active states in content
    accentHover: '#4338CA',
    accentLight: '#EEF2FF',       // Indigo tint backgrounds
    accentForeground: '#FFFFFF',

    // ─── Semantic States ───
    success: '#059669',           // Emerald
    successLight: '#ECFDF5',
    successBorder: '#6EE7B7',
    warning: '#D97706',           // Amber
    warningLight: '#FFFBEB',
    warningBorder: '#FCD34D',
    error: '#DC2626',             // Red
    errorLight: '#FEF2F2',
    errorBorder: '#FCA5A5',
    info: '#0284C7',              // Sky blue
    infoLight: '#F0F9FF',
    infoBorder: '#7DD3FC',

    // ─── Intelligence Severity (maps to semantic above) ───
    critical: '#DC2626',
    criticalBg: '#FEF2F2',
    criticalBorder: '#FCA5A5',
    warningSeverity: '#D97706',
    warningSeverityBg: '#FFFBEB',
    warningSeverityBorder: '#FCD34D',
    infoSeverity: '#0284C7',
    infoSeverityBg: '#F0F9FF',

    // ─── Neutrals — The Canvas ───
    background: '#F7F8FA',        // Very light cool gray — page background
    surface: '#FFFFFF',           // Pure white — cards, panels, modals
    surfaceAlt: '#F1F3F7',        // Alternate rows, hover states
    surfaceElevated: '#FFFFFF',   // Elevated surfaces with shadow
    border: '#E2E6ED',            // Standard dividers, card borders
    borderStrong: '#C8CDD8',      // Stronger dividers, focus rings base

    // ─── Text ───
    textPrimary: '#0F1629',       // Near-black with blue undertone — headings
    textSecondary: '#5A6478',     // Cool mid-gray — captions, labels
    textMuted: '#9BA5B7',         // Light gray — placeholders, disabled
    textInverse: '#FFFFFF',       // White text on dark

    // ─── Sidebar — Dark Navy Authority ───
    sidebarBg: '#0F1629',         // Deep navy — strong, authoritative
    sidebarBorder: '#1E2A42',     // Subtle navy border
    sidebarText: '#8B95AA',       // Muted blue-gray for inactive items
    sidebarTextActive: '#FFFFFF', // Bright white for active item
    sidebarHover: '#1A2540',      // Slightly lighter navy on hover
    sidebarActive: '#E8870A',     // Amber accent bar (left border indicator)
    sidebarActiveBg: '#1E2A42',   // Dark blue tint background for active item
    sidebarGroupLabel: '#4A566E', // Subtle label for nav group headings

    // ─── Interactive ───
    focusRing: '#E8870A',         // Amber focus ring — consistent with primary
    overlay: 'rgba(15, 22, 41, 0.5)', // Dark navy overlay for modals

    // ─── Skeleton ───
    skeleton: '#EDF0F5',
    skeletonShimmer: '#E2E6ED',

    // ─── Status Badges ───
    badgeActive: { bg: '#ECFDF5', text: '#065F46', border: '#6EE7B7' },
    badgeInactive: { bg: '#F1F3F7', text: '#5A6478', border: '#C8CDD8' },
    badgeWarning: { bg: '#FFFBEB', text: '#92400E', border: '#FCD34D' },
    badgeError: { bg: '#FEF2F2', text: '#991B1B', border: '#FCA5A5' },
  },

  spacing: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
  },

  borderRadius: {
    sm: '4px',     // chips, small badges
    md: '6px',     // inputs, small buttons
    lg: '8px',     // cards, dropdowns
    xl: '12px',    // large cards, modals
    '2xl': '16px', // feature panels
    full: '9999px', // avatars, pill badges
  },

  typography: {
    // Page titles — prominent but not heavy
    pageTitle: 'text-[22px] font-semibold tracking-tight text-[#0F1629]',
    // Section headers
    sectionTitle: 'text-base font-semibold text-[#0F1629]',
    // Card titles
    cardTitle: 'text-sm font-semibold text-[#0F1629]',
    // Table column headers
    tableHeader: 'text-[11px] font-semibold text-[#5A6478] uppercase tracking-wider',
    // Body
    body: 'text-sm text-[#0F1629]',
    // Captions / metadata
    caption: 'text-xs text-[#5A6478]',
    // Form labels
    label: 'text-sm font-medium text-[#0F1629]',
    // Data values in cells
    dataValue: 'text-sm font-medium text-[#0F1629]',
    // Sidebar nav label
    navLabel: 'text-[13px] font-medium',
  },

  shadows: {
    card: '0 1px 3px 0 rgba(15, 22, 41, 0.06), 0 1px 2px -1px rgba(15, 22, 41, 0.04)',
    cardHover: '0 4px 12px 0 rgba(15, 22, 41, 0.10)',
    modal: '0 20px 60px -10px rgba(15, 22, 41, 0.25)',
    dropdown: '0 8px 24px -4px rgba(15, 22, 41, 0.14)',
    toast: '0 8px 24px -4px rgba(15, 22, 41, 0.18)',
    sidebar: '1px 0 0 0 rgba(30, 42, 66, 1)',
  },

  animation: {
    // Standard easing for all transitions
    ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
    duration: {
      fast: '100ms',
      normal: '150ms',
      slow: '200ms',
    },
  },
};
```

---

## 3. TAILWIND CONFIG EXTENSION

```javascript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#E8870A',
          hover: '#C97208',
          light: '#FEF3E2',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#4F46E5',
          hover: '#4338CA',
          light: '#EEF2FF',
        },
        sidebar: {
          bg: '#0F1629',
          border: '#1E2A42',
          text: '#8B95AA',
          'text-active': '#FFFFFF',
          hover: '#1A2540',
          active: '#E8870A',
          'active-bg': '#1E2A42',
          'group-label': '#4A566E',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          alt: '#F1F3F7',
          elevated: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#0F1629',
          secondary: '#5A6478',
          muted: '#9BA5B7',
        },
        line: {
          DEFAULT: '#E2E6ED',
          strong: '#C8CDD8',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(15, 22, 41, 0.06), 0 1px 2px -1px rgba(15, 22, 41, 0.04)',
        'card-hover': '0 4px 12px 0 rgba(15, 22, 41, 0.10)',
        modal: '0 20px 60px -10px rgba(15, 22, 41, 0.25)',
        dropdown: '0 8px 24px -4px rgba(15, 22, 41, 0.14)',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        '11': ['11px', { lineHeight: '16px' }],
        '13': ['13px', { lineHeight: '20px' }],
      },
    },
  },
  plugins: [],
};

export default config;
```

> **Font:** Import DM Sans from Google Fonts. It has the same clarity as Inter but with a warmer, more modern personality — matches the amber-navy palette.

---

## 4. LAYOUT ARCHITECTURE

### Global Shell

```
┌─────────────────────────────────────────────────────────────┐
│  SIDEBAR (240px)        │  MAIN AREA                        │
│  bg: #0F1629 (navy)     │  bg: #F7F8FA (light gray)         │
│  ─────────────────────  │  ┌───────────────────────────┐    │
│  [Logo + Company]       │  │  TOP BAR (64px, white)    │    │
│  ─────────────────────  │  │  Page title + actions     │    │
│  [Nav Groups]           │  └───────────────────────────┘    │
│   · Overview            │  ┌───────────────────────────┐    │
│   · Structure ▾         │  │  PAGE CONTENT             │    │
│     · Organization      │  │  (scrollable, p-6)        │    │
│     · Locations         │  └───────────────────────────┘    │
│   · People ▾            │                                   │
│   · Governance ▾        │                                   │
│   · Configuration ▾     │                                   │
│  ─────────────────────  │                                   │
│  [User Profile]         │                                   │
└─────────────────────────────────────────────────────────────┘
```

```tsx
// src/components/layout/AdminShell.tsx
<div className="flex h-screen bg-[#F7F8FA]">
  <Sidebar className="w-60 flex-shrink-0" />
  <div className="flex flex-col flex-1 overflow-hidden">
    <TopBar className="h-16 flex-shrink-0 bg-white border-b border-line" />
    <main className="flex-1 overflow-y-auto p-6">
      {children}
    </main>
  </div>
</div>
```

### Page Layout Template

```tsx
<div className="space-y-5">
  {/* Page header */}
  <div className="flex items-start justify-between">
    <div>
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">
        {pageTitle}
      </h1>
      <p className="mt-0.5 text-sm text-ink-secondary">{pageSubtitle}</p>
    </div>
    <div className="flex items-center gap-2">
      <Button variant="outline">{secondaryAction}</Button>
      <Button variant="primary">{primaryAction}</Button>
    </div>
  </div>

  {/* Optional filter bar */}
  <FilterBar />

  {/* Main content card */}
  <div className="bg-white rounded-lg border border-line shadow-card">
    {/* Table or form content */}
  </div>
</div>
```

---

## 5. SIDEBAR NAVIGATION

### Visual Design
- Background: `#0F1629` (deep navy)
- Logo area: 64px height, company logo + name
- Group labels: uppercase, `text-[11px] font-semibold tracking-widest text-[#4A566E]`
- Inactive nav item: `text-[#8B95AA] hover:bg-[#1A2540] hover:text-white`
- Active nav item: `bg-[#1E2A42] text-white` + amber left border accent `border-l-2 border-[#E8870A]`
- Nav item: `h-9 flex items-center gap-2.5 px-3 rounded-md mx-2 text-[13px] font-medium`
- Bottom: user avatar + name + sign out

```tsx
// Sidebar nav structure
const navGroups = [
  {
    label: null,
    items: [
      { label: 'Overview', href: '/overview', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Structure',
    items: [
      { label: 'Organization', href: '/organization', icon: Building2 },
      { label: 'Locations', href: '/locations', icon: MapPin },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'People', href: '/people', icon: Users },
      { label: 'Roles & Access', href: '/roles', icon: Shield },
      { label: 'App Assignment', href: '/apps', icon: LayoutGrid },
    ],
  },
  {
    label: 'Governance',
    items: [
      { label: 'Policies', href: '/policies', icon: FileText },
      { label: 'Workflows', href: '/workflows', icon: GitBranch },
      { label: 'Security', href: '/security', icon: Lock },
      { label: 'Audit Logs', href: '/audit-logs', icon: Activity },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Data & Fields', href: '/data-fields', icon: Database },
      { label: 'Notifications', href: '/notifications', icon: Bell },
      { label: 'Integrations', href: '/integrations', icon: Plug },
    ],
  },
];
```

---

## 6. BUTTON COMPONENTS

```tsx
// Primary button — amber-orange, high contrast
// class: bg-primary hover:bg-primary-hover text-white font-medium text-sm
//        h-9 px-4 rounded-md transition-colors duration-150

// Secondary / Outline button
// class: border border-line bg-white hover:bg-surface-alt text-ink font-medium text-sm
//        h-9 px-4 rounded-md transition-colors duration-150

// Ghost button (tertiary)
// class: hover:bg-surface-alt text-ink-secondary hover:text-ink font-medium text-sm
//        h-9 px-3 rounded-md transition-colors duration-150

// Danger button
// class: bg-error hover:bg-red-700 text-white font-medium text-sm
//        h-9 px-4 rounded-md transition-colors duration-150

// Icon button (square)
// class: h-8 w-8 flex items-center justify-center rounded-md hover:bg-surface-alt
//        text-ink-secondary hover:text-ink transition-colors duration-150
```

---

## 7. COMPONENT PATTERNS

### 7.1 DataTable

Used on every list page. Always use the shared component.

```tsx
<DataTable
  columns={columns}
  data={data}
  isLoading={isLoading}
  emptyState={<EmptyState title="No departments yet" action={<Button>Create</Button>} />}
  onRowClick={(row) => navigate(ROUTES.DEPARTMENT_DETAIL(row._id))}
  pagination={{ page, pageSize, total, onPageChange }}
  searchable={true}
  selectable={true}
/>
```

**Table visual rules:**
- Table container: `bg-white rounded-lg border border-line shadow-card overflow-hidden`
- Header row: `bg-[#F7F8FA] border-b border-line`
- Header cell: `text-[11px] font-semibold text-ink-secondary uppercase tracking-wider h-10 px-4`
- Data row: `border-b border-line last:border-0 hover:bg-[#F7F8FA] cursor-pointer transition-colors duration-100`
- Data cell: `h-14 px-4 text-sm text-ink`
- Selected row: `bg-primary-light`

### 7.2 Status Badge

```tsx
// Lifecycle state badges
const lifecycleBadgeConfig = {
  active:      { label: 'Active',      class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  invited:     { label: 'Invited',     class: 'bg-primary-light text-amber-700 border-amber-200' },
  onboarding:  { label: 'Onboarding',  class: 'bg-sky-50 text-sky-700 border-sky-200' },
  probation:   { label: 'Probation',   class: 'bg-violet-50 text-violet-700 border-violet-200' },
  on_leave:    { label: 'On Leave',    class: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  terminated:  { label: 'Terminated',  class: 'bg-red-50 text-red-700 border-red-200' },
  archived:    { label: 'Archived',    class: 'bg-surface-alt text-ink-muted border-line' },
};

// Badge component:
// class: inline-flex items-center gap-1 text-[11px] font-semibold
//        border rounded-full px-2.5 py-0.5 tracking-wide
```

### 7.3 Stat Cards (Dashboard)

```tsx
// Stat card structure:
<div className="bg-white rounded-lg border border-line shadow-card p-5">
  <div className="flex items-center justify-between mb-3">
    <span className="text-sm font-medium text-ink-secondary">{label}</span>
    <div className="w-8 h-8 rounded-md bg-primary-light flex items-center justify-center">
      <Icon className="w-4 h-4 text-primary" />
    </div>
  </div>
  <div className="text-[28px] font-bold tracking-tight text-ink">{value}</div>
  <div className="mt-1 text-xs text-ink-secondary">{trend}</div>
</div>
```

### 7.4 Insight Card

```tsx
// Severity color map:
const severityConfig = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-500',
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
  },
  info: {
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    icon: 'text-sky-500',
    badge: 'bg-sky-100 text-sky-700',
    dot: 'bg-sky-500',
  },
};

// Card:
<div className={cn(
  'rounded-lg border p-4 flex items-start gap-3',
  severityConfig[severity].bg,
  severityConfig[severity].border,
)}>
  <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', severityConfig[severity].dot)} />
  <div className="flex-1 min-w-0">
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className={cn('text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5', severityConfig[severity].badge)}>
        {severity}
      </span>
    </div>
    <p className="mt-1 text-sm text-ink-secondary">{description}</p>
    <p className="mt-1 text-xs text-ink-muted italic">{reasoning}</p>
    <div className="mt-2 flex items-center gap-3">
      <a href={remediation_url} className="text-xs font-semibold text-accent hover:underline">
        View issue →
      </a>
      <button className="text-xs text-ink-muted hover:text-ink">Dismiss</button>
    </div>
  </div>
</div>
```

### 7.5 Filter Bar

```tsx
// Filter bar sits between page header and content card
<div className="flex items-center gap-3">
  {/* Search */}
  <div className="relative flex-1 max-w-sm">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
    <input
      className="w-full h-9 pl-9 pr-4 text-sm rounded-md border border-line bg-white
                 text-ink placeholder:text-ink-muted
                 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                 transition-all duration-150"
      placeholder="Search..."
    />
  </div>
  {/* Filter dropdowns */}
  <Select placeholder="Status" options={statusOptions} />
  <Select placeholder="Department" options={deptOptions} />
  {/* Active filter count */}
  {activeFilterCount > 0 && (
    <button className="text-xs font-medium text-accent hover:text-accent-hover">
      Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
    </button>
  )}
</div>
```

---

## 8. FORM PATTERNS

### Form Input

```tsx
<div className="space-y-1.5">
  <label className="text-sm font-medium text-ink">
    Department Name <span className="text-error">*</span>
  </label>
  <input
    className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
               placeholder:text-ink-muted
               focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
               disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed
               data-[error=true]:border-error data-[error=true]:focus:ring-error/30
               transition-all duration-150"
  />
  {error && <p className="text-xs text-error">{error}</p>}
  {description && <p className="text-xs text-ink-secondary">{description}</p>}
</div>
```

### Input States:
- Default: `border-line focus:border-primary focus:ring-2 focus:ring-primary/30`
- Error: `border-error focus:border-error focus:ring-error/30`
- Disabled: `bg-surface-alt text-ink-muted cursor-not-allowed`
- All inputs: `h-9 px-3 text-sm rounded-md`

---

## 9. MODAL PATTERNS

```tsx
// Sizes: sm=max-w-md | md=max-w-xl | lg=max-w-3xl | xl=max-w-5xl
<Modal
  open={isOpen}
  onClose={handleClose}
  title="Create Department"
  description="Add a new department to your organization."
  size="md"
  footer={
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={handleClose}>Cancel</Button>
      <Button variant="primary" isLoading={isSubmitting} onClick={handleSubmit}>
        Create Department
      </Button>
    </div>
  }
>
  {/* content */}
</Modal>

// Modal header: border-b border-line, title text-[15px] font-semibold text-ink
// Modal footer: border-t border-line bg-[#F7F8FA] px-6 py-4
// Overlay: bg-[rgba(15,22,41,0.5)] backdrop-blur-[2px]
```

---

## 10. LOADING & ERROR STATE RULES

Every data-fetching component MUST implement all four states:

```tsx
// 1. Loading — skeletons, never spinners for page-level content
if (isLoading) return <TableSkeleton rows={8} columns={5} />;

// 2. Error
if (isError) return (
  <div className="bg-white rounded-lg border border-line shadow-card p-12 text-center">
    <AlertTriangle className="w-10 h-10 text-error mx-auto mb-3" />
    <h3 className="text-sm font-semibold text-ink mb-1">Failed to load data</h3>
    <p className="text-sm text-ink-secondary mb-4">Something went wrong. Try again.</p>
    <Button variant="outline" onClick={refetch}>Retry</Button>
  </div>
);

// 3. Empty
if (!data?.length) return (
  <div className="bg-white rounded-lg border border-line shadow-card p-16 text-center">
    <div className="w-12 h-12 rounded-xl bg-primary-light flex items-center justify-center mx-auto mb-4">
      <Building2 className="w-6 h-6 text-primary" />
    </div>
    <h3 className="text-sm font-semibold text-ink mb-1">No departments yet</h3>
    <p className="text-sm text-ink-secondary mb-4">Create your first department to get started.</p>
    <Button variant="primary" onClick={openCreate}>Create Department</Button>
  </div>
);

// 4. Data
return <DataTable data={data} columns={columns} />;
```

### Skeleton rules:
- Skeleton base: `bg-[#EDF0F5] rounded animate-pulse`
- Shimmer: use CSS animation, not JS
- Match the shape of the real content exactly

---

## 11. TOAST NOTIFICATIONS

Using **sonner**:

```tsx
import { toast } from 'sonner';

toast.success('Department created successfully');
toast.error('Failed to create department. Please try again.');
toast.warning('This role has 24 users — changes affect all of them.');
toast.info('Insights refreshing...');

// Toasts always: top-right, max 3 visible
// Success: 3s auto-dismiss
// Error/Warning: 5s with "Dismiss" button
// Toast style: bg-white border border-line shadow-dropdown rounded-lg
// Success accent: left border border-l-2 border-success
// Error accent: border-l-2 border-error
```

---

## 12. ORG CHART COMPONENT

```tsx
<OrgChart
  data={orgTreeData}
  onNodeClick={(node) => openDepartmentPanel(node.id)}
  renderNode={(node) => (
    <div className={cn(
      'bg-white border-2 rounded-lg p-3 min-w-[180px] shadow-card',
      node.isSelected && 'border-primary bg-primary-light',
      !node.isSelected && 'border-line hover:border-accent',
      node.hasMissingManager && 'border-dashed border-warning',
    )}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
          {node.type}
        </span>
        {node.has_intelligence_flag && (
          <span className="w-2 h-2 rounded-full bg-error" />
        )}
      </div>
      <p className="text-sm font-semibold text-ink">{node.name}</p>
      {node.manager && (
        <p className="text-xs text-ink-secondary mt-0.5">{node.manager.full_name}</p>
      )}
      <p className="text-xs text-ink-muted mt-1">{node.headcount} members</p>
    </div>
  )}
/>
```

---

## 13. PERMISSION MATRIX UI

```
Matrix visual rules:
─ Container: bg-white border border-line rounded-lg overflow-hidden
─ Row header (module): text-sm font-medium text-ink, w-48, bg-[#F7F8FA]
─ Column header (action): text-[11px] font-semibold uppercase tracking-wider text-ink-secondary, text-center
─ Checked cell: amber checkbox (accent-primary using Tailwind)
─ Disabled cell: grayed checkbox
─ "Grant all" row action: text-xs text-accent font-medium
─ "Clear all" row action: text-xs text-ink-secondary
─ Module separator: border-b border-line
```

---

## 14. ACCESSIBILITY RULES

- All interactive elements must have `aria-label` or visible label
- All data tables must have proper `<thead>` with `scope="col"` on headers
- All modals must trap focus and restore focus on close (use shadcn Dialog)
- All form inputs must have associated `<label>` (via `htmlFor`)
- Color must never be the only indicator of state — always include icon or text
- Keyboard navigation for all primary flows (tab, enter, escape)
- Minimum contrast ratio: 4.5:1 for normal text (WCAG AA)
- Focus ring: `focus-visible:ring-2 focus-visible:ring-primary/50` on all interactive elements

---

## 15. TECH STACK COMPONENT DECISIONS

| UI Need | Use |
|---|---|
| Component library base | shadcn/ui (customized to match theme) |
| Icons | lucide-react |
| Tables | TanStack Table v8 (via shared DataTable component) |
| Forms | react-hook-form + zod |
| Toasts | sonner |
| Org chart | react-organizational-chart or d3-hierarchy |
| Date pickers | react-day-picker (shadcn calendar) |
| Rich text (policies) | Tiptap |
| Charts (dashboard) | Recharts |
| Drag and drop | @dnd-kit/core |
| Modals | shadcn Dialog |
| Command palette | shadcn Command |
| Fonts | DM Sans (body) + JetBrains Mono (code/data) |

---

## 16. WHAT PHASE 1 UI DOES NOT INCLUDE

Do not build or stub UI for:
- Drag-and-drop visual workflow builder canvas
- AI/ML-powered insight explanations
- Integrations marketplace (beyond 3 connectors)
- SSO/SAML configuration screens
- Mobile-responsive admin views (desktop-only in Phase 1)
- Real-time collaboration cursors
