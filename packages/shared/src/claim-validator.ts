export interface ClaimReference {
  claim: string;
  sourceType: 'FINDING' | 'SCORE' | 'ASSUMPTION' | 'GENERAL_DIAGNOSTIC';
  findingId?: string;
  featureId?: string;
  category?: string;
  metric?: string;
  qualifier: 'OBSERVED' | 'ESTIMATED' | 'ASSUMED';
}

export interface VerifiedContext {
  domain: string;
  businessName?: string | null;
  industry?: string | null;
  leadScore: number;
  criticalFindingsCount: number;
  highFindingsCount: number;
  verifiedFindings: Array<{
    id: string;
    title: string;
    category: string;
    severity: string;
    featureId?: string;
  }>;
  assumptions?: string[];
}

export interface RawPitchOutput {
  subject: string;
  opening: string;
  problem: string;
  businessImpact: string;
  recommendation: string;
  callToAction: string;
}

export interface ValidatedPitchResult {
  isValid: boolean;
  sanitizedPitch: RawPitchOutput;
  content: string;
  claimReferences: ClaimReference[];
  mode: 'VERIFIED_FINDINGS' | 'NEUTRAL_ANALYSIS';
  violations: string[];
}

export class ClaimValidator {
  // Regex to catch ungrounded fabricated currency figures (e.g., ₹50,000, $10k, Rs 25000)
  private static CURRENCY_REGEX = /(?:₹|rs\.?|inr|\$|usd|€|£)\s*\d+[\d,.]*(?:\s*(?:k|lakh|crore|million|billion|per month|\/mo))?/gi;
  // Regex to catch fabricated employee or conversion stats (e.g. 50 employees, 25% drop)
  private static FABRICATED_STATS_REGEX = /\b(?:\d+%\s*(?:conversion|traffic|revenue|drop|loss|growth)|\d+\s*(?:employees|staff|visitors|leads\/day))\b/gi;
  // Regex for HTML/Script tags
  private static HTML_SCRIPT_REGEX = /<[^>]*>|javascript:|data:/gi;

  static validateAndSanitize(raw: RawPitchOutput, context: VerifiedContext): ValidatedPitchResult {
    const violations: string[] = [];
    const claimReferences: ClaimReference[] = [];

    // 1. Basic Structure & Length Validation
    const sanitizeField = (text: string, maxLen: number, fieldName: string): string => {
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        violations.push(`${fieldName} is empty or missing`);
        return '';
      }
      let cleaned = text.replace(this.HTML_SCRIPT_REGEX, '').trim();
      if (cleaned.length > maxLen) {
        cleaned = cleaned.slice(0, maxLen);
      }
      return cleaned;
    };

    let subject = sanitizeField(raw.subject, 200, 'subject');
    let opening = sanitizeField(raw.opening, 1000, 'opening');
    let problem = sanitizeField(raw.problem, 1500, 'problem');
    let businessImpact = sanitizeField(raw.businessImpact, 1500, 'businessImpact');
    let recommendation = sanitizeField(raw.recommendation, 1500, 'recommendation');
    let callToAction = sanitizeField(raw.callToAction, 500, 'callToAction');

    const hasVerifiedFindings = context.verifiedFindings.length > 0;
    const mode: 'VERIFIED_FINDINGS' | 'NEUTRAL_ANALYSIS' = hasVerifiedFindings ? 'VERIFIED_FINDINGS' : 'NEUTRAL_ANALYSIS';

    // 2. Numeric Claim Control: Check for fabricated currency or stats not in context
    const checkNumericHallucinations = (text: string, fieldName: string): string => {
      let result = text;
      const currencyMatches = text.match(this.CURRENCY_REGEX);
      if (currencyMatches) {
        for (const match of currencyMatches) {
          // If the match does not appear in verified context or assumptions
          const isKnown = context.assumptions?.some((a) => a.includes(match));
          if (!isKnown) {
            violations.push(`Unverified currency claim '${match}' in ${fieldName} sanitized`);
            result = result.replace(match, '[diagnostic estimate]');
          }
        }
      }

      const statMatches = text.match(this.FABRICATED_STATS_REGEX);
      if (statMatches) {
        for (const match of statMatches) {
          const isKnown = context.assumptions?.some((a) => a.includes(match));
          if (!isKnown) {
            violations.push(`Unverified numeric metric '${match}' in ${fieldName} sanitized`);
            result = result.replace(match, '[estimated variance]');
          }
        }
      }
      return result;
    };

    problem = checkNumericHallucinations(problem, 'problem');
    businessImpact = checkNumericHallucinations(businessImpact, 'businessImpact');

    // 3. Finding Claim Mapping
    if (hasVerifiedFindings) {
      // Map explicit claims to matching finding IDs
      for (const finding of context.verifiedFindings) {
        const titleWords = finding.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        const matchesProblem = titleWords.some((w) => problem.toLowerCase().includes(w));
        const matchesRecommendation = titleWords.some((w) => recommendation.toLowerCase().includes(w));

        if (matchesProblem || matchesRecommendation) {
          claimReferences.push({
            claim: `Identified flaw: ${finding.title}`,
            sourceType: 'FINDING',
            findingId: finding.id,
            featureId: finding.featureId,
            category: finding.category,
            qualifier: 'OBSERVED',
          });
        }
      }

      // If no specific finding matched textual search, attach top finding as primary claim
      if (claimReferences.length === 0 && context.verifiedFindings[0]) {
        const top = context.verifiedFindings[0];
        claimReferences.push({
          claim: `Verified primary diagnostic issue: ${top.title}`,
          sourceType: 'FINDING',
          findingId: top.id,
          featureId: top.featureId,
          category: top.category,
          qualifier: 'OBSERVED',
        });
      }
    } else {
      // Neutral mode: Ensure pitch doesn't claim "we identified specific flaw" when findings are empty
      if (/we\s+(?:identified|discovered|found|verified|observed|detected)|(?:critical|technical)\s+(?:flaws|issues|bottlenecks|problems)|flaws\s+on/i.test(problem)) {
        problem = `LeadGuard reviewed the available diagnostic baseline data for ${context.domain}. While no critical individual flaw was isolated, overall conversion readiness stands at ${context.leadScore}/100.`;
      }

      claimReferences.push({
        claim: `Diagnostic readiness baseline evaluation: ${context.leadScore}/100`,
        sourceType: 'SCORE',
        metric: 'leadScore',
        qualifier: 'OBSERVED',
      });
    }

    // Attach Score Reference
    claimReferences.push({
      claim: `Overall Diagnostic Conversion Score: ${context.leadScore}/100`,
      sourceType: 'SCORE',
      metric: 'leadScore',
      qualifier: 'OBSERVED',
    });

    // Attach Assumptions if provided
    if (context.assumptions) {
      for (const assumption of context.assumptions) {
        claimReferences.push({
          claim: assumption,
          sourceType: 'ASSUMPTION',
          qualifier: 'ASSUMED',
        });
      }
    }

    const sanitizedPitch: RawPitchOutput = {
      subject,
      opening,
      problem,
      businessImpact,
      recommendation,
      callToAction,
    };

    const content = `${subject}\n\n${opening}\n\n${problem}\n\n${businessImpact}\n\n${recommendation}\n\n${callToAction}`;

    return {
      isValid: violations.filter((v) => v.includes('empty or missing')).length === 0,
      sanitizedPitch,
      content,
      claimReferences,
      mode,
      violations,
    };
  }
}
