# ADMIN CENTER — Design Migration Plan
# Dark Glassmorphism Redesign (Dashboard Demo → Working Admin Portal)
# Target Agent: Antigravity (with ui-ux-pro-max skill)

> **CRITICAL RULE:** This plan is DESIGN-ONLY. Zero changes to:
> - Business logic, hooks, API calls, Zustand stores, TanStack Query usage
> - TypeScript interfaces/types in `src/types/index.ts`
> - Backend code (server/)
> - Route structure, QUERY_KEYS, permission checks
> - Component props and exported function signatures
>
> You are changing HOW things look, not WHAT they do.

---

## AGENT BRIEFING

You are migrating the Admin Center's visual design from its current **navy-on-white enterprise look** to a premium **dark glassmorphism aesthetic** inspired by the `dashboard-demo` reference project.

### Before starting ANY file:
1. Read `/ui-ux-pro-max/SKILL.md` (the root skill) — apply its principles throughout
2. Read `admin-design-structure.md` to understand current component patterns
3. Read `admin-frontend-guidelines.md` to understand current token system

### Design system being extracted from `dashboard-demo`:

| Element | Current Admin Portal | New Dashboard Demo Aesthetic |
|---|---|---|
| Background | `#F7F8FA` light gray canvas | `#0b0f19` near-black, radial gradient glows |
| Cards | White + subtle shadow | Glassmorphism: `rgba(255,255,255,0.03)` + `backdrop-filter: blur(16px)` |
| Sidebar | `#0F1629` solid navy, 240px | Glass panel, 280px, rounded-2xl, scrollable |
| Primary color | `#E8870A` amber | `#f5b02a` golden amber with glow |
| Topbar | `bg-white border-b` | Semi-transparent with blur, search pill |
| Tables | Clean white rows | Dark `border-spacing: 4px` separated rows |
| Nav items | Left border indicator | Rounded border card with glow |
| Modals | shadcn Dialog white | Dark glass SideSheet (slide-in panel) |
| Buttons | Flat amber/outline | Gradient with glow shadow |
| Fonts | DM Sans | Keep DM Sans (upgrade with Inter fallback) |
| Animation | None | `fadeInUp` entrance per page |
| Stat values | `text-[28px] font-bold` | `text-[48px] font-extrabold` |

---

## PHASE 0 — ANALYSIS (Do this first, touch no files yet)

```
AGENT TASK: Before writing any code, read and map these files:
- client/src/constants/theme.ts
- client/tailwind.config.ts  
- client/src/index.css or client/src/globals.css
- client/src/components/layout/AdminShell.tsx
- client/src/components/layout/Sidebar.tsx
- client/src/components/layout/TopBar.tsx
- client/src/components/ui/DataTable.tsx
- client/src/components/ui/StatusBadge.tsx
- client/src/components/ui/InsightCard.tsx
- client/src/components/ui/EmptyState.tsx
- client/src/components/ui/ErrorState.tsx
- client/src/components/ui/TableSkeleton.tsx
- client/src/components/ui/ConfirmDialog.tsx
- client/src/components/ui/Modal.tsx

Produce an internal map of every Tailwind class that uses a color token 
(bg-white, bg-[#F7F8FA], border-line, text-ink, bg-primary, shadow-card, etc.)
You will need this map to do systematic find-and-replace in Phase 2.
```

---

## PHASE 1 — DESIGN TOKEN REPLACEMENT

### Step 1.1 — Update `client/src/constants/theme.ts`

Replace the ENTIRE `colors` block with:

