export const theme = {
  colors: {
    // ─── Primary Brand: Golden Amber with Glow ───
    primary: '#f59e0b',
    primaryRgb: '245, 158, 11',
    primaryHover: '#d97706',
    primaryLight: 'rgba(245,158,11, 0.12)',
    primaryGlow: 'rgba(245,158,11, 0.35)',
    primaryForeground: '#000000',
    brandGradient: 'linear-gradient(135deg, #f59e0b, #fcd34d)',

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
    sidebarTextActive: '#f59e0b',
    sidebarHover: 'rgba(255,255,255,0.06)',
    sidebarActiveBg: 'rgba(245,158,11,0.10)',
    sidebarActiveBorder: 'rgba(245,158,11,0.20)',
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
    warning: '#f59e0b',
    warningLight: 'rgba(245,158,11,0.10)',
    warningBorder: 'rgba(245,158,11,0.20)',
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
    glow: '0 0 20px rgba(245,158,11,0.35)',
    glowButton: '0 4px 15px rgba(245,158,11,0.4)',
    glowButtonHover: '0 6px 20px rgba(245,158,11,0.5)',
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

  // DRD 9.1: structure tokens (mirrors tailwind.config.ts)
  layout: {
    contentMaxWidth: 1280,
    gutter: 24,
    gutterWide: 32,
    railWidth: 248,
    railCollapsedWidth: 64,
    topBarHeight: 56,
    rowHeight: 44,
    rowHeightCompact: 36,
    statusDot: 8,
  },

  typeScale: {
    label: 12,
    table: 13,
    body: 14,
    section: 16,
    title: 20,
    tile: 28,
  },

  motion: {
    fastMs: 150,
    panelMs: 200,
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
} as const;
