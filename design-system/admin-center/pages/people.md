# People Page Overrides

> **PROJECT:** Admin Center
> **Generated:** 2026-06-16 11:29:26
> **Page Type:** Settings / Profile

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1200px (standard)
- **Layout:** Full-width sections, centered content
- **Sections:** 1. Hero (product + aggregate rating), 2. Rating breakdown, 3. Individual reviews, 4. Buy/CTA

### Spacing Overrides

- No overrides — use Master spacing

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Trust colors. Star ratings gold. Verified badge green. Review sentiment colors.

### Component Overrides

- Avoid: Use arbitrary large z-index values
- Avoid: Use for flat single-level sites
- Avoid: Ignore accessibility motion settings

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: Deal movement animations, metric updates, leaderboard ranking changes, gauge needle movements, status change highlights
- Layout: Define z-index scale system (10 20 30 50)
- Navigation: Use for sites with 3+ levels of depth
- Animation: Check prefers-reduced-motion media query
- CTA Placement: After reviews summary + Buy button alongside reviews