```typescript
// src/constants/theme.ts
export const theme = {
  colors: {
    // ─── Primary Brand: Golden Amber with Glow ───
    primary: '#f5b02a',
    primaryRgb: '245, 176, 42',
    primaryHover: '#e8a020',
    primaryLight: 'rgba(245, 176, 42, 0.12)',
    primaryGlow: 'rgba(245, 176, 42, 0.35)',
    primaryForeground: '#000000',
    brandGradient: 'linear-gradient(135deg, #f5b02a, #fcd34d)',

    // ─── Backgrounds — Dark Layered System ───
    background: '#0b0f19',              // page bg
    backgroundGrad1: '#1a1b35',         // gradient stop 1
    backgroundGrad2: '#0b101e',         // gradient stop 2
    surface: 'rgba(255,255,255,0.03)',   // glass card bg
    surfaceHover: 'rgba(255,255,255,0.06)',
    surfaceAlt: 'rgba(255,255,255,0.04)',// table header, alt rows
    surfaceElevated: 'rgba(22,28,48,0.97)', // SideSheet / modal bg

    // ─── Glass System ───
    glassBg: 'rgba(255,255,255,0.03)',
    glassBorder: 'rgba(255,255,255,0.08)',
    glassHover: 'rgba(255,255,255,0.06)',
    glassShadow: '0 8px 32px 0 rgba(0,0,0,0.37)',
    glassBlur: 'blur(16px)',

    // ─── Sidebar ───
    sidebarBg: 'transparent',           // glass panel — no solid color
    sidebarBorder: 'rgba(255,255,255,0.08)',
    sidebarText: '#94a3b8',             // slate-400
    sidebarTextActive: '#f5b02a',
    sidebarHover: 'rgba(255,255,255,0.06)',
    sidebarActiveBg: 'rgba(245,176,42,0.10)',
    sidebarActiveBorder: 'rgba(245,176,42,0.20)',
    sidebarGroupLabel: 'rgba(148,163,184,0.5)',

    // ─── Text ───
    textPrimary: '#f8fafc',             // near white
    textSecondary: '#94a3b8',           // slate-400
    textMuted: 'rgba(148,163,184,0.6)',
    textInverse: '#000000',

    // ─── Borders ───
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.14)',

    // ─── Semantic ───
    success: '#10b981',
    successLight: 'rgba(16,185,129,0.10)',
    successBorder: 'rgba(16,185,129,0.20)',
    warning: '#f5b02a',
    warningLight: 'rgba(245,176,42,0.10)',
    warningBorder: 'rgba(245,176,42,0.20)',
    error: '#ef4444',
    errorLight: 'rgba(239,68,68,0.10)',
    errorBorder: 'rgba(239,68,68,0.20)',
    info: '#3b82f6',
    infoLight: 'rgba(59,130,246,0.10)',
    infoBorder: 'rgba(59,130,246,0.20)',

    // ─── Overlay ───
    overlay: 'rgba(6,8,13,0.75)',

    // ─── Skeleton ───
    skeleton: 'rgba(255,255,255,0.06)',
    skeletonShimmer: 'rgba(255,255,255,0.10)',
  },

  shadows: {
    card: '0 8px 32px 0 rgba(0,0,0,0.37)',
    cardHover: '0 12px 40px rgba(0,0,0,0.4)',
    modal: '-12px 0 60px rgba(0,0,0,0.6)',
    dropdown: '0 8px 24px -4px rgba(0,0,0,0.5)',
    glow: '0 0 20px rgba(245,176,42,0.35)',
    glowButton: '0 4px 15px rgba(245,176,42,0.4)',
    glowButtonHover: '0 6px 20px rgba(245,176,42,0.5)',
  },

  borderRadius: {
    sm: '8px',
    md: '12px',     // inputs, small buttons
    lg: '16px',     // cards, larger buttons
    xl: '20px',     // glass cards
    '2xl': '24px',  // sidebar, major panels
    '3xl': '28px',  // SideSheet
    full: '9999px', // pills, search bar
  },
} as const;
```

### Step 1.2 — Update `client/tailwind.config.ts`

Replace the `theme.extend` block:

```typescript
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      primary: {
        DEFAULT: '#f5b02a',
        hover: '#e8a020',
        light: 'rgba(245,176,42,0.12)',
        glow: 'rgba(245,176,42,0.35)',
        foreground: '#000000',
      },
      // Keep accent for compatibility
      accent: {
        DEFAULT: '#3b82f6',
        hover: '#2563eb',
        light: 'rgba(59,130,246,0.10)',
      },
      sidebar: {
        bg: 'transparent',
        border: 'rgba(255,255,255,0.08)',
        text: '#94a3b8',
        'text-active': '#f5b02a',
        hover: 'rgba(255,255,255,0.06)',
        active: '#f5b02a',
        'active-bg': 'rgba(245,176,42,0.10)',
        'group-label': 'rgba(148,163,184,0.5)',
      },
      surface: {
        DEFAULT: 'rgba(255,255,255,0.03)',
        alt: 'rgba(255,255,255,0.04)',
        elevated: 'rgba(22,28,48,0.97)',
        hover: 'rgba(255,255,255,0.06)',
      },
      ink: {
        DEFAULT: '#f8fafc',
        secondary: '#94a3b8',
        muted: 'rgba(148,163,184,0.6)',
      },
      line: {
        DEFAULT: 'rgba(255,255,255,0.08)',
        strong: 'rgba(255,255,255,0.14)',
      },
      // Semantic — keep names but remap to dark variants
      success: '#10b981',
      warning: '#f5b02a',
      error: '#ef4444',
      info: '#3b82f6',
    },
    boxShadow: {
      card: '0 8px 32px 0 rgba(0,0,0,0.37)',
      'card-hover': '0 12px 40px rgba(0,0,0,0.4)',
      modal: '-12px 0 60px rgba(0,0,0,0.6)',
      dropdown: '0 8px 24px -4px rgba(0,0,0,0.5)',
      glow: '0 0 20px rgba(245,176,42,0.35)',
      'glow-btn': '0 4px 15px rgba(245,176,42,0.4)',
    },
    borderRadius: {
      'xl': '20px',
      '2xl': '24px',
      '3xl': '28px',
    },
    fontFamily: {
      sans: ['"DM Sans"', '"Inter"', 'system-ui', 'sans-serif'],
      mono: ['"JetBrains Mono"', 'monospace'],
    },
    backdropBlur: {
      glass: '16px',
      'glass-sm': '12px',
      'glass-lg': '32px',
    },
    keyframes: {
      fadeInUp: {
        from: { opacity: '0', transform: 'translateY(20px)' },
        to: { opacity: '1', transform: 'translateY(0)' },
      },
      shimmer: {
        '0%': { backgroundPosition: '-200% 0' },
        '100%': { backgroundPosition: '200% 0' },
      },
    },
    animation: {
      'fade-in-up': 'fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      shimmer: 'shimmer 1.5s infinite',
    },
  },
},
```

### Step 1.3 — Update Global CSS (`client/src/index.css` or `globals.css`)

Add these CSS custom properties and global resets **at the top**, keeping any existing Tailwind directives:

