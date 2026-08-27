import { describe, it, expect } from 'vitest';
import { billingService } from '../../apps/api/src/services/billingService.js';

describe('Billing: State Machine Transitions (Requirement 16, 34)', () => {
  it('validates legal and illegal payment lifecycle transitions', () => {
    // Legal transitions
    expect(billingService.isValidPaymentTransition('CREATED', 'AUTHORIZED')).toBe(true);
    expect(billingService.isValidPaymentTransition('CREATED', 'CAPTURED')).toBe(true);
    expect(billingService.isValidPaymentTransition('AUTHORIZED', 'CAPTURED')).toBe(true);
    expect(billingService.isValidPaymentTransition('CAPTURED', 'REFUNDED')).toBe(true);

    // Illegal transitions
    expect(billingService.isValidPaymentTransition('CAPTURED', 'CREATED')).toBe(false);
    expect(billingService.isValidPaymentTransition('FAILED', 'CAPTURED')).toBe(false);
    expect(billingService.isValidPaymentTransition('REFUNDED', 'AUTHORIZED')).toBe(false);
  });

  it('validates legal and illegal subscription lifecycle transitions', () => {
    // Legal transitions
    expect(billingService.isValidSubscriptionTransition('CREATED', 'ACTIVE')).toBe(true);
    expect(billingService.isValidSubscriptionTransition('ACTIVE', 'PAST_DUE')).toBe(true);
    expect(billingService.isValidSubscriptionTransition('ACTIVE', 'CANCELLED')).toBe(true);
    expect(billingService.isValidSubscriptionTransition('PAST_DUE', 'ACTIVE')).toBe(true);

    // Illegal transitions
    expect(billingService.isValidSubscriptionTransition('CANCELLED', 'PAST_DUE')).toBe(false);
    expect(billingService.isValidSubscriptionTransition('EXPIRED', 'ACTIVE')).toBe(false);
  });
});
