# LeadGuard OS V6 — UI/UX Design System & Guidelines

This document defines the visual design system, interaction patterns, component hierarchies, and accessibility standards for LeadGuard OS V6.

---

## 1. Visual Identity & Brand Philosophy

LeadGuard is engineered to visually project:
- **Trust & Data Integrity**: Clear information density without visual clutter or unnecessary animations.
- **Revenue Intelligence**: Clear business impact highlights, quantified diagnostic metrics, and executive-ready summaries.
- **Professional SaaS Aesthetics**: Modern slate/dark palette, crisp typography (`Inter`), semantic alert colors, and high contrast.

---

## 2. Color Palette & Semantic Tokens

| Token | Hex Value | Semantic Usage |
|---|:---:|---|
| `--bg-base` | `#0b0f19` | Application background |
| `--bg-surface` | `#0f172a` | Card & container surfaces |
| `--bg-elevated` | `#1e293b` | Dropdowns, dialogs, active highlights |
| `--border-subtle` | `#1e293b` | Structural dividers |
| `--border-strong` | `#334155` | Focused inputs, card borders |
| `--brand-primary` | `#2563eb` | Primary call-to-actions, brand identity |
| `--brand-accent` | `#38bdf8` | Links, active tab indicators |
| `--status-critical` | `#ef4444` | Critical diagnostic errors, high regressions |
| `--status-warning` | `#f59e0b` | Medium severity alerts, trial warnings |
| `--status-success` | `#10b981` | Clean score, resolved alerts, successful runs |

---

## 3. Mandatory Component States

Every interactive view and data table across the application must implement 6 states:
1. **Loading State**: Clean pulse skeletons matching the layout grid.
2. **Empty State**: Informative icon, description, and primary call-to-action (e.g. "No monitors configured yet — Add your first website").
3. **Success / Active State**: Clean, responsive presentation of real data.
4. **Error State**: Clear error message with a "Retry" button.
5. **Permission Denied State**: Clear message indicating insufficient RBAC permissions.
6. **Form Validation State**: Inline error messages under invalid inputs without generic alerts.

---

## 4. Accessibility & Responsive Rules

- All interactive controls have visible focus rings (`outline: 2px solid #38bdf8`).
- Color is never used as the sole indicator of health status (badges always combine status color with explicit text e.g. "CRITICAL (Score: 35)").
- Tables adapt horizontally with scroll containers on mobile/tablet viewports without horizontal page blowouts.