```css
/* === DESIGN SYSTEM: DARK GLASS === */
:root {
  --bg-color: #0b0f19;
  --primary: #f5b02a;
  --primary-rgb: 245, 176, 42;
  --primary-glow: rgba(245, 176, 42, 0.4);
  --brand-gradient: linear-gradient(135deg, #f5b02a, #fcd34d);
  --glass-bg: rgba(255, 255, 255, 0.03);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-hover: rgba(255, 255, 255, 0.06);
  --glass-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --danger: #ef4444;
  --success: #10b981;
}

/* Page background with ambient radial glows */
body {
  background-color: var(--bg-color);
  background-image:
    radial-gradient(circle at 15% 50%, rgba(var(--primary-rgb), 0.07) 0%, transparent 50%),
    radial-gradient(circle at 85% 30%, rgba(59, 130, 246, 0.07) 0%, transparent 50%);
  color: var(--text-main);
  min-height: 100vh;
}

/* Glass utility classes */
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}

.glass-card {
  background: linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), 
              box-shadow 0.3s ease, 
              border-color 0.3s ease;
  position: relative;
  overflow: hidden;
}

.glass-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.glass-card:hover::before { opacity: 1; }

.glass-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0,0,0,0.4);
  border-color: rgba(var(--primary-rgb), 0.25);
}

/* Primary glow button */
.btn-primary-glow {
  background: var(--brand-gradient);
  color: #000;
  box-shadow: 0 4px 15px var(--primary-glow);
  transition: box-shadow 0.3s ease, transform 0.2s ease;
}

.btn-primary-glow:hover {
  box-shadow: 0 6px 20px var(--primary-glow);
  transform: translateY(-1px);
}

/* Scrollbar hide utility */
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

/* Section header with gradient line */
.section-header-line {
  height: 1px;
  flex: 1;
  background: linear-gradient(90deg, rgba(var(--primary-rgb), 0.4), transparent);
}

/* Page entrance animation */
.page-enter {
  animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Premium table */
.glass-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 3px;
}

.glass-table th {
  padding: 14px 20px;
  font-weight: 800;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--text-muted);
  text-align: left;
}

.glass-table tbody tr {
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}

.glass-table tbody tr:hover {
  background: rgba(255,255,255,0.03);
  transform: translateY(-1px);
}

.glass-table td {
  padding: 18px 20px;
  border-bottom: 1px solid var(--glass-border);
}
```

---

## PHASE 2 — LAYOUT COMPONENTS

### Step 2.1 — `AdminShell.tsx` (RESTYLE ONLY — keep Outlet)

```
AGENT: Open client/src/components/layout/AdminShell.tsx
CHANGE: The outer container and main area background only
PRESERVE: <Outlet />, all children rendering, all props

New layout wrapper:
```

```tsx
// AdminShell.tsx — STYLE CHANGES ONLY
<div 
  className="flex h-screen overflow-hidden"
  style={{ backgroundColor: '#0b0f19' }}
>
  {/* Sidebar is now a glass panel floating inside padding */}
  <div className="p-4 pr-0 flex-shrink-0">
    <Sidebar />
  </div>

  {/* Main area */}
  <div className="flex flex-col flex-1 overflow-hidden pl-6 pr-6">
    <TopBar />
    <main className="flex-1 overflow-y-auto pb-8 scrollbar-hide">
      {children ?? <Outlet />}
    </main>
  </div>
</div>
```

### Step 2.2 — `Sidebar.tsx` — Full Restyle

```
AGENT: This is the MOST IMPACTFUL change. Restyle completely.
PRESERVE: All NavLink hrefs, all nav group structure, all icon imports, 
          all useAuthStore access, the logout function call.

New visual spec:
```

```tsx
// Sidebar.tsx — NEW VISUAL DESIGN

// OUTER CONTAINER — glass panel, rounded, full height minus padding
<aside 
  className="glass-panel scrollbar-hide"
  style={{
    width: 268,
    height: '100%',
    borderRadius: 24,
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 0',
    overflowY: 'auto',
  }}
>
  {/* BRAND ROW */}
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '0 24px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: 8,
    position: 'sticky', top: 0,
    background: 'rgba(6,8,13,0.6)',
    backdropFilter: 'blur(12px)',
    zIndex: 10,
  }}>
    {/* Brand icon — gradient with glow */}
    <div style={{
      width: 34, height: 34,
      background: 'linear-gradient(135deg, #f5b02a, #fcd34d)',
      borderRadius: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 14px rgba(245,176,42,0.45)',
      flexShrink: 0,
    }}>
      {/* Company logo / initials — keep existing logic */}
    </div>
    <span style={{
      fontSize: 18, fontWeight: 800,
      color: '#f5b02a',
      letterSpacing: '-0.3px',
      lineHeight: 1,
    }}>
      {companyName}
    </span>
  </div>

  {/* NAV MENU */}
  <nav style={{ flex: 1, padding: '8px 0' }}>
    {navGroups.map(group => (
      <div key={group.label ?? 'core'} style={{ marginBottom: 8 }}>
        {/* Group label */}
        {group.label && (
          <p style={{
            fontSize: 10, fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            color: 'rgba(148,163,184,0.45)',
            padding: '18px 24px 6px',
          }}>
            {group.label}
          </p>
        )}

        {/* Nav items */}
        {group.items.map(item => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) => cn(
              'nav-item',    // use .nav-item from global CSS below
              isActive ? 'active' : ''
            )}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '13px 16px',
              margin: '1px 12px',
              borderRadius: 12,
              textDecoration: 'none',
              fontWeight: 500, fontSize: 14,
              transition: 'all 0.15s ease',
              border: '1px solid transparent',
              color: isActive ? '#f5b02a' : '#94a3b8',
              background: isActive ? 'rgba(245,176,42,0.09)' : 'transparent',
              borderColor: isActive ? 'rgba(245,176,42,0.18)' : 'transparent',
              boxShadow: isActive ? '0 0 16px rgba(245,176,42,0.05)' : 'none',
            })}
          >
            <item.icon size={17} style={{ flexShrink: 0 }} />
            {item.label}
          </NavLink>
        ))}
      </div>
    ))}
  </nav>

  {/* USER FOOTER */}
  <div style={{
    padding: '16px 16px 0',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    marginTop: 'auto',
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px',
      borderRadius: 12,
      cursor: 'pointer',
      transition: 'background 0.15s ease',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        background: 'rgba(245,176,42,0.15)',
        border: '1px solid rgba(245,176,42,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800, color: '#f5b02a',
        flexShrink: 0,
      }}>
        {userInitials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', margin: 0, lineHeight: 1.2 }}>
          {userName}
        </p>
        <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, marginTop: 2 }}>
          {userRole}
        </p>
      </div>
    </div>
  </div>
</aside>
```

