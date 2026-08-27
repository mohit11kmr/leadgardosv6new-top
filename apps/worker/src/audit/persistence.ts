import { db } from '@leadguard/database';
import type { Finding, PageRecord } from '@leadguard/shared';

export async function upsertAuditPage(auditId: string, page: PageRecord): Promise<void> {
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
}

export async function recordFailedPage(
  auditId: string,
  url: string,
  depth: number,
  parentUrl?: string,
  errorCode?: string
): Promise<void> {
  try {
    await db.auditPage.upsert({
      where: {
        auditId_url: {
          auditId,
          url,
        },
      },
      create: {
        auditId,
        url,
        finalUrl: url,
        statusCode: null,
        htmlAvailable: false,
        depth,
        parentUrl,
        errorCode,
      },
      update: {
        htmlAvailable: false,
        depth,
        parentUrl,
        errorCode,
      },
    });
  } catch {
    // Ignore secondary DB error on failure logging
  }
}
