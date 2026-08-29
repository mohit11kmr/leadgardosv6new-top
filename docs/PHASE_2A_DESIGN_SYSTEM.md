# LeadGuard OS V6 — Master Design System Specification (Phase 2A)

**Document Version**: 6.0.0-design-system  
**Date**: 2026-08-29  
**Status**: Architecture & Specification Only (Zero Product Code Implementation)  
**Target Repository**: `mohit11kmr/leadgardosv6new-top`

---

## 1. Aesthetic Identity & Design Principles

LeadGuard's visual identity reflects a **serious, mission-critical operational revenue platform**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEADGUARD DESIGN PRINCIPLES                         │
│                                                                             │
│  1. AUTHORITATIVE & CALM: Deep slate/navy dark mode that prevents eye strain│
│  2. HIGH DENSITY & SCANNABLE: Clear typography hierarchy with zero clutter  │
│  3. EVIDENCE-GROUNDED: Color highlights indicate real diagnostic findings    │
│  4. PRECISE & DETERMINISTIC: Exact numbers, confidence ratings, timestamps  │
│  5. RESPONSIVE BY DESIGN: Sturdy adaptive layouts from 375px to 4K displays │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Prohibited Visual Anti-Patterns:
- ❌ **No excessive neon or distracting rainbow gradients.**
- ❌ **No decorative glassmorphism with heavy unreadable blur.**
- ❌ **No fake telemetry or un-grounded animations.**
- ❌ **No giant empty marketing cards inside the authenticated app shell.**

---

## 2. Master Token Architecture

All design tokens are standardized as CSS custom properties in `styles.css`.

### 2.1 Color Tokens & Surface Hierarchy

```
[LEVEL 0: APP CANVAS]
  --bg-app: #090d16 (Deepest Obsidian Navy)
      │
      ▼
[LEVEL 1: CONTAINER SURFACES & SIDEBAR]
  --bg-sidebar: #0d121f
  --bg-surface: #111726 (Standard Card Surface)
      │
      ▼
[LEVEL 2: ELEVATED SURFACES & POPOVERS]
  --bg-surface-elevated: #172033 (Hover state & Dropdowns)
  --bg-surface-hover: #1e293b
      │
      ▼
[LEVEL 3: MODALS & FLOATING DRAWERS]
  --bg-modal: #131b2e (High-contrast overlay)
```

| Token Name | Hex Value | RGBA / Alpha | Semantic Purpose |
| :--- | :--- | :--- | :--- |
| `--bg-app` | `#090d16` | `rgb(9, 13, 22)` | Root background for the entire application canvas. |
| `--bg-sidebar` | `#0d121f` | `rgb(13, 18, 31)` | Sidebar background offering subtle elevation from canvas. |
| `--bg-surface` | `#111726` | `rgb(17, 23, 38)` | Base surface for cards, tables, and content sections. |
| `--bg-surface-elevated`| `#172033` | `rgb(23, 32, 51)` | Elevated state for hovered cards and popover menus. |
| `--bg-surface-hover` | `#1e293b` | `rgb(30, 41, 59)` | Interactive list item hover background. |
| `--border-color` | `#1e293b` | `rgb(30, 41, 59)` | Standard border for cards, inputs, and section dividers. |
| `--border-subtle` | `#182234` | `rgb(24, 34, 52)` | Subtle nested borders within tables and card headers. |
| `--text-primary` | `#f8fafc` | `rgb(248, 250, 252)` | Primary headlines, metric values, and high-emphasis text. |
| `--text-secondary` | `#94a3b8` | `rgb(148, 163, 184)` | Secondary body copy, card descriptions, and labels. |
| `--text-muted` | `#64748b` | `rgb(100, 116, 139)` | Timestamps, table column headers, and helper hints. |

---

### 2.2 Semantic Severity & Status Tokens

```
┌──────────────┬───────────┬──────────────────────────┬────────────────────────┐
│ Severity     │ Hex Token │ Light Background Token   │ Use Case               │
├──────────────┼───────────┼──────────────────────────┼────────────────────────┤
│ CRITICAL     │ #ef4444   │ rgba(239, 68, 68, 0.12)  │ Direct revenue blocker │
│ HIGH         │ #f59e0b   │ rgba(245, 158, 11, 0.12) │ Potential lead leakage │
│ MEDIUM       │ #3b82f6   │ rgba(59, 130, 246, 0.12) │ Diagnostic warning     │
│ LOW / INFO   │ #64748b   │ rgba(100, 116, 139, 0.12)│ Best practice hygiene  │
│ SUCCESS      │ #10b981   │ rgba(16, 185, 129, 0.12) │ Healthy / Verified     │
│ PURPLE / AI  │ #8b5cf6   │ rgba(139, 92, 246, 0.12) │ Grounded AI & Pitches  │
└──────────────┴───────────┴──────────────────────────┴────────────────────────┘
```

