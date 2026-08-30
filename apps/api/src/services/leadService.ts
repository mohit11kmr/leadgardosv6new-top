import { db } from '@leadguard/database';

export interface LeadForAuditInput {
  organizationId: string;
  websiteId: string;
  auditId: string;
  email: string;
  name?: string;
  source?: string;
}

/**
 * Sales lead capture for the guest Express Fix funnel.
 *
 * A lead is keyed by (email, auditId) so repeated attempts by the same guest
 * against the same scan are de-duplicated into a single business record. This
 * lets later sales outreach reach failed-checkout leads without creating
 * duplicate customer rows.
 */
export class LeadService {
  /**
   * Returns the existing lead for (email, auditId) or creates one. Never
   * creates a duplicate for repeated attempts.
   */
  async getOrCreateForAudit(input: LeadForAuditInput) {
    const existing = await db.expressFixLead.findUnique({
      where: {
        email_auditId: {
          email: input.email.toLowerCase(),
          auditId: input.auditId,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return db.expressFixLead.create({
      data: {
        organizationId: input.organizationId,
        websiteId: input.websiteId,
        auditId: input.auditId,
        email: input.email.toLowerCase(),
        name: input.name || null,
        source: input.source || 'GUEST_CHECKOUT',
      },
    });
  }

  /**
   * Links a successful payment to a lead (idempotent).
   */
  async linkPayment(leadId: string, paymentId: string) {
    return db.expressFixLead.updateMany({
      where: { id: leadId, paymentId: null },
      data: { paymentId },
    });
  }

  /**
   * Links a created fulfillment to a lead (idempotent).
   */
  async linkFulfillment(leadId: string, fulfillmentId: string) {
    return db.expressFixLead.updateMany({
      where: { id: leadId, fulfillmentId: null },
      data: { fulfillmentId },
    });
  }
}

export const leadService = new LeadService();
