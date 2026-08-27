import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function getFilesRecursively(dir: string, extensions: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      files.push(...getFilesRecursively(fullPath, extensions));
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Architecture Boundary Enforcement (Requirement 1, 2, 37)', () => {
  const rootDir = process.cwd();

  it('verifies apps/web does NOT import backend databases, API routes, or worker modules', () => {
    const webFiles = getFilesRecursively(path.join(rootDir, 'apps/web/src'), ['.ts', '.tsx', '.js', '.jsx']);
    expect(webFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      /@leadguard\/database/,
      /@prisma\/client/,
      /apps\/api/,
      /apps\/worker/,
      /express/,
      /bullmq/,
      /ioredis/,
      /argon2/,
    ];

    const violations: { file: string; line: string }[] = [];

    for (const file of webFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (/^\s*(import|export)\s+/.test(line)) {
          for (const pattern of forbiddenPatterns) {
            if (pattern.test(line)) {
              violations.push({ file, line: `L${i + 1}: ${line.trim()}` });
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('verifies apps/api does NOT import React or frontend UI modules', () => {
    const apiFiles = getFilesRecursively(path.join(rootDir, 'apps/api/src'), ['.ts', '.js']);
    expect(apiFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      /apps\/web/,
      /@leadguard\/web/,
      /from\s+['"]react['"]/,
      /from\s+['"]react-dom['"]/,
      /from\s+['"]react-router['"]/,
    ];

    const violations: { file: string; line: string }[] = [];

    for (const file of apiFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (/^\s*(import|export)\s+/.test(line)) {
          for (const pattern of forbiddenPatterns) {
            if (pattern.test(line)) {
              violations.push({ file, line: `L${i + 1}: ${line.trim()}` });
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('verifies apps/worker does NOT import frontend UI or Express route modules', () => {
    const workerFiles = getFilesRecursively(path.join(rootDir, 'apps/worker/src'), ['.ts', '.js']);
    expect(workerFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      /apps\/web/,
      /@leadguard\/web/,
      /apps\/api\/src\/routes/,
      /from\s+['"]react['"]/,
      /from\s+['"]express['"]/,
    ];

    const violations: { file: string; line: string }[] = [];

    for (const file of workerFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (/^\s*(import|export)\s+/.test(line)) {
          for (const pattern of forbiddenPatterns) {
            if (pattern.test(line)) {
              violations.push({ file, line: `L${i + 1}: ${line.trim()}` });
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('verifies packages/shared does NOT import Express, React, or database drivers', () => {
    const sharedFiles = getFilesRecursively(path.join(rootDir, 'packages/shared/src'), ['.ts', '.js']);
    expect(sharedFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      /from\s+['"]express['"]/,
      /from\s+['"]react['"]/,
      /@leadguard\/database/,
      /@prisma\/client/,
    ];

    const violations: { file: string; line: string }[] = [];

    for (const file of sharedFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (/^\s*(import|export)\s+/.test(line)) {
          for (const pattern of forbiddenPatterns) {
            if (pattern.test(line)) {
              violations.push({ file, line: `L${i + 1}: ${line.trim()}` });
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
