/**
 * Report/PDF storage abstraction — server-only (node:fs, @aws-sdk/client-s3).
 * Deliberately excluded from the main @leadguard/shared barrel export for the
 * same reason as secret-encryption.ts: pulling this into the apps/web bundle
 * would break it. Import via the 'server-only/report-storage.js' subpath
 * only from apps/api or apps/worker.
 *
 * Shared between apps/worker (writes PDFs after rendering them) and apps/api
 * (reads them back for authenticated/share-link download) so both sides
 * agree on exactly one storage contract instead of each re-implementing it.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '@leadguard/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export interface StorageProvider {
  save(filename: string, content: Buffer | string): Promise<string>;
  get(filename: string): Promise<Buffer>;
  getUrl(filename: string): string;
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir = 'uploads/reports') {
    this.baseDir = baseDir;
  }

  async save(filename: string, content: Buffer | string): Promise<string> {
    await mkdir(this.baseDir, { recursive: true });
    const fullPath = join(this.baseDir, filename);
    await writeFile(fullPath, content);
    return `/uploads/reports/${filename}`;
  }

  async get(filename: string): Promise<Buffer> {
    const fullPath = join(this.baseDir, filename);
    return readFile(fullPath);
  }

  getUrl(filename: string): string {
    return `/uploads/reports/${filename}`;
  }
}

export class S3StorageProvider implements StorageProvider {
  private bucket: string;
  private client: S3Client;

  constructor(bucket = config.S3_BUCKET) {
    // Config validation (packages/config) already refuses to boot with
    // REPORT_STORAGE=S3 unless S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are set,
    // so this never silently falls back to local disk like it used to.
    this.bucket = bucket;
    this.client = new S3Client({
      region: config.S3_REGION,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID!,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  async save(filename: string, content: Buffer | string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: filename,
        Body: content,
        ContentType: filename.endsWith('.pdf') ? 'application/pdf' : 'text/html',
      })
    );
    return this.getUrl(filename);
  }

  async get(filename: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: filename }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  getUrl(filename: string): string {
    return `https://${this.bucket}.s3.${config.S3_REGION}.amazonaws.com/${filename}`;
  }
}

export function getStorageProvider(): StorageProvider {
  if (config.REPORT_STORAGE === 'S3') {
    return new S3StorageProvider();
  }
  return new LocalStorageProvider();
}

/**
 * Extracts the storage-relative filename from a Report.pdfPath value, which
 * may be a local path ('/uploads/reports/report_x_v1.pdf') or a full S3 URL
 * ('https://bucket.s3.region.amazonaws.com/report_x_v1.pdf') depending on
 * REPORT_STORAGE. Both StorageProvider.get() implementations expect a bare
 * filename, not a path/URL.
 */
export function extractStorageFilename(pdfPath: string): string {
  const segments = pdfPath.split('/');
  return segments[segments.length - 1] || pdfPath;
}
