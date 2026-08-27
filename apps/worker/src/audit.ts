import { db } from '@leadguard/database';
import {
  buildBusinessImpact,
  buildExecutiveSummary,
  calculateScores,
  inspectTls,
  scanFormsAndCtas,
  scanMixedContent,
  scanOpenGraph,
  scanSecurityHeaders,
  scanSeo,
  scanTelephone,
  scanTracking,
  scanWhatsApp,
  validateExternalUrl,
  type Finding,
  type PageRecord,
} from '@leadguard/shared';

const MAX_RESPONSE_BYTES = 2_000_000; // 2MB memory bound

export function classifyError(error: unknown): string {
  if (!(error instanceof Error)) return 'UNKNOWN_ERROR';
  const msg = error.message.toUpperCase();
  if (msg.includes('SSRF') || msg.includes('PRIVATE')) return 'SSRF_BLOCKED';
  if (msg.includes('REDIRECT')) return 'REDIRECT_ERROR';
  if (msg.includes('TIMEOUT') || error.name === 'AbortError') return 'TIMEOUT';
  if (msg.includes('CONTENT_TOO_LARGE') || msg.includes('TOO LARGE')) return 'CONTENT_TOO_LARGE';
  if (msg.includes('UNSUPPORTED_CONTENT')) return 'UNSUPPORTED_CONTENT';
  if (msg.includes('TLS') || msg.includes('CERT')) return 'TLS_ERROR';
  if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN') || msg.includes('DNS')) return 'DNS_ERROR';
  if (msg.includes('HTTP_ERROR') || msg.includes('STATUS')) return 'HTTP_ERROR';
  return 'SCANNER_ERROR';
}

export async function fetchBoundedText(response: Response, maxBytes = MAX_RESPONSE_BYTES): Promise<string> {
  if (!response.body) {
    return '';
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let receivedBytes = 0;
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      receivedBytes += value.length;
      if (receivedBytes > maxBytes) {
        await reader.cancel();
        throw new Error('CONTENT_TOO_LARGE');
      }
      result += decoder.decode(value, { stream: true });
    }
  }
  result += decoder.decode();
  return result;
}

export async function fetchPage(
  rawUrl: string,
  signal: AbortSignal,
  depth = 0,
  parentUrl?: string
): Promise<PageRecord> {
  const started = Date.now();
  let current = await validateExternalUrl(rawUrl);
  const redirectChain: string[] = [];

  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(current, {
      signal,
      redirect: 'manual',
      headers: {
        'user-agent': 'LeadGuardBot/2.0 (+https://leadguard.local)',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    // Handle redirects manually to validate each hop against SSRF and downgrade
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirect === 3) throw new Error('REDIRECT_ERROR');

      const destination = await validateExternalUrl(new URL(location, current).toString());
      if (current.protocol === 'https:' && destination.protocol !== 'https:') {
        throw new Error('REDIRECT_ERROR: HTTPS downgrade prohibited');
      }
      redirectChain.push(destination.toString());
      current = destination;
      continue;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
      throw new Error('UNSUPPORTED_CONTENT');
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new Error('CONTENT_TOO_LARGE');
    }

    const html = await fetchBoundedText(response, MAX_RESPONSE_BYTES);
    const headers = Object.fromEntries(response.headers.entries());
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? undefined;

    return {
      url: rawUrl,
      finalUrl: current.toString(),
      statusCode: response.status,
      title,
      contentType,
      headers,
      htmlAvailable: true,
      responseTimeMs: Date.now() - started,
      depth,
      parentUrl,
      redirectChain,
      html,
    };
  }

  throw new Error('REDIRECT_ERROR');
}

export function discoverLinks(page: PageRecord, origin: string): string[] {
  const links = [...page.html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

  return [
    ...new Set(
      links
        .map((value) => {
          try {
            const url = new URL(value, page.finalUrl);
            url.hash = '';
            if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) return null;
            return url.toString().replace(/\/$/, '');
          } catch {
            return null;
          }
        })
        .filter((value): value is string => Boolean(value))
    ),
  ];
}