---

### 2.3 Typography Scale

- **Font Family**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- **Code / Monospace**: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

| Token | Font Size | Line Height | Font Weight | Typical Usage |
| :--- | :--- | :--- | :--- | :--- |
| `text-display` | `2.25rem` (36px) | `1.2` | `700` (Bold) | Landing hero headline |
| `text-h1` | `1.75rem` (28px) | `1.25` | `700` (Bold) | Page titles (`Dashboard`, `Audit Dossier`) |
| `text-h2` | `1.25rem` (20px) | `1.3` | `600` (Semi-Bold) | Section headers & Card titles |
| `text-h3` | `1.05rem` (17px) | `1.4` | `600` (Semi-Bold) | Subsections & Finding titles |
| `text-base` | `0.9375rem` (15px)| `1.5` | `400` / `500` | Standard body copy & table cells |
| `text-sm` | `0.8125rem` (13px)| `1.4` | `400` / `500` | Secondary descriptions, labels |
| `text-xs` | `0.75rem` (12px) | `1.3` | `600` (Semi-Bold) | Badges, timestamps, status pills |
| `text-mono` | `0.8125rem` (13px)| `1.4` | `500` | URLs, API keys, code snippets, tokens |

---

### 2.4 Spacing, Radius, Elevation & Motion

```css
/* 4px Base Spacing Scale */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;

/* Border Radius Scale */
--radius-sm: 6px;    /* Input fields, small badges, action pills */
--radius-md: 10px;   /* Standard metric cards, finding cards */
--radius-lg: 14px;   /* Large containers, modals, report previews */
--radius-full: 9999px; /* Status dots, avatar circles */

/* Elevation Shadows */
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.35);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.45), 0 2px 4px -2px rgba(0, 0, 0, 0.35);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.55), 0 4px 6px -4px rgba(0, 0, 0, 0.45);

/* Motion Timing & Curves */
--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);
```

---

## 3. Reusable Component Taxonomy & Specifications

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     LEADGUARD COMPONENT ARCHITECTURE                        │
│                                                                             │
│  1. APP SHELL & LAYOUT                                                      │
│     ├── AppShell (Sticky Topbar + Fixed Collapsible Sidebar + Content View) │
│     ├── PageHeader (Breadcrumbs + Title + Subtitle + Action Bar)            │
│     └── SectionHeader (Section Title + Count Badge + Filter Tools)          │
│                                                                             │
│  2. DIAGNOSTIC & SCORE PRIMITIVES                                           │
│     ├── ScoreRing (SVG Radial Gauge with animated offset & score label)     │
│     ├── PillarScoreBar (Horizontal progress bar with category icon & delta) │
│     ├── MetricCard (KPI Value + Trend indicator + Confidence badge)         │
│     ├── FindingCard (Severity Pill + Deduct Pts + Recommendation + Evidence)│
│     └── EvidenceDrawer (Collapsible raw DOM snippet & HTTP header payload)  │
│                                                                             │
│  3. INTERACTIVE FORMS & ACTIONS                                             │
│     ├── Button (Primary, Secondary, Outline, Danger, Ghost, ExpressFix)     │
│     ├── Input (Floating Label + Icon Prefix + Inline Validation Message)    │
│     ├── SensitivitySlider (Interactive Traffic / Conv Rate ROI Slider)     │
│     └── FilterBar (Search input + Severity toggle chips + Category select) │
│                                                                             │
│  4. WATCHDOG & INCIDENT MONITORING                                          │
│     ├── IncidentTimeline (Chronological regression & resolution feed)       │
│     ├── BaselineDiffViewer (Side-by-side DOM node changes)                  │
│     └── StatusIndicator (Live pulsing green/red/amber heartbeat dot)        │
│                                                                             │
│  5. FEEDBACK & OVERLAYS                                                     │
│     ├── Modal (Accessible dialog with Escape dismiss & backdrop scrim)      │
│     ├── Toast (Auto-dismissing alert notifications: Success, Error, Info)  │
│     ├── SkeletonLoader (Animated pulsing bounds matching component layout)  │
│     └── ErrorBanner (Actionable alert with retry callback)                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Component Specifications (TypeScript Interfaces)

### 4.1 `ScoreRing` (Radial Health Gauge)
```typescript
interface ScoreRingProps {
  score: number; // 0 to 100
  size?: 'sm' | 'md' | 'lg' | 'hero'; // 64px, 96px, 140px, 180px
  showLabel?: boolean;
  label?: string;
  subtext?: string;
  animate?: boolean;
}
```
- **Visual Appearance**: Clean SVG ring. Ring stroke color dynamically interpolates:
  - `90–100`: `--success` (`#10b981`)
  - `70–89`: `--primary` (`#3b82f6`)
  - `50–69`: `--warning` (`#f59e0b`)
  - `< 50`: `--danger` (`#ef4444`)

---

