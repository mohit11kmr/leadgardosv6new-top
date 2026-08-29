# LeadGuard OS V6 — UI/UX Tooling & Agent Workspace Guide

**Phase**: Phase 0 — Tooling & Workspace Setup Only  
**Purpose**: Document MCP configuration, agent capabilities, project skills, and collaborative agent workflows for LeadGuard OS V6.

---

## 1. MCP Availability & Configuration Matrix

| MCP Capability | Status | Configuration Location | Purpose | Manual User Action Required |
| :--- | :--- | :--- | :--- | :--- |
| **Playwright MCP** | **ALREADY CONFIGURED** | `.agents/mcp_config.json`, `.opencode/mcp_config.json`, `mcp_config.json` | Real browser navigation, element interaction, form submission, responsive testing, screenshots, and visual regression verification. | None for standard headless execution. If running headed mode under custom display, set `DISPLAY` env. |
| **Chrome DevTools MCP** | **ALREADY CONFIGURED** | Built-in plugin (`chrome-devtools-plugin`) & `mcp_config.json` | Console log analysis, network inspection, runtime error diagnosis, performance profiling, and accessibility auditing. | For connecting to an existing browser instance: launch Chrome with `--remote-debugging-port=9222`. |
| **Storybook MCP** | **NOT AVAILABLE / NEEDS CONFIGURATION** | N/A | Component visual catalog, isolation testing, and documentation. | **Requires Manual Decision**: Storybook is not installed in `apps/web`. Adding Storybook requires introducing storybook dependencies to `package.json`. In Phase 0, dependencies are frozen. |
| **shadcn MCP** | **NOT APPLICABLE / NOT CONFIGURED** | N/A | Reference UI primitives. | **Not Configured by Design**: LeadGuard OS V6 uses custom Vanilla CSS design tokens (`styles.css`) and bespoke React 19 primitives, not Tailwind/shadcn. Replacing the component system is explicitly prohibited. |

---

## 2. Project-Local Agent Skills

The following 7 specialized skills have been created in both `.agents/skills/` (Antigravity/Gemini) and `.opencode/skills/` (OpenCode/Nemotron):

| Skill Name | Core Directive | Actionable Scope |
| :--- | :--- | :--- |
| **`leadguard-product`** | Protect product identity & value pillars | Enforces LeadGuard as a Website Diagnostic + Lead Leakage Detection + Revenue Intelligence + Continuous Watchdog + Agency Platform. Prevents reducing it to a generic SEO checker or generic SaaS template. |
| **`leadguard-api-contract`** | Strict API-first binding | Mandates inspecting real backend endpoints, request schemas, response DTOs, authentication, and error states before authoring UI. Prohibits fake API payloads. |
| **`leadguard-ui-system`** | Consistent dark-mode design system | Defines standards for typography, spacing, semantic badges, severity tiers, metric displays, modal dialogs, states, and responsive fluid layout. Preserves existing components. |
| **`leadguard-ux-review`** | Decision-driven evaluation | Requires answering *"What decision should the user be able to make from this screen?"* Evaluates hierarchy, discoverability, cognitive load, CTAs, trust, and states. |
| **`leadguard-browser-qa`** | Mandatory live rendered verification | Enforces in-browser validation of console errors, network requests, interactive state, viewport responsiveness, and route transitions using real browser tooling. |
| **`leadguard-no-fake-data`** | Zero fabricated metrics policy | Strictly prohibits invented customer counts, fabricated revenue recovery figures, fake testimonials, and mock findings. Mandates verified data or labeled fixtures. |
| **`leadguard-backend-first-ui`** | 8-Step UI construction protocol | Mandates backend inspection -> API & DTO validation -> permission review -> state handling -> user decision planning -> component authoring -> live browser QA. |

---

## 3. Agent Role Separation & Workflow Architecture

To maintain high technical rigor, codebase consistency, and independent quality gates, development tasks are partitioned across three specialized roles:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           1. ANTIGRAVITY + GEMINI                           │
│  - Primary: Browser-driven UI development & visual inspection               │
│  - Frontend component implementation & responsive tuning                    │
│  - Live in-browser verification & screenshot inspection                     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           2. OPENCODE + NEMOTRON                            │
│  - Primary: Repository audit & architectural boundary enforcement           │
│  - API contract & DTO integrity review                                      │
│  - Code review, type-safety validation, regression & diff analysis          │
│  - Independent second opinion before merge                                  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                 3. VS CODE                                  │
│  - Primary: Manual developer inspection & final review                      │
│  - Terminal execution, Git commit/push control                              │
│  - Direct interactive debugging & developer authority                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Detailed Agent Responsibilities

### A. ANTIGRAVITY + GEMINI
- **Focus Area**: Real rendered application and interactive UI development.
- **Tools**: `browser_subagent`, Playwright MCP, Chrome DevTools MCP, React 19 / Vite workspace.
- **Workflow**:
  1. Spawns frontend & backend local servers.
  2. Implements UI views adhering to `leadguard-ui-system` and `leadguard-backend-first-ui`.
  3. Uses browser subagents to click, navigate, fill forms, and record visual evidence.
  4. Verifies zero console errors and clean network requests.

### B. OPENCODE + NEMOTRON
- **Focus Area**: Code quality, architectural integrity, and contract verification.
- **Tools**: Git diff analysis, TypeScript typechecking, Vitest test suite, architecture boundary tests (`tests/architecture.test.ts`).
- **Workflow**:
  1. Inspects API contract alignment between frontend and backend.
  2. Validates that no backend code is leaked into frontend packages or vice versa.
  3. Verifies zero fake data policy compliance (`leadguard-no-fake-data`).
  4. Delivers architectural critique and regression analysis.

### C. VS CODE (Human Developer Control Center)
- **Focus Area**: Final review, manual verification, and source control.
- **Tools**: VS Code editor, Git integration, integrated terminal, debugger.
- **Workflow**:
  1. Reviews generated diffs and test results.
  2. Executes final commit, branch management, and deployment commands.

---

## 4. Commands to Launch & Verify the Environment

### 1. Launch All Services Concurrently
```bash
npm run dev
```
*(Starts `@leadguard/api` on port `4000`, `@leadguard/web` on port `5173`, and `@leadguard/worker`)*

### 2. Run TypeScript Typechecking Across Workspaces
```bash
npm run typecheck
```

### 3. Run Unit and Scoring Tests
```bash
npx vitest run tests/scoring.test.ts
```

### 4. Run End-to-End Browser Tests (Playwright)
```bash
npm run e2e
```

### 5. Build Production Frontend Bundle
```bash
npm run build --workspace @leadguard/web
```
