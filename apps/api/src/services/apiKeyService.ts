import { randomBytes } from 'node:crypto';
import { db } from '@leadguard/database';
import { hashApiKey, recordSecurityEvent } from '../auth.js';

export class ApiKeyService {
  async createApiKey(
    organizationId: string,
    userId: string,
    name: string,
    scopes: string[] = ['audit:read', 'audit:write'],
    expiresInDays = 365
  ) {
    const rawSecret = randomBytes(24).toString('hex');
    const rawKey = `lg_live_${rawSecret}`;
    const keyPrefix = rawKey.slice(0, 16);
    const keyHash = hashApiKey(rawKey);
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000);

    const apiKey = await db.apiKey.create({
      data: {
        organizationId,
        name,
        keyPrefix,
        keyHash,
        scopes,
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    await recordSecurityEvent('API_KEY_CREATED', userId, null, {
      organizationId,
      apiKeyId: apiKey.id,
      keyPrefix,
    });

    return {
      apiKey,
      rawKey, // Returned only upon creation
    };
  }

  async listApiKeys(organizationId: string) {
    return db.apiKey.findMany({
      where: { organizationId, revokedAt: null },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeApiKey(id: string, organizationId: string, userId: string) {
    const result = await db.apiKey.updateMany({
      where: { id, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count > 0) {
      await recordSecurityEvent('API_KEY_REVOKED', userId, null, {
        organizationId,
        apiKeyId: id,
      });
    }

    return result.count > 0;
  }

  async verifyApiKey(rawKey: string) {
    if (!rawKey.startsWith('lg_live_')) return null;
    const keyHash = hashApiKey(rawKey);

    const key = await db.apiKey.findUnique({
      where: { keyHash },
      include: { organization: true },
    });

    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) {
      return null;
    }

    // Update lastUsedAt asynchronously
    await db.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      organizationId: key.organizationId,
      scopes: key.scopes,
    };
  }
}

export const apiKeyService = new ApiKeyService();
