import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import request from 'supertest';
import { app } from '../apps/api/src/server.js';
import { createAccessToken } from '../apps/api/src/auth.js';

describe('Organization Switcher & Strict Workspace Isolation (Requirement 8)', () => {
  it('switches organizations cleanly and ensures zero cross-organization data leakage', async () => {
    // 1. Create User with 2 Organizations
    const user = await db.user.create({
      data: { email: `user-multi-org-${Date.now()}@example.com`, passwordHash: 'hash' },
    });

    const orgAlpha = await db.organization.create({
      data: { name: 'Alpha Corp', slug: `alpha-corp-${Date.now()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: orgAlpha.id, userId: user.id, role: 'OWNER' },
    });

    const orgBeta = await db.organization.create({
      data: { name: 'Beta Labs', slug: `beta-labs-${Date.now()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: orgBeta.id, userId: user.id, role: 'OWNER' },
    });

    // Create a website exclusively in Alpha Corp
    await db.website.create({
      data: {
        organizationId: orgAlpha.id,
        name: 'Alpha Internal Portal',
        url: 'https://alpha.example.com',
        normalizedUrl: 'https://alpha.example.com',
        domain: 'alpha.example.com',
      },
    });

    // Create a website exclusively in Beta Labs
    await db.website.create({
      data: {
        organizationId: orgBeta.id,
        name: 'Beta Secret App',
        url: 'https://beta.example.com',
        normalizedUrl: 'https://beta.example.com',
        domain: 'beta.example.com',
      },
    });

    // 2. Token scoped to Org Alpha
    const tokenAlpha = createAccessToken(user.id, orgAlpha.id);

    const resAlpha = await request(app)
      .get('/api/v1/websites')
      .set('Authorization', `Bearer ${tokenAlpha}`);

    expect(resAlpha.status).toBe(200);
    expect(resAlpha.body.data).toHaveLength(1);
    expect(resAlpha.body.data[0].name).toBe('Alpha Internal Portal');
    // Ensure Beta Secret App is NOT present in Alpha's response
    expect(resAlpha.body.data.some((w: { name: string }) => w.name === 'Beta Secret App')).toBe(false);

    // 3. Switch organization to Org Beta via API
    const switchRes = await request(app)
      .post(`/api/v1/organizations/${orgBeta.id}/switch`)
      .set('Authorization', `Bearer ${tokenAlpha}`);

    expect(switchRes.status).toBe(200);
    expect(switchRes.body.success).toBe(true);
    expect(switchRes.body.data.accessToken).toBeDefined();

    const tokenBeta = switchRes.body.data.accessToken;

    // 4. Token scoped to Org Beta
    const resBeta = await request(app)
      .get('/api/v1/websites')
      .set('Authorization', `Bearer ${tokenBeta}`);

    expect(resBeta.status).toBe(200);
    expect(resBeta.body.data).toHaveLength(1);
    expect(resBeta.body.data[0].name).toBe('Beta Secret App');
    // Ensure Alpha Internal Portal is NOT present in Beta's response
    expect(resBeta.body.data.some((w: { name: string }) => w.name === 'Alpha Internal Portal')).toBe(false);
  });
});
