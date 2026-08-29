# LeadGuard OS V6 — Final Master Design System Specification (Phase 2C)

**Document Version**: 6.0.0-final-design-system  
**Date**: 2026-08-30  
**Status**: Authoritative Design System Specification (Locked for Phase 3 Implementation)  
**Supersedes**: `PHASE_2A_DESIGN_SYSTEM.md` (Updated & Corrected via `PHASE_2B_RED_TEAM_REVIEW.md`)  
**Base Commit Verified**: `1cc0d8c3f4a1c0133825de88c013a1298ef4ea14`

---

## 1. Aesthetic Identity & Core Design Principles

LeadGuard OS V6 is an **authoritative, high-density, mission-critical operational revenue platform**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEADGUARD DESIGN PRINCIPLES                         │
│                                                                             │
│  1. CALM & AUTHORITATIVE: Deep slate/navy dark mode that prevents fatigue  │
│  2. HIGH DENSITY & SCANNABLE: Clear typography hierarchy with zero fluff    │
│  3. VERIFIED ACCESSIBILITY: Every text token strictly passes WCAG AA (4.5:1)│
│  4. EVIDENCE-GROUNDED: Color highlights indicate real diagnostic findings    │
│  5. RESPONSIVE RESILIENCE: Flawless layout adaptation from 375px to 4K      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Verified Color Tokens & Accessibility Contrast Calculations

### 2.1 Surface & Canvas Hierarchy

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

---

### 2.2 Text Color Tokens with Verified WCAG Contrast Measurements

| Token Name | Hex Value | Target Surface | Verified Contrast | WCAG AA Status | Permitted Usage |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `--text-primary` | `#f8fafc` | `#090d16` (Canvas)<br>`#111726` (Surface) | **18.57:1**<br>**17.09:1** | ✅ **PASS (AAA)** | Primary headlines, scores, high-emphasis text. |
| `--text-secondary` | `#94a3b8` | `#111726` (Surface) | **6.97:1** | ✅ **PASS (AA)** | Standard body copy, card descriptions, labels. |
| `--text-muted` | `#94a3b8` | `#111726` (Surface) | **6.97:1** | ✅ **PASS (AA)** | Secondary text, timestamps, table cells. |
| `--text-subtle` | `#64748b` | `#111726` (Surface) | **3.76:1** | ⚠️ **NON-TEXT ONLY**| Card borders, decorative icons, non-text hints. |
| `--purple-text` | `#a78bfa` | `#111726` (Surface) | **7.08:1** | ✅ **PASS (AA)** | Agency and AI text labels. |

---

### 2.3 Semantic Severity & Status Tokens

```css
/* Semantic Severity Colors */
--severity-critical: #ef4444;       /* Contrast: 4.85:1 on #111726 */
--severity-critical-bg: rgba(239, 68, 68, 0.12);

--severity-high: #f59e0b;           /* Contrast: 8.12:1 on #111726 */
--severity-high-bg: rgba(245, 158, 11, 0.12);

--severity-medium: #3b82f6;         /* Contrast: 4.95:1 on #111726 */
--severity-medium-bg: rgba(59, 130, 246, 0.12);

--severity-low: #94a3b8;            /* Contrast: 6.97:1 on #111726 */
--severity-low-bg: rgba(148, 163, 184, 0.12);

--status-success: #10b981;          /* Contrast: 7.23:1 on #111726 */
--status-success-bg: rgba(16, 185, 129, 0.12);
```

---

### 2.4 Typography Scale

- **Font Family**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- **Code / Monospace**: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

| Token | Size | Line Height | Weight | Typical Usage |
| :--- | :--- | :--- | :--- | :--- |
| `text-display` | `2.25rem` (36px) | `1.2` | `700` | Landing hero headline |
| `text-h1` | `1.75rem` (28px) | `1.25` | `700` | Page titles (`Dashboard`, `Audit Dossier`) |
| `text-h2` | `1.25rem` (20px) | `1.3` | `600` | Section headers & Card titles |
| `text-h3` | `1.05rem` (17px) | `1.4` | `600` | Subsections & Finding titles |
| `text-base` | `0.9375rem` (15px)| `1.5` | `400` / `500` | Standard body copy & table cells |
| `text-sm` | `0.8125rem` (13px)| `1.4` | `400` / `500` | Secondary descriptions, labels |
| `text-xs` | `0.75rem` (12px) | `1.3` | `600` | Badges, timestamps, status pills |
| `text-mono` | `0.8125rem` (13px)| `1.4` | `500` | URLs, API keys, code snippets |