### Step 2.3 — `TopBar.tsx` — Full Restyle

```
AGENT: Restyle the top bar. 
PRESERVE: notification bell logic, useAuthStore usage, unread count badge, dropdown menu triggers.
```

```tsx
// TopBar.tsx — NEW VISUAL DESIGN
<header style={{
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '20px 0 28px 0',
  flexShrink: 0,
}}>

  {/* Left: Page title — dynamic from route */}
  <div style={{ fontSize: 18, fontWeight: 600, color: '#f5b02a' }}>
    {pageTitle}
  </div>

  {/* Right: actions */}
  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

    {/* Search bar — pill shape */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      padding: '9px 16px',
      borderRadius: 9999,
      width: 280,
      transition: 'all 0.2s ease',
    }}>
      <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
      <input
        type="text"
        placeholder="Search resources, users..."
        style={{
          background: 'transparent', border: 'none', outline: 'none',
          fontSize: 13, color: '#f8fafc', width: '100%',
        }}
      />
    </div>

    {/* Notification bell — circular glass button */}
    <button style={{
      width: 38, height: 38, borderRadius: '50%',
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', transition: 'all 0.2s ease',
      position: 'relative', color: '#f5b02a',
    }}>
      <Bell size={17} />
      {/* Unread badge — keep existing logic */}
      {unreadCount > 0 && (
        <span style={{
          position: 'absolute', top: -2, right: -2,
          width: 16, height: 16, borderRadius: '50%',
          background: '#ef4444',
          fontSize: 9, fontWeight: 800, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>

    {/* Settings button */}
    <button style={{
      width: 38, height: 38, borderRadius: '50%',
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', transition: 'all 0.2s ease',
      color: '#94a3b8',
    }}>
      <Settings size={17} />
    </button>

  </div>
</header>
```

---

## PHASE 3 — UI COMPONENT LIBRARY RESTYLE

For each shared component, the rule is:
**Change className / style props. Never change props interface, hook calls, or rendered data.**

### Step 3.1 — Cards / Content Containers

All instances of this pattern:
```tsx
// OLD
<div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
```

Replace with:
```tsx
// NEW
<div className="glass-card" style={{ borderRadius: 20, overflow: 'hidden' }}>
```

Or for stat cards / panels that don't need the hover effect:
```tsx
<div style={{
  background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20,
}}>
```

### Step 3.2 — Buttons

**Primary button** (CTA):
```tsx
// OLD
className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors"

// NEW — inline style to get gradient + glow
style={{
  height: 38, padding: '0 20px',
  background: 'linear-gradient(135deg, #f5b02a, #fcd34d)',
  color: '#000', fontWeight: 700, fontSize: 14,
  borderRadius: 12, border: 'none',
  boxShadow: '0 4px 15px rgba(245,176,42,0.35)',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 8,
  transition: 'all 0.25s ease',
}}
// Add onMouseEnter → boxShadow: '0 6px 20px rgba(245,176,42,0.5)', transform: 'translateY(-1px)'
// Add onMouseLeave → reset
```

**Secondary / Outline button**:
```tsx
// OLD
className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt"

// NEW
style={{
  height: 38, padding: '0 18px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 12,
  color: '#f8fafc', fontWeight: 600, fontSize: 13,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
}}
```

**Icon button** (circular):
```tsx
// NEW
style={{
  width: 36, height: 36, borderRadius: '50%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: '#94a3b8',
  transition: 'all 0.2s ease',
}}
```

### Step 3.3 — `DataTable.tsx`

```
AGENT: Restyle the table container and rows. 
PRESERVE: TanStack Table logic, sorting, pagination handlers, column definitions,
          onRowClick, selectable logic, all hook integrations.

KEY CHANGES:
1. Remove bg-white container → glass-card
2. Table rows: use border-spacing:4 with separate border style
3. Header: muted uppercase on dark bg instead of #F7F8FA
4. Hover state: rgba(255,255,255,0.03) not #F7F8FA
5. Selected row: rgba(245,176,42,0.08) not bg-primary-light
```

