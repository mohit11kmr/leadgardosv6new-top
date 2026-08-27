import { db } from '@leadguard/database';
import { decodeCursor, encodeCursor, buildCursorWhereClause } from '@leadguard/shared';
import type { PublicReportDTO, PaginatedResult } from '../../dtos/public.js';

export class PublicReportService {
  /**
   * Lists immutable reports for an organization with deterministic (createdAt, id) tuple cursor pagination
   */
  async listReports(
    organizationId: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedResult<PublicReportDTO>> {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
    const decodedCursor = decodeCursor(options.cursor);
    const cursorFilter = buildCursorWhereClause(decodedCursor);

    const where: any = { organizationId };
    if (cursorFilter) {
      where.AND = [cursorFilter];
    }

    const reports = await db.report.findMany({
      where,
      take: limit + 1,
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
    const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]!) : null;

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
