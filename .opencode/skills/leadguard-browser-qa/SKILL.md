---
name: leadguard-browser-qa
description: Mandatory browser-based verification protocols for frontend and full-stack modifications. Use whenever verifying UI changes, responsive behavior, or live user flows.
---

# LeadGuard OS V6 — Browser QA & Live Verification Protocol

Source code inspections and unit tests alone are insufficient to guarantee UI/UX fidelity. All visual, interactive, and client-side changes must be validated against the real, live rendered application.

## Mandatory Verification Workflow

When modifying or introducing UI views:

1. **Launch Live Environments**:
   - Ensure backend API (`http://localhost:4000`) and frontend Vite dev server (`http://localhost:5173`) are actively running.
2. **Execute In-Browser Verification**:
   - Use available browser automation tools (Antigravity `browser_subagent`, Playwright, or Chrome DevTools MCP) to navigate to the target route.
   - Do NOT just assume a component renders properly because TypeScript compiled without errors.

3. **Core Inspection Vectors**:
   - **Console Health**: Zero unhandled JavaScript errors, uncaught promise rejections, React hydration mismatches, or missing key warnings in browser developer console.
   - **Network Activity**: Inspect XHR/fetch requests; verify correct request bodies, headers, auth tokens, and status codes (no unexpected 404s, 401s, 500s, or slow waterfall cascades).
   - **Visual Layout & Alignment**: Verify spacing, typography rendering, element alignment, flexbox/grid wrapping, and color contrast.
   - **Interactive Elements**: Verify click handlers, modal openings, tab switches, form inputs, validation triggers, dropdowns, and button disabled states.
   - **Viewport & Responsive Testing**: Test rendered output at multiple viewport widths (Mobile: 375px–414px, Tablet: 768px, Desktop: 1280px–1920px).
   - **Loading & Dynamic States**: Verify skeleton loaders during data fetch, empty states when collections are empty, and error banners on server fault injection.
   - **Route Navigation & Transitions**: Verify clean navigation between routes (e.g. `/`, `/scan/:id`, `/dashboard`, `/audits`, `/agency`, `/billing`) with appropriate URL updates and browser history preservation.

---

## Artifact Recording Requirement

Whenever performing major UI verification:
- Capture screenshots or recordings of the final rendered state.
- Document any console/network warnings and confirm resolution before marking tasks complete.