### 4.2 `FindingCard` (Diagnostic Defect Display)
```typescript
interface FindingCardProps {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: 'LEAD_CAPTURE' | 'ADVERTISING' | 'SEO' | 'SECURITY';
  description: string;
  recommendation: string;
  scoreImpact: number; // e.g. 25
  evidence?: {
    element?: string;
    url?: string;
    receivedValue?: string;
    expectedPattern?: string;
    ruleId?: string;
  };
  onExpressFixClick?: () => void;
}
```
- **Structure**:
  1. Header: Severity badge + Category pill + Score impact deduction badge (`-25 pts`).
  2. Body: Plain-English problem title and impact explanation.
  3. Action Box: Code snippet recommendation with **"Copy Fix"** button and optional **"Order Express Fix"** button.
  4. Footer: Collapsible **"View Technical Evidence"** drawer displaying exact DOM tag or HTTP header.

---

### 4.3 `MetricCard` (Executive KPI Display)
```typescript
interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    value: string;
    isPositive: boolean;
  };
  confidence?: 'HIGH' | 'MEDIUM' | 'ESTIMATED';
  variant?: 'default' | 'primary' | 'danger' | 'success';
}
```

---

### 4.4 `SensitivitySlider` (Interactive Revenue Scenario Calculator)
```typescript
interface SensitivitySliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unitPrefix?: string; // e.g. "₹"
  unitSuffix?: string; // e.g. " / mo", " visitors"
  onChange: (value: number) => void;
}
```

---

## 5. Comprehensive State Matrix

Every view and component must implement all states in the matrix below:

| State | Visual Treatment | Interaction |
| :--- | :--- | :--- |
| **Loading** | Matching `SkeletonLoader` bounds with subtle opacity pulse (1.5s loop). | Inputs disabled; skeleton reflects exact dimensions of expected data. |
| **Success** | Clean data render with standard typography tokens. | Interactive buttons, expandable drawers, sortable headers. |
| **Empty State** | Centered icon + clear explanation + primary action button. | Click **"Run New Audit"** or **"Add Tracked Domain"**. |
| **Error State** | High-contrast `--danger` alert banner with retry button. | Click **"Retry Fetch"** or inspect network diagnostic hint. |
| **Partial Data** | Renders available cards while loading remaining sub-queries. | Allows user to interact with loaded sections immediately. |
| **Rate Limited** | Friendly card explaining limit cooldown with timer countdown. | Explains reason and offers account registration link. |
| **Offline / Network**| Top warning banner: *"Network connection lost. Retrying in 5s..."*. | Automatic exponential backoff polling. |

---

## 6. Standard Layout Grids & Responsive Container System

```css
/* Responsive Grid Utilities */
.grid4 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}

.grid3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.gridSplit {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-6);
}

/* Breakpoint Adjustments */
@media (max-width: 1024px) {
  .grid4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gridSplit { grid-template-columns: 1fr; }
}

@media (max-width: 768px) {
  .grid3 { grid-template-columns: 1fr; }
  .grid4 { grid-template-columns: 1fr; }
}

@media (max-width: 375px) {
  .pageContainer { padding: var(--space-3); }
  .grid4, .grid3, .gridSplit { gap: var(--space-3); }
}
```

---

## 7. Data Visualization Decision Matrix

| Data Type | Primary Visualization | Prohibited Visuals | User Question Answered |
| :--- | :--- | :--- | :--- |
| **Overall Health** | Circular `ScoreRing` (0–100) | ❌ Complex multi-line charts | *"Is my site healthy overall?"* |
| **Pillar Breakdown**| Horizontal `PillarScoreBar` | ❌ Pie / Donut charts | *"Which specific pillar needs attention?"* |
| **Opportunity Loss**| High-visibility `MetricCard` + Confidence badge | ❌ Vague percentage without currency | *"How much revenue is at risk?"* |
| **Watchdog Health** | Chronological `IncidentTimeline` | ❌ Cluttered heatmaps | *"When did the last regression occur?"* |
| **Defect Findings** | Ranked `FindingCard` list | ❌ Plain unformatted text dump | *"What exact code change fixes this?"* |
| **Competitor Gap** | Comparative horizontal bar table | ❌ 3D Radar charts | *"How does my site rank vs competitors?"* |

---

## 8. Accessibility Implementation Standards

1. **Focus States**: `:focus-visible` outlines must be `2px solid var(--primary)` with `2px` offset.
2. **Semantic Elements**: All data tables use standard `<table>`, `<thead>`, `<th>`, `<tbody>`, and `<td>` with `scope="col"`.
3. **Screen Reader Labels**: Icon-only buttons (e.g., Close modal, Copy snippet) MUST include an explicit `aria-label` or `<span className="sr-only">`.
4. **Color Independence**: Severity is conveyed through **Color + Text Badge + Icon/Deduction points** so color-blind users can distinguish findings easily.
