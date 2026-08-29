---
name: leadguard-ux-review
description: Comprehensive heuristic review checklist for LeadGuard screens and flows. Use when auditing, refactoring, or approving UI layouts.
---

# LeadGuard OS V6 — UX Review & Decision-Driven Evaluation

Every major screen, view, and user flow in LeadGuard OS V6 must be evaluated against heuristic principles centered on operational clarity and actionable intelligence.

## The Cardinal UX Question

> **"What decision should the user be able to make from this screen?"**

If a screen or component only presents passive metrics without answering what action or business decision the user should take, the UX design is incomplete.

---

## Screen Evaluation Checklist

1. **User Goal & Intent**:
   - What primary problem is the user solving (e.g., assessing site leakage, resolving a critical form bug, generating an agency audit report, buying express remediation)?
   - Is the primary task achievable within minimum clicks and without cognitive friction?

2. **Information Hierarchy**:
   - Are the most critical metrics (health score, leaked revenue estimate, critical blockers) placed prominently at the top?
   - Is progressive disclosure used effectively (overview first, expandable raw technical evidence on demand)?

3. **Discoverability & Visual Scannability**:
   - Can a user scan the screen in 5 seconds and understand the current system status?
   - Are visual weights proportional to severity (e.g., critical failures pop immediately)?

4. **Cognitive Load & Data Density**:
   - Avoid metric sprawl. Group related data points logically (e.g., Forms & Capture, Security & DNS, Tracking & Analytics, Revenue & Performance).

5. **CTA Clarity & Actionability**:
   - Is there a single primary call-to-action per view?
   - Are button labels descriptive of the outcome (e.g., "Run Deep Audit", "Order Express Fix", "Download Branded PDF") rather than vague ("Submit", "Click Here")?

6. **Trust & Evidence Transparency**:
   - Does every reported finding link to concrete technical evidence (URL, payload, HTTP status code, console trace, response latency)?
   - Are financial calculations explainable?

7. **System Feedback & Transitions**:
   - Does the UI acknowledge asynchronous processes (e.g., crawling progress bars, audit queue statuses) with real-time feedback?

8. **State Completeness**:
   - **Loading State**: Are meaningful skeletons displayed without layout shifts?
   - **Empty State**: Is the user guided to populate data with a clear call-to-action?
   - **Error State**: Can the user recover or retry without losing entered state?
   - **Permission State**: Are restricted features gracefully communicated based on role/tier?

9. **Mobile & Viewport Responsiveness**:
   - Does the screen remain fully navigable, readable, and functional on phone (375px+), tablet (768px+), and desktop (1280px+) screens?

10. **Accessibility & Usability**:
    - Adequate color contrast ratios (WCAG AA standard).
    - Visible keyboard focus indicators and logical tab traversal.
    - Semantic HTML elements with appropriate ARIA attributes.
