# Detection Intelligence P1 — Security Boundary Hardening + Detection Intelligence

Companion to `docs/DETECTION_INTEGRITY.md` (the P0 phase's technical reference). This document covers what changed in this phase: closing the browser SSRF/DNS-rebinding gap, hardening runtime tracking verification, and adding consent/CMP, structured-data, hreflang, and duplicate-content detection.

## 1. Browser security boundary

**Before this phase**: `renderedFetch.ts` validated the top-level navigation URL once via `validateExternalUrl`, then let Chromium connect directly — Chromium performs its own DNS resolution at connect time, independent of that validation, so a DNS answer that changed between validation and connection (rebinding) would bypass the check entirely. Worse: *no* subresource request (images, scripts, XHR/fetch calls the audited page's own JS makes, iframes) was validated at all — a malicious or compromised page could embed `<img src="http://169.254.169.254/...">` and Chromium would fetch it unconditionally. `pdfWorker.ts`'s `renderHtmlToPdf` had the same class of gap for one specific subresource: a customer's white-label logo URL, already validated once by `validateAndCheckSafeLogo`, but re-fetched independently (and unpinned) by Chromium when rendering the PDF.

**After this phase**: both Chromium launches (`renderedFetch.ts`, `pdfWorker.ts`) are pointed at a local forward proxy (`apps/worker/src/net/ssrfSafeProxy.ts`) via Playwright's `proxy` launch option. The proxy — plain Node `http`/`net`, no new dependency — owns every one of Chromium's outbound connections:

- **Plain HTTP**: the proxy receives the absolute-URI request, resolves the hostname itself, classifies every resolved address with the exact `isPrivateOrReservedHost` function every other fetcher in the codebase already uses, and only then opens its own connection to the validated address.
- **HTTPS (the common case)**: the proxy receives Chromium's `CONNECT host:port` request, resolves and validates `host` the same way, then opens a raw TCP socket to the *validated, pinned* address and splices it to the client socket. It never terminates or inspects TLS — Chromium performs the real end-to-end TLS handshake with the origin server through that tunnel, so certificate/SNI validation is completely unaffected. This is not a MITM proxy.

This closes the gap for **every** request the browser makes — the initial navigation, every subresource, and every redirect hop — because each one is a fresh request that must pass back through the proxy; there is no "already validated for this navigation" carve-out. It genuinely **pins** the destination (the proxy connects to the one address it just resolved and classified-safe, never re-resolving), not merely a pre-check.

## 2. SSRF / DNS rebinding coverage

Verified with 22 deterministic tests (`apps/worker/src/net/ssrfSafeProxy.test.ts`, no Docker/browser dependency, ~150ms total):

| Class | Covered |
|---|---|
| `localhost`, `127.0.0.1`, `0.0.0.0` | ✅ blocked |
| RFC1918 (`10.x`, `172.16-31.x`, `192.168.x`) | ✅ blocked, including the `172.16`/`172.31` range boundaries |
| Link-local / cloud metadata (`169.254.169.254`) | ✅ blocked |
| IPv6 loopback (`::1`), unique-local (`fc00::/7`), link-local (`fe80::/10`) | ✅ blocked |
| IPv4-mapped IPv6, dotted and metadata forms (`::ffff:127.0.0.1`, `::ffff:169.254.169.254`) | ✅ blocked (reuses the existing `unwrapIPv4MappedIPv6` unwrap in `url-security.ts`) |
| Hostname resolving to a private address (DNS-rebinding target) | ✅ blocked (deterministic `vi.mock('node:dns/promises')`, no real DNS dependency) |
| Hostname resolving to a public address | ✅ permitted (classification-only assertion — doesn't require real egress in a sandboxed test env) |
| Redirect to a blocked address | ✅ — proven structurally: every hop is an independent request through the same proxy, so a redirect target is validated exactly like any other request |
| Plain-HTTP absolute-URI path | ✅ separately tested from the CONNECT/HTTPS path |
| `ALLOW_LOCAL_FIXTURES` bypass parity with `url-security.ts` | ✅ — same condition (`NODE_ENV !== 'production' && ALLOW_LOCAL_FIXTURES === 'true'`), and separately proven to **never** apply when `NODE_ENV === 'production'` regardless of the flag |

**What is not claimed**: this does not add DNS-pinning to any *other* fetcher — `fetcher.ts`, `webhookWorker.ts`, `vaultRunner.ts` already had their own pinning via `pinned-fetch.ts` (verified unchanged, Phase 0 of this session traced all of them). Only the two Chromium launch sites needed this new mechanism, because Playwright has no equivalent of `http.request({lookup})`.

## 3. Runtime tracking model (audited, not rewritten)

Per instruction, the `FIRED`/`NOT_OBSERVED`/`NOT_VERIFIED` architecture (`packages/shared/src/network-evidence.ts`) was preserved exactly. Audit findings from re-verifying it against real Playwright integration tests:

- **GA4**: `gtag.js` script load vs. the `/g/collect` Measurement Protocol beacon were already correctly distinguished; regional endpoints (`region1.google-analytics.com` etc.) already matched via a hostname-suffix check, verified with a dedicated test.
- **Meta Pixel**: the `connect.facebook.net` library load vs. the actual `/tr` beacon were already correctly distinguished.
- **GTM**: the "container loaded ≠ every tag fired" limitation is preserved unchanged, per instruction — this is not overclaimed as event-level verification.
- **Fixed in this phase**: Meta Pixel's `relevantQueryParams` allowlist was empty (asymmetric with GA4's `tid`/`en`) — added `id` (pixel ID, already publicly visible in static HTML) and `ev` (event name label). Explicitly excludes anything under Meta's "Advanced Matching" scheme (`ud[em]`, `ud[ph]`, etc. — hashed customer PII) even though it's hashed before Meta receives it; a test (`never extracts Meta Pixel Advanced Matching params`) proves this exclusion holds.

**Observation window**: capture runs once per audit, during the existing single `page.goto(..., {waitUntil: 'networkidle'})` rendered-rescan pass. This means a real, honest limitation: a tracker that only fires on a later client-side (SPA) route change, or after a delayed/lazy `setTimeout`, can be missed. **Decision**: this was *not* extended with additional wait time. A real, measured baseline (5-run average, trivial fixture page) showed the proxy itself adds negligible overhead (~-7% to +7%, within noise — see §9), but adding a blanket extra wait (e.g. +1-2s) to catch delayed firing would multiply across every audit and was not justified by deterministic evidence of its benefit, per the explicit instruction not to slow the audit down without measuring the tradeoff. This blind spot is documented, not silently accepted — see §11.

## 4. Consent/CMP model

New scanner (`packages/shared/src/scanners/consent.ts`), following the exact registry-free, website-aggregated pattern `scanTracking` already uses (a banner often only renders once per session, so per-page absence isn't a reliable per-page signal — aggregated across all crawled pages instead, in `apps/worker/src/audit/detectionIntelligenceP1.ts`).

Detects:
- **10 named CMP vendors** by CDN hostname / global-object signature: OneTrust, Cookiebot, Osano, TrustArc, Iubenda, Didomi, Quantcast Choice, CookieYes, Complianz, Termly.
- **Generic IAB TCF API** (`__tcfapi(`) presence — a vendor-agnostic fallback for any CMP implementing the industry standard.
- **Generic banner heuristic** (lowest confidence) — cookie-consent-shaped class/id names and "accept all cookies"/"manage cookie preferences" text, only used when no named vendor or TCF signal matched.
- **Google Consent Mode v2**: both `gtag('consent','default',...)` and `gtag('consent','update',...)` calls, plus best-effort regex extraction of declared default values for `ad_storage`/`analytics_storage`/`ad_user_data`/`ad_personalization` — a category is left `undefined` (never guessed) if its value can't be extracted with confidence.

**What LeadGuard reports**: "Observed consent implementation signals" (a `cmpVendor`, a `consentModeDetected` boolean, category defaults where extractable). LeadGuard **never** reports "GDPR compliant" or any other compliance verdict — the `NO_CONSENT_MECHANISM_DETECTED` finding's own description explicitly says so: *"This is an observed implementation signal, not a legal compliance determination."*

## 5. Consent + tracking correlation

The highest-value new capability, per instruction. The key insight that makes it possible without simulating a consent-banner click: **LeadGuard's headless browser never interacts with the page at all** (no clicks, no form fills, nothing) during the capture window. That means *any* tracking request observed firing during that window necessarily fired without an explicit user consent action having occurred — this is a directly observable fact, not an inference requiring the scan to simulate accepting/rejecting consent.

So: when a CMP is detected (any confidence tier) **and** a provider's `trackingRuntime` status is `FIRED`, LeadGuard emits `TRACKER_FIRED_BEFORE_CONSENT_<PROVIDER>` (LG-043, MEDIUM severity) with the wording *"...meaning the tracker fired without the visitor granting consent first"* — a factual, evidence-cited claim.

Evidence-confidence model, exactly as specified:
- **`FIRED` + CMP present → finding emitted**, tagged `metadata.confidence: 'OBSERVED'`.
- **`NOT_OBSERVED` (capture ran, nothing matched) → no finding.** Correctly not a problem — no tracker fired at all, gated or otherwise.
- **`NOT_VERIFIED` or `trackingRuntime` altogether unavailable (rescan disabled/failed) → no finding.** This is the `UNKNOWN` state, and per instruction it is never escalated to a failure — verified by a dedicated test (`never turns UNKNOWN into a finding when trackingRuntime is unavailable`).

No inference is drawn from the mere *absence* of a visible consent mechanism about whether tracking is unlawful — the correlation finding only fires on the conjunction of an actually-detected CMP and an actually-observed firing event, both concrete facts.

## 6. Structured-data detection

`packages/shared/src/scanners/structured-data.ts` + `structured-data-page.ts`, registered as a normal PAGE-scope scanner (`registry.ts`, `LG-040`) — same architecture as every other page scanner, no new registration mechanism.

- **JSON-LD**: every `<script type="application/ld+json">` block is parsed; `@type` (including `@graph` arrays and array-valued `@type`) is extracted. A block that fails `JSON.parse` is flagged (`STRUCTURED_DATA_MALFORMED`) with the actual parse error, not a guess.
- **Duplicate blocks**: an `@type` appearing in more than one valid block on the *same page* is flagged (`STRUCTURED_DATA_DUPLICATE_TYPE`) — a deterministic count, not a judgment about correctness.
- **Microdata / RDFa**: presence-only checks (`itemscope`+`itemtype`, `typeof`+`vocab`) — reported in scanner metrics, not turned into findings, since presence alone isn't a problem to report.
- **Explicitly not built**: a Google Rich Results validator, or any judgment about whether a schema is "complete enough" for a given rich-result type. Only deterministic problems (a parse failure, a same-page duplicate) become findings.

## 7. Hreflang detection

`packages/shared/src/scanners/hreflang.ts` + `hreflang-page.ts` (PAGE-scope, `LG-041`, registry-registered) for page-local checks, plus `evaluateHreflangReciprocity` (`apps/worker/src/audit/detectionIntelligenceP1.ts`) for the cross-page check that needs the full crawled page set:

- **Malformed language-region values** (`HREFLANG_MALFORMED`): a `hreflang` value that doesn't match `^(x-default|[a-z]{2,3}(-[A-Z]{2})?)$`.
- **Duplicate/conflicting declarations** (`HREFLANG_CONFLICTING`): the same lang value pointing at two different hrefs on one page — the identical-lang-identical-href case (redundant markup, not a conflict) is explicitly not flagged.
- **Canonical/hreflang self-reference conflict** (`HREFLANG_CANONICAL_CONFLICT`): a page declares an hreflang entry pointing at itself, but its own canonical tag points elsewhere — a direct, page-local contradiction.
- **Reciprocity** (`HREFLANG_MISSING_RECIPROCAL`, website-scope): page A declares an hreflang pointing at page B, but B (when B was itself crawled) doesn't declare one back to A. A target that wasn't crawled at all is **not** flagged — unknown, not assumed broken.

## 8. Duplicate-content model

`apps/worker/src/audit/duplicateContent.ts` (worker-side — needs the full page set, unlike the browser-safe per-page scanners above).

- **Normalization**: strip `<script>`/`<style>`/HTML comments/all tags/common entities, collapse whitespace, lowercase. Deliberately *not* a full boilerplate-removal pipeline (nav/header/footer aren't specially stripped) — an explicit, documented tradeoff favoring zero false positives over full recall.
- **Fingerprint**: a fast, non-cryptographic djb2 hash of the normalized text.
- **Threshold**: **exact match only**, not a fuzzy similarity score. This was a deliberate choice: an exact match after documented normalization is fully explainable per finding ("these N pages produce identical visible text"); a similarity-percentage approach would need to justify a threshold number that's inherently harder to defend as non-arbitrary.
- **Exemptions**: (1) a page declaring `rel=next`/`rel=prev` is excluded from grouping entirely (pagination is expected to share template/structure by design); (2) a group where every member declares a canonical and all canonicals agree on one single target is dropped — that's the site correctly consolidating duplicates, not a problem.
- **Not implemented**: cross-audit or cross-domain duplicate detection (only within one audit's crawled page set), and no shingling/SimHash-style near-duplicate detection.

## 9. Evidence / confidence semantics

Every new finding follows the pre-existing `StructuredFindingEvidence` contract (`source`, `observed`, `location`, `why`, `recommendation`) — no new evidence shape was invented. Confidence is expressed via the pre-existing `TrackingRuntimeStatus` (`FIRED`/`NOT_OBSERVED`/`NOT_VERIFIED`) for runtime tracking claims, and via an explicit `metadata.confidence: 'OBSERVED'` tag on the consent-correlation findings specifically (the only new findings that make a claim about a *temporal relationship* between two independently-observed facts, which is exactly the kind of claim the task's evidence model asks to be confidence-tagged). No finding in this phase asserts a compliance verdict, a guaranteed-broken determination from silence, or a fabricated revenue number.

## 10. Performance measurement

Real, measured (not assumed) — see also §8 of this doc's companion report:

| Scenario | Avg (5 runs) | Samples |
|---|---|---|
| Rendered-fetch WITHOUT SsrfSafeProxy (baseline) | 1266ms | 1665, 1309, 1159, 1070, 1127 |
| Rendered-fetch WITH SsrfSafeProxy | 1183ms | 1189, 1321, 1137, 1159, 1107 |

The proxy measured *faster* on average in this sample — the true effect is within measurement noise (±150ms on a ~1.2s baseline), i.e. **no meaningful regression**. Robots.txt/sitemap discovery (§ below) adds one additional pinned-fetch call (~tens of ms for a same-origin `/robots.txt`, non-fatal and fast-failing when absent, which is the common case) before the crawl starts; the sitemap-supplement step is capped at 5 additional pages and only runs when the page budget wasn't already exhausted by the normal crawl.

## 11. Security limitations / known false-positive / false-negative boundaries

**Security:**
- The proxy protects Chromium's *own* connections. It does not, and cannot, retroactively harden the plain-fetch crawler's existing pinning (already correct, verified unchanged) or any other part of the system.
- DNS-rebinding protection is real pinning (not a pre-check with a re-resolve gap), but a resolver that returns a *different safe-but-still-internal-to-LeadGuard's-own-infrastructure* address on every single call (a much narrower, LeadGuard-infrastructure-aware attack) is not something IP-classification alone can ever fully rule out — this is a structural limitation of any purely address-classification-based defense, not specific to this implementation.

**Tracking (false positives/negatives):**
- False negative: server-side/first-party-proxied analytics (e.g. GTM Server-Side routed through the customer's own subdomain) will not match the known public hostnames and won't be observed — documented, not solvable without a customer-specific configuration LeadGuard doesn't have.
- False negative: SPA route-change-triggered tracking (see §3's observation-window discussion) can be missed if it never fires during the initial capture window.
- The capture reflects a *clean* headless browser with no ad-blocker or extensions — a finding means "no technical/consent block from the site's own configuration," not "guaranteed to fire for every real visitor regardless of their own browser setup."

**Consent:**
- A site using an unrecognized, custom-built consent solution (no named vendor, no TCF API, no matching generic-banner text) will show `cmpDetected: false` even if it has a working custom mechanism — a false negative inherent to signature-based detection.
- The correlation finding can only observe what happens during LeadGuard's own single page visit — it cannot detect a tracker that fires only on a *second* visit after a consent cookie is already set (a common "don't show the tracker to a first-time visitor who hasn't decided yet" pattern would actually read as compliant here, correctly).

**SEO (structured data / hreflang / duplicate content):**
- Structured-data detection is intentionally not a full Rich Results validator — a JSON-LD block can be syntactically valid JSON but semantically incomplete for a specific rich-result type, and that is never flagged.
- Duplicate-content detection's exact-match strategy will miss near-duplicates that differ by even a sentence — an intentional false-negative bias favoring zero false positives (see §8).
- Hreflang reciprocity can only be checked between pages LeadGuard actually crawled — a hreflang target outside the crawl's page/depth budget is neither confirmed nor denied.