```tsx
// DataTable wrapper
<div className="glass-card" style={{ borderRadius: 20, overflow: 'hidden' }}>
  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 3px' }}>
    <thead>
      <tr>
        {/* Column headers */}
        <th style={{
          padding: '14px 20px',
          fontWeight: 900, fontSize: 10,
          textTransform: 'uppercase', letterSpacing: '0.18em',
          color: '#94a3b8', textAlign: 'left',
          background: 'rgba(255,255,255,0.02)',
        }}>
          COLUMN NAME
        </th>
      </tr>
    </thead>
    <tbody>
      {rows.map(row => (
        <tr
          key={row.id}
          style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.03)';
            (e.currentTarget as HTMLTableRowElement).style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
            (e.currentTarget as HTMLTableRowElement).style.transform = 'translateY(0)';
          }}
        >
          <td style={{
            padding: '18px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            fontSize: 14, color: '#f8fafc',
          }}>
            {/* cell content */}
          </td>
        </tr>
      ))}
    </tbody>
  </table>

  {/* Pagination */}
  <div style={{
    borderTop: '1px solid rgba(255,255,255,0.07)',
    padding: '12px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'rgba(255,255,255,0.02)',
  }}>
    <span style={{ fontSize: 12, color: '#94a3b8' }}>
      Showing {start}–{end} of {total}
    </span>
    {/* Prev/Next — use glass icon buttons */}
  </div>
</div>
```

### Step 3.4 — `StatusBadge.tsx`

```
AGENT: Update badge colors to dark-themed equivalents. Same structure, same props.
```

```tsx
// NEW badge color map
const badgeConfig = {
  active:      { bg: 'rgba(16,185,129,0.12)',  text: '#34d399', border: 'rgba(16,185,129,0.25)' },
  invited:     { bg: 'rgba(245,176,42,0.12)',  text: '#fbbf24', border: 'rgba(245,176,42,0.25)' },
  onboarding:  { bg: 'rgba(59,130,246,0.12)',  text: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  probation:   { bg: 'rgba(168,85,247,0.12)',  text: '#c084fc', border: 'rgba(168,85,247,0.25)' },
  on_leave:    { bg: 'rgba(234,179,8,0.12)',   text: '#fde047', border: 'rgba(234,179,8,0.25)' },
  terminated:  { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', border: 'rgba(239,68,68,0.25)' },
  archived:    { bg: 'rgba(255,255,255,0.06)', text: '#94a3b8', border: 'rgba(255,255,255,0.12)' },
};

// Badge element stays the same shape:
<span style={{
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
  padding: '3px 10px', borderRadius: 9999,
  background: badgeConfig[state].bg,
  color: badgeConfig[state].text,
  border: `1px solid ${badgeConfig[state].border}`,
}}>
  {label}
</span>
```

### Step 3.5 — `InsightCard.tsx`

```tsx
// Severity config — dark glass
const severityConfig = {
  critical: { 
    bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.20)',
    dot: '#ef4444', badge: { bg: 'rgba(239,68,68,0.15)', text: '#f87171' }
  },
  warning: { 
    bg: 'rgba(245,176,42,0.08)', border: 'rgba(245,176,42,0.20)',
    dot: '#f5b02a', badge: { bg: 'rgba(245,176,42,0.15)', text: '#fbbf24' }
  },
  info: { 
    bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.20)',
    dot: '#3b82f6', badge: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa' }
  },
};

// Card wrapper:
<div style={{
  borderRadius: 16,
  border: `1px solid ${config.border}`,
  background: config.bg,
  backdropFilter: 'blur(8px)',
  padding: '16px',
  display: 'flex', gap: 12,
}}>
  ...existing content structure...
</div>
```

### Step 3.6 — `EmptyState.tsx`

```tsx
// NEW empty state styling
<div style={{ 
  display: 'flex', flexDirection: 'column', 
  alignItems: 'center', justifyContent: 'center',
  padding: '64px 24px', textAlign: 'center',
}}>
  <div style={{
    width: 56, height: 56, borderRadius: 16,
    background: 'rgba(245,176,42,0.10)',
    border: '1px solid rgba(245,176,42,0.20)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  }}>
    <Icon size={24} style={{ color: '#f5b02a' }} />
  </div>
  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', margin: 0, marginBottom: 8 }}>
    {title}
  </h3>
  <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, marginBottom: 24, maxWidth: 260, lineHeight: 1.6 }}>
    {description}
  </p>
  {/* Primary button — gradient */}
</div>
```

### Step 3.7 — `ErrorState.tsx`

Same structure as EmptyState but:
```tsx
// Icon container:
background: 'rgba(239,68,68,0.10)'
border: '1px solid rgba(239,68,68,0.20)'
// Icon color: '#ef4444'
// Title: same #f8fafc
// Retry button: secondary glass button style
```

### Step 3.8 — `TableSkeleton.tsx`

```tsx
// NEW skeleton — dark pulse
// Container: glass-card borderRadius 20

// Header shimmer row:
background: 'rgba(255,255,255,0.04)'

// Fake column headers:
background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 10,
animation: shimmer linear infinite

// Skeleton row pulse:
background: 'rgba(255,255,255,0.06)'
animation: 'pulse 1.5s ease-in-out infinite'

// Avatar circle:
background: 'rgba(255,255,255,0.08)'

// Shimmer lines:
background: 'rgba(255,255,255,0.06)', borderRadius: 4
```

### Step 3.9 — `Modal.tsx` / `ConfirmDialog.tsx`

```
AGENT: Replace the white Dialog shell with a dark glass SideSheet pattern.
PRESERVE: shadcn Dialog's open/onOpenChange, DialogTitle, DialogDescription, 
          all children, all footer button handlers.

VISUAL CHANGE ONLY:
```

