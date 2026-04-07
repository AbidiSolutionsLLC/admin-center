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
