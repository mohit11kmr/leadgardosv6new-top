import { db } from '@leadguard/database';
import type { PublicReportDTO, PaginatedResult } from '../../dtos/public.js';

export class PublicReportService {
  /**
   * Lists immutable reports for an organization with cursor pagination
   */
  async listReports(
    organizationId: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedResult<PublicReportDTO>> {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
    const cursor = options.cursor;

    const reports = await db.report.findMany({
      where: { organizationId },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        title: true,
        reportVersion: true,
        status: true,
        pdfStatus: true,
        snapshotData: true,
        createdAt: true,
      },
    });

    const hasMore = reports.length > limit;
    const items = hasMore ? reports.slice(0, limit) : reports;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map((r) => this.formatReportDto(r)),
      nextCursor,
      hasNextPage: hasMore,
      hasMore,
      limit,
    };
  }

  /**
   * Retrieves single report with tenant isolation and IDOR protection
   */
  async getReport(organizationId: string, reportId: string): Promise<PublicReportDTO> {
    const report = await db.report.findFirst({
      where: { id: reportId, organizationId },
      select: {
        id: true,
        title: true,
        reportVersion: true,
        status: true,
        pdfStatus: true,
        snapshotData: true,
        createdAt: true,
      },
    });

    if (!report) {
      const err = new Error('Report not found');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    return this.formatReportDto(report);
  }

  private formatReportDto(report: any): PublicReportDTO {
    return {
      id: report.id,
      title: report.title,
      reportVersion: report.reportVersion || 'v1',
      status: report.status,
      pdfStatus: report.pdfStatus || 'NONE',
      snapshot: report.snapshotData,
      createdAt: report.createdAt instanceof Date ? report.createdAt.toISOString() : report.createdAt,
    };
  }
}

export const publicReportService = new PublicReportService();
