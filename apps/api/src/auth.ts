import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { config } from '@leadguard/config';
import { db } from '@leadguard/database';

export const REFRESH_COOKIE_NAME = 'leadguard_refresh_token';

export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id });

export const verifyPassword = (hash: string, password: string) =>
  argon2.verify(hash, password);

export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export const hashRefreshToken = hashToken;

export const hashApiKey = hashToken;

export const generateSecureToken = (bytes = 32) =>
  randomBytes(bytes).toString('hex');

export const createRefreshToken = () =>
  randomBytes(48).toString('base64url');

export const createAccessToken = (userId: string, organizationId: string) =>
  jwt.sign({ sub: userId, organizationId }, config.JWT_SECRET, { expiresIn: '15m' });

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

export function setRefreshCookie(res: Response, refreshToken: string) {
  // Use Set-Cookie header explicitly to work seamlessly across environments
  const isProd = config.NODE_ENV === 'production';
  const cookieOptions = [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(refreshToken)}`,
    'HttpOnly',
    'Path=/api/v1/auth',
    'SameSite=Lax',
    `Max-Age=${30 * 24 * 60 * 60}`,
    ...(config.COOKIE_DOMAIN ? [`Domain=${config.COOKIE_DOMAIN}`] : []),
    ...(isProd ? ['Secure'] : []),
  ].join('; ');

  res.setHeader('Set-Cookie', cookieOptions);
}

export function clearRefreshCookie(res: Response) {
  const isProd = config.NODE_ENV === 'production';
  const cookieOptions = [
    `${REFRESH_COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/api/v1/auth',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(config.COOKIE_DOMAIN ? [`Domain=${config.COOKIE_DOMAIN}`] : []),
    ...(isProd ? ['Secure'] : []),
  ].join('; ');

  res.setHeader('Set-Cookie', cookieOptions);
}

export async function recordSecurityEvent(
  type: string,
  userId?: string | null,
  ipAddress?: string | null,
  metadata?: Record<string, unknown>
) {
  try {
    await db.securityEvent.create({
      data: {
        type,
        userId: userId || null,
        ipAddress: ipAddress || null,
        metadata: metadata ? (metadata as object) : undefined,
      },
    });
  } catch (err) {
    console.error('Failed to record security event:', err);
  }
}