```tsx
// DialogContent style override
<DialogContent 
  className="p-0 overflow-hidden border-0"
  style={{
    background: 'linear-gradient(160deg, rgba(22,28,48,0.97) 0%, rgba(11,15,28,0.99) 100%)',
    backdropFilter: 'blur(32px)',
    WebkitBackdropFilter: 'blur(32px)',
    borderRadius: 24,
    border: '1px solid rgba(255,255,255,0.09)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    // Ambient glow accent top
    position: 'relative',
  }}
>
  {/* Top highlight */}
  <div style={{
    position: 'absolute', top: 0, left: 0, width: '100%', height: 1,
    background: 'linear-gradient(90deg, rgba(245,176,42,0.5) 0%, rgba(245,176,42,0.1) 40%, transparent 70%)',
    pointerEvents: 'none',
  }} />

  {/* Header */}
  <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
    <DialogTitle style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', margin: 0 }}>
      {title}
    </DialogTitle>
    <DialogDescription style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
      {description}
    </DialogDescription>
  </div>

  {/* Content */}
  <div style={{ padding: '24px 28px' }}>
    {children}
  </div>

  {/* Footer */}
  <div style={{
    padding: '16px 28px 24px',
    borderTop: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(255,255,255,0.02)',
    display: 'flex', justifyContent: 'flex-end', gap: 10,
  }}>
    {footer}
  </div>
</DialogContent>
```

### Step 3.10 — Form Inputs

```tsx
// All inputs — dark glass field style
style={{
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 12,
  padding: '12px 16px',
  fontSize: 14, color: '#f8fafc',
  outline: 'none',
  transition: 'all 0.25s ease',
}}
// onFocus: background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(245,176,42,0.35)',
//          boxShadow: '0 0 0 3px rgba(245,176,42,0.06), 0 0 24px rgba(245,176,42,0.05)'
// placeholder color: 'rgba(148,163,184,0.45)'

// Labels:
style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94a3b8', marginBottom: 8, display: 'block' }}
```

---

## PHASE 4 — PAGE-LEVEL TEMPLATES

### Step 4.1 — Page Layout Wrapper (apply to every page)

```
AGENT: In every Page component (OrganizationPage, PeoplePage, RolesPage, etc.),
wrap the top-level div with animate class:
```

```tsx
// OLD
<div className="space-y-5">

// NEW
<div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
```

### Step 4.2 — Page Header Section

```tsx
// OLD
<div className="flex items-start justify-between">
  <h1 className="text-[22px] font-semibold tracking-tight text-ink">Page Title</h1>
  ...

// NEW
<section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
  <div>
    <h1 style={{
      fontSize: 34, fontWeight: 800, margin: 0,
      background: 'linear-gradient(135deg, #f5b02a, #fcd34d)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      letterSpacing: '-0.3px',
    }}>
      {pageTitle}
    </h1>
    <p style={{ color: '#94a3b8', fontSize: 15, margin: '6px 0 0', fontWeight: 400 }}>
      {pageSubtitle}
    </p>
  </div>
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    {/* buttons */}
  </div>
</section>
```

### Step 4.3 — Section Headers (within pages that have sub-sections)

```tsx
// Section divider — gradient line style
<div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
  <span style={{ fontSize: 18, fontWeight: 700, color: '#f5b02a', whiteSpace: 'nowrap' }}>
    Section Title
  </span>
  <div style={{
    height: 1, flex: 1,
    background: 'linear-gradient(90deg, rgba(245,176,42,0.35), transparent)',
    opacity: 0.5,
  }} />
</div>
```

### Step 4.4 — Stat Cards (Dashboard / Overview page)

```tsx
// OLD
<div className="bg-white rounded-lg border border-line shadow-card p-5">
  <div className="text-[28px] font-bold">247</div>

// NEW — glass card with large stat value
<div className="glass-card" style={{ padding: 24, borderRadius: 20, display: 'flex', flexDirection: 'column' }}>
  {/* Header row */}
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
    <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94a3b8' }}>
      {label}
    </span>
    <div style={{
      width: 40, height: 40, borderRadius: 10,
      background: 'rgba(245,176,42,0.10)',
      border: '1px solid rgba(245,176,42,0.20)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#f5b02a',
    }}>
      <Icon size={18} />
    </div>
  </div>

  {/* Stat value — MUCH larger */}
  <div style={{ fontSize: 48, fontWeight: 900, color: '#f8fafc', lineHeight: 1 }}>
    {value}
  </div>
  <div style={{ marginTop: 8, fontSize: 13, color: '#94a3b8' }}>
    {trend}
  </div>
</div>
```

### Step 4.5 — Filter Bar

```tsx
// NEW filter bar — glass inputs
<div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
  
  {/* Search — pill shaped */}
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 9999,
    padding: '9px 16px',
    flex: '0 0 280px',
  }}>
    <Search size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
    <input
      placeholder="Search..."
      style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: '#f8fafc', width: '100%' }}
    />
  </div>

  {/* Filter selects — glass style */}
  <select style={{
    height: 38, padding: '0 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 12, color: '#f8fafc', fontSize: 13,
    outline: 'none', cursor: 'pointer',
    minWidth: 130,
  }}>
    <option>All Status</option>
  </select>

</div>
```

### Step 4.6 — Intelligence Banner (module-level warning)

