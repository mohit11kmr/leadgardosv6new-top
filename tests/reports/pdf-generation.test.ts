import { describe, it, expect, vi } from 'vitest';
import { renderHtmlToPdf, generateReportHtml } from '../../apps/worker/src/report/pdfWorker.js';

describe('PDF generation (regression: this used to write raw HTML labeled as a PDF)', () => {
  it('renders a real PDF binary (starts with the %PDF- magic bytes), not HTML', async () => {
    const html = generateReportHtml({
      title: 'Test Report',
      auditDate: '2026-01-01',
      websiteUrl: 'https://example.com',
      overallScore: 82,
      findingsCount: 3,
      criticalFindings: 1,
      branding: {
        companyName: 'Test Co',
        primaryColor: '#2563eb',
        secondaryColor: '#1e293b',
      },
    });

    const pdf = await renderHtmlToPdf(html);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);
  }, 30_000);
});

describe('S3StorageProvider (regression: this used to silently fall back to local disk)', () => {
  it('uploads via the real S3 client instead of writing to local disk', async () => {
    const sendMock = vi.fn().mockResolvedValue({});
    vi.doMock('@aws-sdk/client-s3', () => {
      class FakeS3Client {
        send = sendMock;
      }
      class FakePutObjectCommand {
        constructor(public input: unknown) {}
      }
      class FakeGetObjectCommand {
        constructor(public input: unknown) {}
      }
      return {
        S3Client: FakeS3Client,
        PutObjectCommand: FakePutObjectCommand,
        GetObjectCommand: FakeGetObjectCommand,
      };
    });

    vi.resetModules();
    const { S3StorageProvider } = await import('../../apps/worker/src/report/pdfWorker.js');
    const provider = new S3StorageProvider('test-bucket');

    const url = await provider.save('report_123_v1.pdf', Buffer.from('%PDF-fake'));

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0]?.[0];
    expect(command.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'report_123_v1.pdf',
      ContentType: 'application/pdf',
    });
    expect(url).toContain('test-bucket');
    expect(url).toContain('report_123_v1.pdf');

    vi.doUnmock('@aws-sdk/client-s3');
    vi.resetModules();
  });
});
