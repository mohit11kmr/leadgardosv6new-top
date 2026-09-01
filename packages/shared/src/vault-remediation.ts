import { detectionKey } from './vault/registry.js';

export interface VaultRemediationGuide {
  detectionKey: string;
  summaryHi: string;
  impactHi: string;
  mitigationSteps: string[];
}

/**
 * LG-039 — VaultGuard AI Remediation: Hinglish fix-guidance per detection
 * key, in the HackerOne-style mini-report shape from
 * docs/VAULTGUARD_ROADMAP.md §6c.3 (Summary / Impact / Mitigation).
 *
 * Deliberately template-based rather than a live per-request AI call: the
 * roadmap's own risk table calls out "AI remediation hallucination" as a
 * risk and names the mitigation as "detect-key-templated suggestions with
 * validation" — this *is* that mitigation. Guidance is the same for every
 * finding of a given detection key, so a static map is both "cached" (zero
 * runtime cost, matches the roadmap's "cached per detection key" spec) and
 * impossible to hallucinate a fake CVE/fact into.
 */
const REMEDIATION_GUIDES: Record<string, Omit<VaultRemediationGuide, 'detectionKey'>> = {
  SEC_DEBUG_MODE: {
    summaryHi:
      'Production server par debug mode ON hai. Isse internal error details, stack traces, aur kabhi-kabhi environment keys tak visitors ko dikh sakte hain.',
    impactHi:
      'Attacker ko aapke server ki internal working, file paths, aur weaknesses pata chal sakti hain — kai baar ye directly database credentials leak karne ya code execution tak le jaata hai.',
    mitigationSteps: [
      'Production environment variable me debug mode OFF karo (e.g. Laravel: APP_DEBUG=false).',
      'Debug/diagnostic endpoints (jaise /_ignition/health-check, /_debug) ko reverse proxy/firewall level par block karo.',
      'Confirm karo ki koi bhi error page stack trace ya internal path publicly show nahi karta.',
    ],
  },
  SEC_ENV_LEAK: {
    summaryHi:
      '.env ya similar config file publicly accessible hai — isme database passwords, API keys, aur secrets ho sakte hain.',
    impactHi:
      'Koi bhi ye file directly download karke aapke database, email, ya third-party service credentials chura sakta hai.',
    mitigationSteps: [
      '.env / .env.backup / config files ko web-root se hata do ya webserver config me deny kar do.',
      'Agar file already public thi, saare secrets (DB password, API keys, JWT secret) turant rotate karo.',
      'Deployment process check karo ki .env file kabhi bhi public directory me copy na ho.',
    ],
  },
  SEC_SERVER_LEAK: {
    summaryHi: 'Server response headers me exact software version (jaise "X-Powered-By: PHP/8.4.24") expose ho raha hai.',
    impactHi: 'Attacker ko pata chal jaata hai ki kaunsa exact software/version chal raha hai, jisse known vulnerabilities target karna aasan ho jaata hai.',
    mitigationSteps: [
      'Server config me version-disclosing headers (X-Powered-By, Server) hata do ya generic bana do.',
      'Web server aur runtime dono ko latest stable, patched version par rakho.',
    ],
  },
  SEC_EXPIRED_CERT: {
    summaryHi: 'SSL/TLS certificate expire ho chuka hai ya jald expire hone wala hai.',
    impactHi: 'Browsers visitors ko "Not Secure"/security warning dikhayenge, aur encrypted connection bhi risk me aa sakta hai — trust aur conversions dono girte hain.',
    mitigationSteps: [
      'Certificate ko turant renew karo (Let\'s Encrypt use kar rahe ho to auto-renewal check karo).',
      'Renewal automation set karo taaki future me expiry na ho.',
    ],
  },
  SEC_WEAK_TLS: {
    summaryHi: 'Server purane, weak TLS versions (1.0/1.1) ya kamzor cipher suites (CBC) allow kar raha hai.',
    impactHi: 'In weak protocols par man-in-the-middle attacks se traffic decrypt kiya ja sakta hai.',
    mitigationSteps: [
      'Server config me sirf TLS 1.2 aur TLS 1.3 enable karo, TLS 1.0/1.1 disable karo.',
      'Modern, strong cipher suites (AEAD jaise AES-GCM) prefer karo, CBC-based weak ciphers hatao.',
    ],
  },
  SEC_MISSING_HSTS: {
    summaryHi: 'HSTS (HTTP Strict Transport Security) header missing ya bahut chhoti max-age ke saath set hai.',
    impactHi: 'Bina HSTS ke, browser pehli baar HTTP par connect ho sakta hai jisse attacker traffic ko HTTP par downgrade karke intercept kar sakta hai.',
    mitigationSteps: [
      'Response header add karo: Strict-Transport-Security: max-age=31536000; includeSubDomains',
      'Confirm karo ki har HTTP request HTTPS par turant redirect hoti hai.',
    ],
  },
  SEC_NO_AUTH_RATE_LIMIT: {
    summaryHi: 'Login form par koi rate-limiting/throttling nahi hai — unlimited login attempts allowed hain.',
    impactHi: 'Attacker automated tools se lakhon password combinations try karke accounts brute-force kar sakta hai.',
    mitigationSteps: [
      'Login endpoint par rate-limiting lagao (e.g. 5 attempts per minute per IP/account).',
      'Failed attempts ke baad temporary lockout ya CAPTCHA add karo.',
      'Login response me "Retry-After" header bhejo taaki legitimate clients ko bhi clear signal mile.',
    ],
  },
  SEC_INSECURE_AUTH_COOKIE: {
    summaryHi: 'Login/session cookie par Secure, HttpOnly, ya SameSite flags missing hain.',
    impactHi: 'Session cookie HTTP par ya JavaScript se chori ho sakti hai, jisse attacker user ka session hijack kar sakta hai.',
    mitigationSteps: [
      'Session/auth cookies par Secure, HttpOnly, aur SameSite=Lax (ya Strict) flags set karo.',
      'Confirm karo ki cookies sirf HTTPS connection par hi bheji jaati hain.',
    ],
  },
  SEC_EXPOSED_BACKUP: {
    summaryHi: 'Backup ya archive file (.zip, .tar.gz, .bak) publicly download-able hai.',
    impactHi: 'Poora source code, database dump, ya config files ek hi file me attacker download kar sakta hai.',
    mitigationSteps: [
      'Backup files ko web-accessible directories se hata do.',
      'Backups ko web-root se bahar, access-controlled storage me rakho.',
    ],
  },
  SEC_DIRECTORY_LISTING: {
    summaryHi: 'Directory listing enabled hai — folder ke andar sab files browser me list ho jaati hain.',
    impactHi: 'Attacker ko hidden/unlinked files (configs, backups, logs) directly dikh jaate hain.',
    mitigationSteps: [
      'Web server config me directory listing (Options -Indexes / autoindex off) disable karo.',
      'Har directory me ek default index file zaroor rakho.',
    ],
  },
  SEC_SOURCE_MAP_LEAK: {
    summaryHi: 'JavaScript source map file (.js.map) production me publicly accessible hai.',
    impactHi: 'Attacker minified code ko original, readable source code me reverse-engineer kar sakta hai — internal logic aur possibly secrets expose ho sakte hain.',
    mitigationSteps: [
      'Production build se source maps generate hi mat karo, ya unhe public serve mat karo.',
      'Agar debugging ke liye zaroori hain, unhe authenticated/internal-only access ke peeche rakho.',
    ],
  },
  SEC_CSP_REPORT: {
    summaryHi: 'Content-Security-Policy header missing ya sirf report-only mode me hai, enforced nahi hai.',
    impactHi: 'XSS jaise attacks ke against ek important browser-level defense layer missing hai.',
    mitigationSteps: [
      'Ek enforced Content-Security-Policy header define karo (report-only se enforced mode me le jaao).',
      'Policy ko apni site ke actual scripts/styles/sources ke hisaab se tightly scope karo.',
    ],
  },
  SEC_POLICY_MALFORMED: {
    summaryHi: 'Security header (jaise Permissions-Policy) galat format me hai ya duplicate values ke saath set hai.',
    impactHi: 'Malformed header browsers dwara ignore ho sakta hai, jisse intended protection kaam hi nahi karti.',
    mitigationSteps: [
      'Header syntax ko spec ke hisaab se fix karo (ek hi header, valid directive syntax).',
      'Browser dev-tools console me header parsing warnings check karo.',
    ],
  },
};

/**
 * Returns the cached Hinglish remediation guide for a VaultGuard detection
 * key, or null if the key is unrecognized (never fabricates guidance for an
 * unknown key).
 */
export function getVaultRemediation(key: string): VaultRemediationGuide | null {
  const guide = REMEDIATION_GUIDES[key];
  if (!guide) return null;
  return { detectionKey: key, ...guide };
}

/**
 * Confirms every registered VaultGuard detection key (packages/shared/src/vault/registry.ts)
 * has a remediation guide — used by a test to catch drift when a new scanner/key is added
 * without corresponding fix guidance.
 */
export function hasRemediationCoverageForAllKnownKeys(knownKeys: string[]): { missing: string[] } {
  const missing = knownKeys.filter((k) => !REMEDIATION_GUIDES[k] && detectionKey(k));
  return { missing };
}