```tsx
// OLD: amber-50 background

// NEW: dark glass with amber glow
{criticalInsightCount > 0 && (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 20px',
    background: 'rgba(245,176,42,0.08)',
    border: '1px solid rgba(245,176,42,0.20)',
    borderRadius: 14,
    backdropFilter: 'blur(8px)',
  }}>
    <AlertTriangle size={16} style={{ color: '#f5b02a', flexShrink: 0 }} />
    <p style={{ fontSize: 13, color: '#fbbf24', fontWeight: 600, margin: 0 }}>
      {criticalInsightCount} critical issue{criticalInsightCount > 1 ? 's' : ''} detected in this module.
    </p>
    <a href="/overview" style={{
      marginLeft: 'auto', fontSize: 12, fontWeight: 700,
      color: '#f5b02a', textDecoration: 'none', flexShrink: 0,
    }}>
      View all issues →
    </a>
  </div>
)}
```

---

## PHASE 5 — SHADCN/UI OVERRIDES

```
AGENT: shadcn components render with their own default styles. 
We need to override them at the CSS level without modifying component files.

Add these overrides to the global CSS file:
```

```css
/* ── shadcn / Radix overrides for dark glass theme ── */

/* Dialog overlay */
[data-radix-dialog-overlay] {
  background: rgba(6, 8, 13, 0.75) !important;
  backdrop-filter: blur(6px);
}

/* Dialog content — transparent so our inline style shows */
[data-radix-dialog-content] {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

/* Select trigger */
[data-radix-select-trigger] {
  background: rgba(255,255,255,0.04) !important;
  border: 1px solid rgba(255,255,255,0.09) !important;
  color: #f8fafc !important;
  border-radius: 12px !important;
}

/* Select content dropdown */
[data-radix-select-content] {
  background: rgba(22,28,48,0.97) !important;
  backdrop-filter: blur(24px) !important;
  border: 1px solid rgba(255,255,255,0.09) !important;
  border-radius: 16px !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
}

[data-radix-select-item] {
  color: #94a3b8 !important;
  border-radius: 8px !important;
}

[data-radix-select-item][data-highlighted] {
  background: rgba(245,176,42,0.10) !important;
  color: #f5b02a !important;
}

/* Dropdown menu content */
[data-radix-dropdown-menu-content] {
  background: rgba(22,28,48,0.97) !important;
  backdrop-filter: blur(24px) !important;
  border: 1px solid rgba(255,255,255,0.09) !important;
  border-radius: 16px !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
}

[data-radix-dropdown-menu-item] {
  color: #94a3b8 !important;
  border-radius: 8px !important;
  fontSize: 13px !important;
}

[data-radix-dropdown-menu-item]:hover,
[data-radix-dropdown-menu-item][data-highlighted] {
  background: rgba(255,255,255,0.06) !important;
  color: #f8fafc !important;
}

/* Tooltip */
[data-radix-tooltip-content] {
  background: rgba(22,28,48,0.97) !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  border-radius: 10px !important;
  color: #f8fafc !important;
  font-size: 12px !important;
}

/* Checkbox (permission matrix, bulk select) */
[data-radix-checkbox-root] {
  background: rgba(255,255,255,0.05) !important;
  border: 1px solid rgba(255,255,255,0.15) !important;
  border-radius: 5px !important;
}

[data-radix-checkbox-root][data-state="checked"] {
  background: #f5b02a !important;
  border-color: #f5b02a !important;
}

/* Sheet (slide-in panel) */
[data-radix-dialog-content][data-side="right"],
[data-radix-sheet-content] {
  background: linear-gradient(160deg, rgba(22,28,48,0.97) 0%, rgba(11,15,28,0.99) 100%) !important;
  border-left: 1px solid rgba(255,255,255,0.09) !important;
  border-radius: 28px 0 0 28px !important;
}

/* Sonner toast */
[data-sonner-toaster] [data-sonner-toast] {
  background: linear-gradient(145deg, rgba(20,25,35,0.97) 0%, rgba(15,20,30,0.99) 100%) !important;
  backdrop-filter: blur(12px) !important;
  border: 1px solid rgba(255,255,255,0.09) !important;
  border-radius: 14px !important;
  color: #f8fafc !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
}

/* Tabs */
[data-radix-tabs-list] {
  background: rgba(255,255,255,0.04) !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 12px !important;
  padding: 4px !important;
}

[data-radix-tabs-trigger] {
  color: #94a3b8 !important;
  border-radius: 9px !important;
  font-weight: 600 !important;
  font-size: 13px !important;
}

[data-radix-tabs-trigger][data-state="active"] {
  background: rgba(245,176,42,0.12) !important;
  color: #f5b02a !important;
}

/* Progress bar */
[data-radix-progress-root] {
  background: rgba(255,255,255,0.08) !important;
  border-radius: 9999px !important;
}

[data-radix-progress-indicator] {
  background: linear-gradient(90deg, #f5b02a, #fcd34d) !important;
  border-radius: 9999px !important;
}
```

---

## PHASE 6 — PAGE-BY-PAGE AUDIT

```
AGENT: After completing Phases 1–5, open each page and do a visual audit.
For each page, find and replace:
```

### Audit Checklist (run for every page file):