---

### 2.5 Spacing, Radius, Elevation & Motion

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
--radius-sm: 6px;    /* Inputs, small badges, action pills */
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

## 3. Reusable Component Taxonomy & TypeScript Interfaces

### 3.1 `ScoreRing` (Radial Health Gauge)
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
- **Stroke Color Logic**:
  - `90–100`: `--status-success` (`#10b981`)
  - `70–89`: `--severity-medium` (`#3b82f6`)
  - `50–69`: `--severity-high` (`#f59e0b`)
  - `< 50`: `--severity-critical` (`#ef4444`)

---

### 3.2 `FindingCard` (Diagnostic Defect Display)
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

---

### 3.3 `MetricCard` (Executive KPI Display)
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

### 3.4 `SensitivitySlider` (Interactive Revenue Scenario Calculator)
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

## 4. Comprehensive State Matrix

Every component and view strictly implements 8 states:

| State | Visual Treatment | Interaction |
| :--- | :--- | :--- |
| **Loading** | Matching `SkeletonLoader` bounds with subtle opacity pulse (1.5s loop). | Inputs disabled; skeleton reflects exact layout dimensions. |
| **Success** | Clean data render with standard typography tokens. | Interactive buttons, expandable drawers, sortable headers. |
| **Empty State** | Centered icon + clear explanation + primary action button. | Click **"Run New Audit"** or **"Add Tracked Domain"**. |
| **Error State** | High-contrast `--severity-critical` alert banner with retry button. | Click **"Retry Fetch"** or inspect diagnostic hint. |
| **Partial Data** | Renders available cards while loading remaining sub-queries. | Allows user to interact with loaded sections immediately. |
| **Rate Limited** | Friendly card explaining limit cooldown with timer countdown. | Explains reason and offers account registration link. |
| **Offline / Network**| Top warning banner: *"Network connection lost. Retrying..."*. | Automatic exponential backoff polling. |
| **Completed w/ Limits**| Warning badge on scan result: *"Partial crawl completed"*. | Explains firewall or timeout constraints transparently. |

---

## 5. Layout Grids & Responsive Breakpoints

```css
/* Responsive Grid System */
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

/* Breakpoint Rules */
@media (max-width: 1024px) {
  .grid4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gridSplit { grid-template-columns: 1fr; }
}

@media (max-width: 768px) {
  .grid3 { grid-template-columns: 1fr; }
  .grid4 { grid-template-columns: 1fr; }
}

@media (max-width: 480px) {
  .pageContainer { padding: var(--space-3); }
  .grid4, .grid3, .gridSplit { gap: var(--space-3); }
  .pricingGrid { grid-template-columns: 1fr; }
}
```

---

## 6. Data Visualization Decision Matrix

| Data Type | Primary Visualization | Prohibited Visuals | User Question Answered |
| :--- | :--- | :--- | :--- |
| **Overall Health** | Circular `ScoreRing` (0–100) | ❌ Complex multi-line charts | *"Is my site healthy overall?"* |
| **Pillar Breakdown**| Horizontal `PillarScoreBar` | ❌ Pie / Donut charts | *"Which specific pillar needs attention?"* |
| **Opportunity Loss**| High-visibility `MetricCard` + Confidence badge | ❌ Vague percentage without currency | *"How much revenue is at risk?"* |
| **Watchdog Health** | Chronological `IncidentTimeline` | ❌ Cluttered heatmaps | *"When did the last regression occur?"* |
| **Defect Findings** | Ranked `FindingCard` list | ❌ Plain unformatted text dump | *"What exact code change fixes this?"* |

---

## 7. Accessibility Gates & CI Verification Rules

1. **Focus Rings**: All interactive controls MUST show `:focus-visible` with `2px solid var(--severity-medium)` and `2px` offset.
2. **Accessible Labels**: Form inputs MUST use explicit `<label htmlFor="...">` bindings.
3. **Automated Contrast Gate**: No text element with contrast `< 4.5:1` against its background surface may be merged into production.
4. **Touch Target Size**: Minimum 44px × 44px clickable area on mobile screens.
