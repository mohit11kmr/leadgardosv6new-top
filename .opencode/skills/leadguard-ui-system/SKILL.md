---
name: leadguard-ui-system
description: Design system guidelines, token standards, component conventions, and UI architecture for LeadGuard OS V6. Use when creating or refining UI components, layouts, and styles.
---

# LeadGuard OS V6 — UI & Design System Guidelines

LeadGuard OS V6 features a refined, dark-mode cybersecurity and revenue-intelligence design language built on modern CSS custom properties and React 19 component primitives.

## Architectural Principles

1. **Preserve & Enhance Existing Foundation**:
   - The existing design token architecture in `apps/web/src/styles.css` and primitives in `apps/web/src/components/ui/` provide a solid base.
   - Do NOT blindly wipe out or replace the component system with an unrelated CSS framework (e.g. Tailwind or external UI libraries).
   - Refactor and extend established CSS custom properties and component interfaces incrementally.

2. **Design Tokens & System Variables**:
   - **Color Palette**:
     - Backgrounds: `--bg-app` (`#090d16`), `--bg-sidebar` (`#0d121f`), `--bg-surface` (`#111726`), `--bg-surface-elevated` (`#172033`), `--bg-surface-hover` (`#1e293b`).
     - Borders: `--border-color` (`#1e293b`), `--border-subtle` (`#182234`).
     - Typography: `--text-primary` (`#f8fafc`), `--text-secondary` (`#94a3b8`), `--text-muted` (`#64748b`).
     - Semantic Accents: `--primary` (`#3b82f6`), `--success` (`#10b981`), `--warning` (`#f59e0b`), `--danger` (`#ef4444`), `--purple` (`#8b5cf6`).
   - **Typography**: Clear hierarchical sans-serif typography (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`), standard weights (400, 500, 600, 700), high contrast readability.
   - **Spacing & Radii**: Multiples of 4/8px grid (`gap-2`, `gap-4`, `gap-6`), `--radius-sm` (6px), `--radius-md` (10px), `--radius-lg` (14px).

---

## Component System Rules

- **Buttons (`Button.tsx`)**: Support variants (`primary`, `secondary`, `outline`, `danger`, `ghost`), sizes (`sm`, `md`, `lg`), explicit loading spinner state, disabled attributes, and accessibility focus rings.
- **Inputs & Forms (`Input.tsx`)**: Label, helper text, error message, leading/trailing icons, active/focus states, disabled states.
- **Cards & Surfaces (`Card.tsx`, `MetricCard.tsx`)**: Subtle borders, elevated surface background, hover transitions where interactive, structured headers and content bodies.
- **Badges & Status Tags (`Badge.tsx`)**: Semantic color variants (`primary`, `success`, `warning`, `danger`, `neutral`, `purple`) with matching translucent backgrounds and solid text.
- **Severity Indicators**: Standardized 4-tier categorization for findings:
  - `CRITICAL` (Red / Danger): Direct revenue blocker or security hazard.
  - `HIGH` (Amber / Warning): Probable lead leakage or performance degradation.
  - `MEDIUM` (Blue / Info): Suboptimal tracking or validation friction.
  - `LOW` (Muted / Slate): Best-practice improvement.
- **Score Displays (`ScoreRing.tsx`)**: Circular SVG or gauge visualizations (0–100 scale), colored by health threshold (>85 Green, 60–84 Amber, <60 Red).
- **Data Tables**: Fixed headers, striped or bordered rows, sort indicators, truncation with tooltips for long identifiers, responsive horizontal scrolling on small viewports.
- **Modals & Dialogs (`Modal.tsx`)**: Backdrop scrim, focus trap, Escape key dismiss, explicit close button, confirmation action states.
- **Notifications & Feedback**: Non-blocking toasts or inline alerts with clear severity icons and dismissal.
- **Loading States**: Skeleton loaders that match the dimensions of target content; avoid raw full-page spinner freezes.
- **Empty States (`States.tsx`)**: Explicit icon, informative explanation of why data is empty, and actionable primary CTA (e.g. "Run New Audit").
- **Error States (`States.tsx`)**: Plain-language description of error, retry button, and support/recovery path.
- **Responsive Behavior**: Mobile-first fluid layout (`@media (max-width: 768px)`), collapsible sidebars, wrap-around metric cards, stackable table rows on narrow screens.