```
Search for these OLD patterns → Replace with NEW equivalent:

bg-white          → glass-card or rgba(255,255,255,0.03)
bg-\[#F7F8FA\]    → rgba(255,255,255,0.02)
bg-\[#F1F3F7\]    → rgba(255,255,255,0.04)
text-ink\b        → color: '#f8fafc'
text-ink-secondary → color: '#94a3b8'
text-ink-muted    → color: 'rgba(148,163,184,0.6)'
border-line       → border: '1px solid rgba(255,255,255,0.08)'
bg-primary-light  → rgba(245,176,42,0.10)
text-primary      → color: '#f5b02a'
bg-primary        → background: 'linear-gradient(135deg, #f5b02a, #fcd34d)'
shadow-card       → boxShadow: '0 8px 32px rgba(0,0,0,0.37)'
rounded-lg        → borderRadius: 16 (or 20 for glass-card)
rounded-xl        → borderRadius: 20
rounded-md        → borderRadius: 12
h-9               → height: 38
h-10              → height: 40
h-14              → height: 56
px-4              → padding: '0 16px'
px-5              → padding: '0 20px'
```

### Pages to audit (in priority order):

1. `pages/overview/OverviewPage.tsx` — most visible, do first
2. `pages/people/PeoplePage.tsx`
3. `pages/organization/OrganizationPage.tsx`
4. `pages/roles/RolesPage.tsx`
5. `pages/audit-logs/AuditLogsPage.tsx`
6. `pages/security/SecurityPage.tsx`
7. All remaining pages

---

## PHASE 7 — THEME SWITCHER (OPTIONAL — BONUS)

The dashboard demo has a multi-theme switcher (Gold / Blue / Purple / White). If the working admin portal doesn't have one yet, add it to the TopBar:

```tsx
// Add to ThemeContext or useUIStore
// The CSS var approach from the demo is the cleanest:

const themes = {
  'Gold':    { '--primary': '#f5b02a', '--primary-rgb': '245, 176, 42' },
  'Blue':    { '--primary': '#3b82f6', '--primary-rgb': '59, 130, 246' },
  'Purple':  { '--primary': '#a855f7', '--primary-rgb': '168, 85, 247' },
  'Teal':    { '--primary': '#14b8a6', '--primary-rgb': '20, 184, 166' },
};

// Apply via:
Object.entries(themes[selected]).forEach(([key, val]) => {
  document.documentElement.style.setProperty(key, val);
});
```

---

## WHAT TO NEVER CHANGE

```
❌ DO NOT TOUCH:
- server/ (anything in backend)
- src/features/**/hooks/*.ts (all data fetching hooks)
- src/lib/apiClient.ts
- src/lib/rbac.ts
- src/store/useAuthStore.ts
- src/store/useUIStore.ts
- src/types/index.ts
- src/constants/queryKeys.ts
- src/constants/routes.ts
- src/constants/permissions.ts
- Any component's props interface
- Any exported hook's return type
- Any TanStack Query queryFn or mutationFn
- Any form validation (zod schemas)
- Any route definition in App.tsx / router

✅ ONLY TOUCH:
- className strings
- style props
- CSS custom properties (tailwind.config.ts, index.css, theme.ts)
- The visual shell components (AdminShell, Sidebar, TopBar)
- The visual presentation of shared UI components (DataTable, Modal, Badge, etc.)
```

---

## VALIDATION CHECKLIST

After all phases complete:

**Visual:**
- [ ] Body background is dark (#0b0f19) with radial amber/blue ambient glows
- [ ] Sidebar is a floating glass panel (rounded-2xl, blur backdrop)
- [ ] Active nav item has amber color + glass border + subtle glow
- [ ] All cards are glassmorphism (blur + transparent bg + border)
- [ ] Primary buttons have gradient + glow shadow
- [ ] Stat values on dashboard are 48px font-weight-900
- [ ] All pages have fadeInUp entrance animation
- [ ] Tables use dark rows with subtle border-spacing
- [ ] Modals/dialogs are dark glass panels with amber top highlight
- [ ] All text follows: headings #f8fafc, secondary #94a3b8, muted rgba(148,163,184,0.6)
- [ ] Status badges use dark transparent backgrounds with border tints
- [ ] Search bar in topbar is pill-shaped
- [ ] Section headers use gradient line divider pattern

**Functional:**
- [ ] All navigation links still work
- [ ] Login/logout flow unchanged
- [ ] All CRUD operations (create/edit/delete) work
- [ ] TanStack Query data still fetches and displays
- [ ] Filters, search, and pagination all work
- [ ] PermissionGate still gates UI correctly
- [ ] Audit logs still log correctly
- [ ] Toast notifications still appear
- [ ] TypeScript compile: `npx tsc --noEmit` zero errors

---

## AGENT EXECUTION ORDER

```
1. Read /ui-ux-pro-max/SKILL.md
2. Read all admin-*.md spec files (provided in this directory)
3. PHASE 0: Read and map all component files — produce internal token map
4. PHASE 1: Update theme.ts → tailwind.config.ts → global CSS
5. PHASE 2: AdminShell → Sidebar → TopBar
6. PHASE 3: All UI components (DataTable, Modal, StatusBadge, etc.)
7. PHASE 4: Page layout patterns
8. PHASE 5: shadcn CSS overrides
9. PHASE 6: Page-by-page audit
10. RUN: npx tsc --noEmit → fix any errors
11. VISUAL REVIEW: Screenshot each page → confirm dark glass aesthetic
12. PHASE 7 (optional): Theme switcher
```

---

*End of Design Migration Plan. Total estimated effort: 1 focused Antigravity agent session.*
*Zero backend changes. Zero functionality changes. Pure visual transformation.*
