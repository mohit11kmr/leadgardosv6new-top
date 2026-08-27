import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@leadguard/database';
import { widgetService } from '../../apps/api/src/services/agency/widgetService.js';

describe('Phase 7.2 — Widget Origin Policy & Security Hardening', () => {
  let org: any;
  let widget: any;

  beforeAll(async () => {
    org = await db.organization.create({
      data: {
        name: 'Widget Embed Test Org',
        slug: `widget-test-org-${Date.now()}`,
      },
    });

    let agencyPlan = await db.plan.findUnique({ where: { code: 'AGENCY' } });
    if (!agencyPlan) {
      agencyPlan = await db.plan.create({
        data: {
          code: 'AGENCY',
          name: 'Agency Plan',
          priceInPaise: 499900,
          currency: 'INR',
          entitlements: {
            auditsPerMonth: 1000,
            websites: 25,
            monitoring: true,
            apiAccess: true,
            whiteLabel: true,
            reports: 500,
            prospectLimit: 5000,
            clientLimit: 25,
            prospectCampaignLimit: 50,
            prospectLimitPerCampaign: 500,
            pitchLimit: 500,
            widgetLimit: 10,
            competitorLimit: 10,
          },
        },
      });
    }

    await db.subscription.create({
      data: {
        organizationId: org.id,
        planId: agencyPlan.id,
        status: 'ACTIVE',
        provider: 'RAZORPAY',
        providerSubscriptionId: `sub_widget_${Date.now()}`,
      },
    });

    widget = await widgetService.createWidget(org.id, {
      name: 'Embed Test Widget',
      allowedOrigins: ['https://authorized-client.com'],
      theme: 'DARK',
      displayMode: 'EMBED',
    });
  });

  afterAll(async () => {
    await db.widget.deleteMany({ where: { organizationId: org.id } });
    await db.subscription.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
  });

  it('allows access when exact matching Origin header is provided', async () => {
    const data = await widgetService.getPublicWidgetData(
      widget.id,
      widget.rawToken,
      'https://authorized-client.com'
    );

    expect(data.id).toBe(widget.id);
    expect(data.theme).toBe('DARK');
    expect(data.agencyName).toBe('Widget Embed Test Org');
  });

  it('allows access when valid Referer url matches allowed origins', async () => {
    const referer = 'https://authorized-client.com/services/audit-tool';
    const data = await widgetService.getPublicWidgetData(
      widget.id,
      widget.rawToken,
      referer
    );

    expect(data.id).toBe(widget.id);
  });

  it('rejects with ORIGIN_REQUIRED when both Origin and Referer are absent', async () => {
    await expect(
      widgetService.getPublicWidgetData(widget.id, widget.rawToken, undefined)
    ).rejects.toMatchObject({
      code: 'ORIGIN_REQUIRED',
    });
  });

  it('rejects with ORIGIN_FORBIDDEN when Origin does not match allowedOrigins', async () => {
    await expect(
      widgetService.getPublicWidgetData(
        widget.id,
        widget.rawToken,
        'https://malicious-unauthorized-site.com'
      )
    ).rejects.toMatchObject({
      code: 'ORIGIN_FORBIDDEN',
    });
  });

  it('rotates widget token rendering old token immediately invalid', async () => {
    const oldToken = widget.rawToken;
    const rotated = await widgetService.regenerateToken(org.id, widget.id);

    expect(rotated.rawToken).not.toBe(oldToken);

    // Old token should fail with INVALID_WIDGET_TOKEN
    await expect(
      widgetService.getPublicWidgetData(
        widget.id,
        oldToken,
        'https://authorized-client.com'
      )
    ).rejects.toMatchObject({
      code: 'INVALID_WIDGET_TOKEN',
    });

    // New token works
    const data = await widgetService.getPublicWidgetData(
      widget.id,
      rotated.rawToken,
      'https://authorized-client.com'
    );
    expect(data.id).toBe(widget.id);
  });
});
