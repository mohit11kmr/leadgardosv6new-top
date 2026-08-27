import { describe, it, expect } from 'vitest';
import { ClaimValidator, type VerifiedContext, type RawPitchOutput } from '@leadguard/shared';

describe('Phase 7.2 — ClaimValidator & Anti-Hallucination Hardening', () => {
  const sampleContextWithFindings: VerifiedContext = {
    domain: 'example.com',
    businessName: 'Example Corp',
    industry: 'SaaS',
    leadScore: 62,
    criticalFindingsCount: 1,
    highFindingsCount: 1,
    verifiedFindings: [
      {
        id: 'finding-1',
        title: 'Missing SSL Certificate',
        category: 'SECURITY',
        severity: 'CRITICAL',
        featureId: 'ssl_check',
      },
      {
        id: 'finding-2',
        title: 'Broken Lead Form Action',
        category: 'CONVERSION',
        severity: 'HIGH',
        featureId: 'form_action',
      },
    ],
  };

  it('correctly validates and maps explicit claims to finding IDs', () => {
    const rawPitch: RawPitchOutput = {
      subject: 'Urgent: Missing SSL Certificate on example.com',
      opening: 'Hi Example Corp team, we checked example.com.',
      problem: 'We discovered a Missing SSL Certificate and Broken Lead Form Action during testing.',
      businessImpact: 'This reduced conversion score to 62/100.',
      recommendation: 'Fix the Broken Lead Form Action immediately.',
      callToAction: 'Can we schedule a 10 min call?',
    };

    const result = ClaimValidator.validateAndSanitize(rawPitch, sampleContextWithFindings);

    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('VERIFIED_FINDINGS');
    expect(result.claimReferences.length).toBeGreaterThan(0);

    const findingClaim = result.claimReferences.find((c) => c.sourceType === 'FINDING');
    expect(findingClaim).toBeDefined();
    expect(findingClaim?.qualifier).toBe('OBSERVED');
  });

  it('sanitizes fabricated currency numbers and conversion statistics not in context', () => {
    const rawPitch: RawPitchOutput = {
      subject: 'Losing ₹2,50,000 every month on example.com',
      opening: 'Hi team, your 50 employees are losing 35% conversion daily.',
      problem: 'We observed Missing SSL Certificate costing $10,000 monthly.',
      businessImpact: 'You are losing ₹50,000 per month due to this flaw.',
      recommendation: 'Fix SSL to regain 25% conversion.',
      callToAction: 'Book a call today.',
    };

    const result = ClaimValidator.validateAndSanitize(rawPitch, sampleContextWithFindings);

    expect(result.sanitizedPitch.problem).not.toContain('$10,000');
    expect(result.sanitizedPitch.businessImpact).not.toContain('₹50,000');
    expect(result.violations.some((v) => v.includes('currency claim') || v.includes('numeric metric'))).toBe(true);
  });

  it('forces neutral mode and replaces unsubstantiated problem claims when verified findings are 0', () => {
    const zeroFindingsContext: VerifiedContext = {
      domain: 'clean-site.com',
      businessName: 'Clean Site Inc',
      industry: 'E-commerce',
      leadScore: 90,
      criticalFindingsCount: 0,
      highFindingsCount: 0,
      verifiedFindings: [],
    };

    const hallucinatedPitch: RawPitchOutput = {
      subject: 'Critical problems found on clean-site.com',
      opening: 'Hi team,',
      problem: 'We identified the following critical technical flaws on clean-site.com.',
      businessImpact: 'Your conversion is damaged.',
      recommendation: 'Fix these bugs now.',
      callToAction: 'Reach out to discuss.',
    };

    const result = ClaimValidator.validateAndSanitize(hallucinatedPitch, zeroFindingsContext);

    expect(result.mode).toBe('NEUTRAL_ANALYSIS');
    expect(result.sanitizedPitch.problem).toContain('LeadGuard reviewed the available diagnostic baseline data');
    expect(result.sanitizedPitch.problem).not.toContain('We identified the following critical technical flaws');
    expect(result.claimReferences.some((c) => c.sourceType === 'SCORE')).toBe(true);
  });

  it('strips malicious HTML and script tags from pitch fields', () => {
    const maliciousPitch: RawPitchOutput = {
      subject: '<script>alert(1)</script>Audit Report for example.com',
      opening: '<img src=x onerror="steal()">Hello team,',
      problem: 'Identified Missing SSL Certificate on the site.',
      businessImpact: 'Score is 62/100.',
      recommendation: '<a href="javascript:attack()">Click here</a> to fix.',
      callToAction: 'Let us connect.',
    };

    const result = ClaimValidator.validateAndSanitize(maliciousPitch, sampleContextWithFindings);

    expect(result.sanitizedPitch.subject).not.toContain('<script>');
    expect(result.sanitizedPitch.opening).not.toContain('<img');
    expect(result.sanitizedPitch.recommendation).not.toContain('javascript:');
  });
});