export function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const deduplicated: Finding[] = [];

  for (const finding of findings) {
    const key = `${finding.ruleId}|${finding.scope}|${finding.affectedUrl ?? ''}|${finding.internalKey ?? finding.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(finding);
    }
  }

  return deduplicated;
}

export async function scanPage(page: PageRecord): Promise<Finding[]> {
  const findings: Finding[] = [];

  // 1. WhatsApp scanner (page-level)
  const waResult = scanWhatsApp(page);
  findings.push(...waResult.findings);

  // 2. Telephone scanner (page-level)
  const telResult = scanTelephone(page);
  findings.push(...telResult.findings);

  // 3. SEO scanner (noindex & canonical) (page-level)
  const seoResult = scanSeo(page);
  findings.push(...seoResult.findings);

  // 4. OpenGraph scanner (page-level)
  const ogResult = scanOpenGraph(page);
  findings.push(...ogResult.findings);

  // 5. Mixed Content scanner (page-level)
  const mixedResult = scanMixedContent(page);
  findings.push(...mixedResult.findings);

  return findings;
}

export async function processAudit(auditId: string, signal: AbortSignal) {
  const started = Date.now();

  const audit = await db.audit.findUniqueOrThrow({
    where: { id: auditId },
    include: { website: true },
  });

  // 1. Create an AuditRun record tracking this execution run
  const run = await db.auditRun.create({
    data: {
      auditId,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  await db.audit.update({
    where: { id: auditId },
    data: {
      status: 'RUNNING',
      startedAt: audit.startedAt ?? new Date(),
      progressStage: 'discovery',
      progress: 5,
    },
  });

  const pages = new Map<string, PageRecord>();
  const pending: Array<{ url: string; depth: number; parentUrl?: string }> = [
    { url: audit.website.normalizedUrl, depth: 0 },
  ];
  let failures = 0;
  let lastError: string | undefined;

  const maxPages = Number(process.env.MAX_PAGES_PER_AUDIT ?? 10);
  const maxDepth = Number(process.env.MAX_CRAWL_DEPTH ?? 2);

  // Aggregate site-level signals across all scanned pages
  let siteHasWhatsApp = false;
  let siteHasTel = false;
  let siteHasForm = false;
  let siteHasCta = false;
  let siteHasMetaPixel = false;
  let siteHasGa4 = false;
  let siteHasGtm = false;
  let primaryHeaders: Record<string, string> = {};

  while (pending.length && pages.size < maxPages) {
    if (signal.aborted) {
      await db.auditRun.update({
        where: { id: run.id },
        data: { status: 'CANCELLED', completedAt: new Date(), errorCode: 'ABORTED' },
      });
      return { status: 'CANCELLED' };
    }

    const next = pending.shift()!;
    if (pages.has(next.url) || next.depth > maxDepth) continue;

    try {
      const page = await fetchPage(next.url, signal, next.depth, next.parentUrl);
      pages.set(next.url, page);

      if (pages.size === 1) {
        primaryHeaders = page.headers;
      }

      // 2. Persist AuditPage to DB (upsert for retry idempotency)
      await db.auditPage.upsert({
        where: {
          auditId_url: {
            auditId,
            url: page.url,
          },
        },
        create: {
          auditId,
          url: page.url,
          finalUrl: page.finalUrl,
          statusCode: page.statusCode,
          title: page.title,
          contentType: page.contentType,
          headers: page.headers as object,
          htmlAvailable: true,
          responseTimeMs: page.responseTimeMs,
          depth: page.depth,
          parentUrl: page.parentUrl,
          redirectChain: page.redirectChain,
        },
        update: {
          finalUrl: page.finalUrl,
          statusCode: page.statusCode,
          title: page.title,
          contentType: page.contentType,
          headers: page.headers as object,
          htmlAvailable: true,
          responseTimeMs: page.responseTimeMs,
          depth: page.depth,
          parentUrl: page.parentUrl,
          redirectChain: page.redirectChain,
        },
      });

      // Aggregate signals from page
      const waCheck = scanWhatsApp(page);
      if (waCheck.validLinksCount > 0) siteHasWhatsApp = true;

      const telCheck = scanTelephone(page);
      if (telCheck.validLinksCount > 0) siteHasTel = true;

      const formsCheck = scanFormsAndCtas(page);
      if (formsCheck.hasForm) siteHasForm = true;
      if (formsCheck.hasCta) siteHasCta = true;

      const trackCheck = scanTracking(page);
      if (trackCheck.metaPixel.status !== 'NOT_DETECTED') siteHasMetaPixel = true;
      if (trackCheck.ga4.status !== 'NOT_DETECTED') siteHasGa4 = true;
      if (trackCheck.gtm.status !== 'NOT_DETECTED') siteHasGtm = true;

      // Discover links on same domain
      for (const link of discoverLinks(page, new URL(audit.website.normalizedUrl).origin)) {
        if (!pages.has(link) && !pending.some((item) => item.url === link)) {
          pending.push({ url: link, depth: next.depth + 1, parentUrl: page.url });
        }
      }

      await db.audit.update({
        where: { id: auditId },
        data: {
          progressStage: 'fetching',
          progress: Math.min(75, 10 + pages.size * 6),
          pagesDiscovered: pages.size + pending.length,
          pagesFetched: pages.size,
        },
      });
    } catch (error) {
      failures += 1;
      const errorCode = classifyError(error);
      lastError = errorCode;

      // Persist failed page record with errorCode
      try {
        await db.auditPage.upsert({
          where: {
            auditId_url: {
              auditId,
              url: next.url,
            },
          },
          create: {
            auditId,
            url: next.url,
            finalUrl: next.url,
            statusCode: null,
            htmlAvailable: false,
            depth: next.depth,
            parentUrl: next.parentUrl,
            errorCode,
          },
          update: {
            htmlAvailable: false,
            depth: next.depth,
            parentUrl: next.parentUrl,
            errorCode,
          },
        });
      } catch {
        // Continue if DB write fails
      }

      console.error(
        JSON.stringify({
          level: 'warn',
          service: 'worker',
          stage: 'fetching',
          auditId,
          url: next.url,
          error: error instanceof Error ? error.message : 'fetch failure',
          errorCode,
        })
      );
    }
  }

  await db.audit.update({
    where: { id: auditId },
    data: { progressStage: 'scanning', progress: 80, pagesScanned: pages.size },
  });

  const allFindings: Finding[] = [];

  // --- 1. Page-level Scanners ---
  for (const page of pages.values()) {
    const pageFindings = await scanPage(page);
    allFindings.push(...pageFindings);
  }

  // --- 2. Site-level / Website Scanners ---
  const siteUrl = audit.website.normalizedUrl;

  // 2a. WhatsApp site CTA presence
  if (!siteHasWhatsApp) {
    allFindings.push({
      ruleId: 'LG-001',
      internalKey: 'WHATSAPP_MISSING',
      category: 'LEAD',
      scope: 'WEBSITE',
      severity: 'MEDIUM',
      title: 'No WhatsApp CTA detected across the website',
      description: 'No valid WhatsApp chat link (wa.me, api.whatsapp.com, or whatsapp://) was detected on any scanned page.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'website_scan',
        observed: '0 WhatsApp links across all crawled pages',
        location: siteUrl,
        why: 'WhatsApp is a primary high-intent conversion channel for direct consumer and business inquiries.',
        recommendation: 'Add a verified WhatsApp floating button or navigation CTA linking to your official business number.',
      },
      recommendation: 'Add a verified WhatsApp CTA to key pages to capture instant mobile inquiries.',
      scoreImpact: 8,
      businessImpact: 'Visitors preferring quick chat over forms cannot reach your team, resulting in lost leads.',
    });
  }

  // 2b. Click-to-Call site presence
  if (!siteHasTel) {
    allFindings.push({
      ruleId: 'LG-003',
      internalKey: 'TEL_MISSING',
      category: 'LEAD',
      scope: 'WEBSITE',
      severity: 'LOW',
      title: 'No click-to-call link detected on the website',
      description: 'No tel: phone link was found across any scanned page.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'website_scan',
        observed: '0 tel: links found',
        location: siteUrl,
        why: 'Mobile visitors expect instant click-to-call functionality for urgent inquiries.',
        recommendation: 'Add a click-to-call link (e.g. href="tel:+919876543210") in the website header or contact section.',
      },
      recommendation: 'Add a click-to-call phone link in the website header or footer.',
      scoreImpact: 3,
      businessImpact: 'Mobile visitors cannot easily dial your business directly from their browsers.',
    });
  }

  // 2c. Contact form & CTA site presence
  if (!siteHasForm) {
    allFindings.push({
      ruleId: 'LG-001',
      internalKey: 'CONTACT_FORM_MISSING',
      category: 'LEAD',
      scope: 'WEBSITE',
      severity: 'MEDIUM',
      title: 'No contact or lead capture form detected',
      description: 'No <form> or submit button was detected across the scanned pages.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'website_scan',
        observed: '0 <form> elements detected',
        location: siteUrl,
        why: 'Lead generation websites require structured input forms for capturing prospect inquiries.',
        recommendation: 'Implement an accessible inquiry or contact form with validation.',
      },
      recommendation: 'Add a contact form to capture visitor contact details and inquiry requirements.',
      scoreImpact: 8,
      businessImpact: 'Prospective clients without direct messaging apps cannot submit detailed project inquiries.',
    });
  }

  if (!siteHasCta) {
    allFindings.push({
      ruleId: 'LG-001',
      internalKey: 'CTA_MISSING',
      category: 'LEAD',
      scope: 'WEBSITE',
      severity: 'MEDIUM',
      title: 'No prominent lead call-to-action (CTA) detected',
      description: 'No prominent action buttons (e.g., "Contact", "Book", "Get Quote", "Request Demo") were detected.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'website_scan',
        observed: 'No standard CTA text detected on buttons or links',
        location: siteUrl,
        why: 'Clear CTAs guide visitor journeys and prompt conversion actions.',
        recommendation: 'Add clear, high-contrast Call-to-Action buttons on high-intent sections.',
      },
      recommendation: 'Add clear Call-to-Action (CTA) buttons throughout key conversion paths.',
      scoreImpact: 6,
      businessImpact: 'Unclear next steps increase page bounce rates and reduce overall conversion momentum.',
    });
  }

  // 2d. Tracking probes (Meta Pixel, GA4, GTM)
  if (!siteHasMetaPixel) {
    allFindings.push({
      ruleId: 'LG-006',
      internalKey: 'META_PIXEL_MISSING',
      category: 'ADVERTISING',
      scope: 'WEBSITE',
      severity: 'LOW',
      title: 'Meta Pixel tracking not detected',
      description: 'No Meta Pixel signature (fbq, connect.facebook.net, fbevents.js) was detected on the website.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'html_scripts',
        observed: 'No fbq() or connect.facebook.net signatures found',
        location: siteUrl,
        why: 'Meta Pixel allows conversion tracking, retargeting, and lookalike audience optimization for Facebook & Instagram ads.',
        recommendation: 'Install the Meta Pixel base code in the website header.',
      },
      recommendation: 'Install Meta Pixel tracking to enable ad attribution and retargeting.',
      scoreImpact: 4,
      businessImpact: 'Paid Meta ad campaigns cannot track conversions or optimize ad spend effectively.',
    });
  }

  if (!siteHasGa4) {
    allFindings.push({
      ruleId: 'LG-007',
      internalKey: 'GA4_MISSING',
      category: 'ADVERTISING',
      scope: 'WEBSITE',
      severity: 'LOW',
      title: 'Google Analytics 4 (GA4) not detected',
      description: 'No GA4 measurement identifier (G-...) or gtag() tracking call was detected on the website.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'html_scripts',
        observed: 'No G- measurement ID or gtag() script detected',
        location: siteUrl,
        why: 'Google Analytics 4 provides audience measurement, traffic attribution, and funnel conversion analytics.',
        recommendation: 'Add the Google tag (gtag.js) with your GA4 Measurement ID to all pages.',
      },
      recommendation: 'Deploy GA4 tracking across all pages.',
      scoreImpact: 4,
      businessImpact: 'Website lacks basic traffic analytics and marketing funnel attribution data.',
    });
  }

  if (!siteHasGtm) {
    allFindings.push({
      ruleId: 'LG-007',
      internalKey: 'GTM_MISSING',
      category: 'ADVERTISING',
      scope: 'WEBSITE',
      severity: 'LOW',
      title: 'Google Tag Manager (GTM) not detected',
      description: 'No Google Tag Manager container (GTM-...) or dataLayer implementation was detected.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'html_scripts',
        observed: 'No GTM- container ID or googletagmanager script detected',
        location: siteUrl,
        why: 'Google Tag Manager allows centralized management of tracking tags, conversion pixels, and event listeners.',
        recommendation: 'Install Google Tag Manager container script in the <head> and <body>.',
      },
      recommendation: 'Consider deploying Google Tag Manager for centralized tag deployment.',
      scoreImpact: 4,
    });
  }

  // 2e. Security headers (evaluated at website level using primary response headers)
  if (pages.size > 0) {
    const headerDummyPage: PageRecord = {
      url: siteUrl,
      finalUrl: siteUrl,
      statusCode: 200,
      contentType: 'text/html',
      headers: primaryHeaders,
      htmlAvailable: false,
      responseTimeMs: 0,
      depth: 0,
      redirectChain: [],
      html: '',
    };
    const secHeadersResult = scanSecurityHeaders(headerDummyPage);
    allFindings.push(...secHeadersResult.findings);
  }

  // 2f. Dedicated TLS Inspection Service
  if (siteUrl.startsWith('https://')) {
    try {
      const tlsResult = await inspectTls(siteUrl);
      allFindings.push(...tlsResult.findings);
    } catch {
      // TLS inspection handled errors internally
    }
  }

  // 3. Deduplicate findings
  const findings = deduplicateFindings(allFindings);

  // 4. Calculate Scores
  const scores = calculateScores(findings, audit.scoringVersion || 'v2');

  // 5. Business Impact & Priority Engine
  const impact = buildBusinessImpact(findings, {
    monthlyVisitors: Number(process.env.DEFAULT_MONTHLY_VISITORS ?? 0),
    conversionRate: Number(process.env.DEFAULT_CONVERSION_RATE ?? 0),
    averageLeadValue: Number(process.env.DEFAULT_AVERAGE_LEAD_VALUE ?? 0),
  });

  const summary = buildExecutiveSummary(findings, scores, impact);

  const status = pages.size === 0 ? 'FAILED' : failures > 0 ? 'PARTIAL' : 'COMPLETED';

  // 6. Safe Transactional Persistence
  await db.$transaction(async (tx) => {
    // Delete existing findings for this audit (for retry idempotency)
    await tx.auditFinding.deleteMany({ where: { auditId } });

    if (findings.length) {
      await tx.auditFinding.createMany({
        data: findings.map((item) => ({
          auditId,
          ruleId: item.ruleId,
          category: item.category,
          scope: item.scope,
          severity: item.severity,
          title: item.title,
          description: item.description,
          evidence: item.evidence as object,
          affectedUrl: item.affectedUrl ?? null,
          recommendation: item.recommendation,
          scoreImpact: item.scoreImpact,
          businessImpact: item.businessImpact ?? null,
          metadata: item.metadata as object,
        })),
      });
    }

    await tx.auditScore.upsert({
      where: { auditId },
      create: { auditId, ...scores },
      update: scores,
    });

    await tx.audit.update({
      where: { id: auditId },
      data: {
        status,
        progressStage: status === 'COMPLETED' ? 'completed' : status === 'PARTIAL' ? 'partial' : 'failed',
        progress: 100,
        pagesScanned: pages.size,
        findingsGenerated: findings.length,
        completedAt: new Date(),
        durationMs: Date.now() - started,
        businessImpact: impact as object,
        executiveSummary: summary as object,
      },
    });

    await tx.auditRun.update({
      where: { id: run.id },
      data: {
        status,
        pagesFetched: pages.size,
        findingsCount: findings.length,
        errorCode: status === 'FAILED' ? lastError ?? 'CRAWL_FAILED' : null,
        completedAt: new Date(),
      },
    });
  });

  console.log(
    JSON.stringify({
      level: 'info',
      service: 'worker',
      auditId,
      runId: run.id,
      organizationId: audit.organizationId,
      websiteId: audit.websiteId,
      stage: status === 'COMPLETED' ? 'completed' : status.toLowerCase(),
      duration: Date.now() - started,
      pages: pages.size,
      findings: findings.length,
      status,
    })
  );

  return {
    status,
    runId: run.id,
    pages: pages.size,
    findings: findings.length,
    scores,
    impact,
    summary,
  };
}
