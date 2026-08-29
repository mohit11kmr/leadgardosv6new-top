const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = '/home/mohit/.gemini/antigravity-ide/brain/6055028e-e92b-4888-8030-70e6fa986f7a/screenshots';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE_URL = 'http://localhost:5173';

async function runComprehensiveAudit() {
  console.log('====================================================');
  console.log('LEADGUARD OS V6 — PHASE 1B REAL BROWSER VERIFICATION');
  console.log('====================================================');
  console.log(`Target URL: ${BASE_URL}`);
  console.log('Browser Binary: /usr/bin/google-chrome');

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1440,900'
    ]
  });

  const results = [];
  const interactionResults = {};

  // 1. Static Route Sweeps across viewports
  const standardRoutes = [
    { path: '/', name: 'public_homepage', category: 'PUBLIC', viewports: ['1440x900', '1024x900', '768x1024', '375x812'] },
    { path: '/login', name: 'public_login', category: 'PUBLIC', viewports: ['1440x900', '768x1024', '375x812'] },
    { path: '/register', name: 'public_register', category: 'PUBLIC', viewports: ['1440x900', '768x1024', '375x812'] },
    { path: '/password-reset', name: 'public_password_reset', category: 'PUBLIC', viewports: ['1440x900'] },
    { path: '/checkout/express-fix', name: 'public_express_fix_checkout', category: 'PUBLIC', viewports: ['1440x900', '375x812'] },
    { path: '/privacy', name: 'public_privacy_policy', category: 'PUBLIC', viewports: ['1440x900'] },
    { path: '/terms', name: 'public_terms_of_service', category: 'PUBLIC', viewports: ['1440x900'] },
    { path: '/cookies', name: 'public_cookie_policy', category: 'PUBLIC', viewports: ['1440x900'] },
    { path: '/refund', name: 'public_refund_policy', category: 'PUBLIC', viewports: ['1440x900'] },
    { path: '/scan/demo-audit-sample', name: 'public_scan_result_view', category: 'PUBLIC DATA FLOW', viewports: ['1440x900'] },
    { path: '/dashboard', name: 'protected_dashboard', category: 'PRODUCT', viewports: ['1440x900'] },
    { path: '/websites', name: 'protected_websites', category: 'PRODUCT', viewports: ['1440x900'] },
    { path: '/audits', name: 'protected_audits', category: 'PRODUCT', viewports: ['1440x900'] },
    { path: '/reports', name: 'protected_reports', category: 'PRODUCT', viewports: ['1440x900'] },
    { path: '/monitoring', name: 'protected_monitoring', category: 'PRODUCT', viewports: ['1440x900'] },
    { path: '/billing', name: 'protected_billing', category: 'PRODUCT', viewports: ['1440x900'] },
    { path: '/settings', name: 'protected_settings', category: 'PRODUCT', viewports: ['1440x900'] },
    { path: '/security/sessions', name: 'protected_sessions', category: 'PRODUCT', viewports: ['1440x900'] },
    { path: '/agency', name: 'protected_agency', category: 'AGENCY', viewports: ['1440x900'] },
    { path: '/agency/clients', name: 'protected_agency_clients', category: 'AGENCY', viewports: ['1440x900'] },
    { path: '/agency/prospects', name: 'protected_agency_prospects', category: 'AGENCY', viewports: ['1440x900'] },
    { path: '/agency/widgets', name: 'protected_agency_widgets', category: 'AGENCY', viewports: ['1440x900'] },
    { path: '/agency/competitors', name: 'protected_agency_competitors', category: 'AGENCY', viewports: ['1440x900'] },
    { path: '/developer', name: 'protected_developer', category: 'DEVELOPER', viewports: ['1440x900'] },
    { path: '/developer/api-keys', name: 'protected_api_keys', category: 'DEVELOPER', viewports: ['1440x900'] },
    { path: '/developer/webhooks', name: 'protected_webhooks', category: 'DEVELOPER', viewports: ['1440x900'] },
    { path: '/admin', name: 'protected_admin', category: 'ADMIN', viewports: ['1440x900'] },
    { path: '/admin/users', name: 'protected_admin_users', category: 'ADMIN', viewports: ['1440x900'] },
    { path: '/admin/organizations', name: 'protected_admin_orgs', category: 'ADMIN', viewports: ['1440x900'] },
    { path: '/admin/audit', name: 'protected_admin_audit', category: 'ADMIN', viewports: ['1440x900'] },
  ];

  for (const item of standardRoutes) {
    for (const vpStr of item.viewports) {
      const [w, h] = vpStr.split('x').map(Number);
      const context = await browser.newContext({
        viewport: { width: w, height: h }
      });
      const page = await context.newPage();

      const consoleErrors = [];
      const consoleWarnings = [];
      const failedRequests = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
        else if (msg.type() === 'warning') consoleWarnings.push(msg.text());
      });

      page.on('requestfailed', (req) => {
        failedRequests.push({
          url: req.url(),
          method: req.method(),
          errorText: req.failure()?.errorText || 'Unknown failure'
        });
      });

      const startTime = Date.now();
      let statusCode = 200;
      let finalUrl = '';
      let title = '';
      let visibleError = null;
      let responsiveIssues = [];

      try {
        const target = `${BASE_URL}${item.path}`;
        const resp = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 8000 });
        if (resp) statusCode = resp.status();
        await page.waitForTimeout(500);

        finalUrl = page.url();
        title = await page.title();

        // Check for visible error banner
        const errorEl = await page.$('.errorBanner, .authError, .emptyState, [role="alert"]');
        if (errorEl) {
          visibleError = await errorEl.innerText().catch(() => null);
        }

        // Check horizontal overflow
        const hasHorizontalOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        if (hasHorizontalOverflow) {
          responsiveIssues.push(`Horizontal scroll overflow detected (scrollWidth > innerWidth at ${vpStr})`);
        }

        const filename = `${item.name}_${vpStr}.png`;
        const screenshotPath = path.join(SCREENSHOT_DIR, filename);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        const isRedirected = finalUrl !== `${BASE_URL}${item.path}` && !finalUrl.endsWith(item.path);
        const reachedTarget = !isRedirected;

        results.push({
          path: item.path,
          name: item.name,
          category: item.category,
          viewport: vpStr,
          targetUrl: target,
          finalUrl,
          title,
          statusCode,
          durationMs: Date.now() - startTime,
          isRedirectedToLogin: isRedirected && finalUrl.includes('/login'),
          authenticatedInspected: reachedTarget && item.category !== 'PUBLIC' && item.category !== 'PUBLIC DATA FLOW',
          screenshotPath,
          consoleErrors,
          consoleWarnings,
          failedRequests,
          visibleError,
          responsiveIssues,
          notes: isRedirected ? `Redirected to ${finalUrl}` : `Directly rendered (${statusCode})`
        });

        console.log(`[PASS] ${item.path} [${vpStr}] -> ${finalUrl} (${Date.now() - startTime}ms)`);
      } catch (err) {
        console.error(`[FAIL] ${item.path} [${vpStr}]:`, err.message);
        results.push({
          path: item.path,
          name: item.name,
          category: item.category,
          viewport: vpStr,
          error: err.message
        });
      } finally {
        await context.close();
      }
    }
  }

  // 2. Deep Real Interaction Tests
  console.log('\n--- EXECUTING INTERACTIVE USER FLOWS ---');

  // Flow A: Homepage Scanner Interaction
  {
    console.log('Testing Flow A: Homepage Scanner Interaction');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      // 1. Submit with empty input
      const scanBtn = await page.$('button.quickAuditBtn, button[type="submit"]');
      const urlInput = await page.$('input[placeholder*="domain"], input.quickAuditInput');
      
      let emptySubmitBlocked = false;
      if (scanBtn && urlInput) {
        await urlInput.fill('');
        await scanBtn.click();
        await page.waitForTimeout(300);
        const val = await page.evaluate((el) => el.validationMessage, urlInput);
        emptySubmitBlocked = Boolean(val);
      }

      // 2. Submit with invalid URL
      if (urlInput && scanBtn) {
        await urlInput.fill('not-a-valid-url');
        await scanBtn.click();
        await page.waitForTimeout(500);
      }

      // 3. Submit valid URL format
      if (urlInput && scanBtn) {
        await urlInput.fill('https://example.com');
        await scanBtn.click();
        await page.waitForTimeout(800);
      }

      const postSubmitUrl = page.url();
      const homepageInteractionShot = path.join(SCREENSHOT_DIR, 'interaction_homepage_scan_submit.png');
      await page.screenshot({ path: homepageInteractionShot, fullPage: true });

      interactionResults.homepageScan = {
        emptySubmitBlocked,
        postSubmitUrl,
        screenshot: homepageInteractionShot,
        behavior: postSubmitUrl.includes('/scan/') ? 'Successfully initiated scan flow' : `Stayed at ${postSubmitUrl}`
      };
      console.log('Flow A Result:', interactionResults.homepageScan);
    } catch (e) {
      interactionResults.homepageScan = { error: e.message };
    } finally {
      await context.close();
    }
  }

  // Flow B: Login Form Interaction & Validation
  {
    console.log('Testing Flow B: Login Form Validation & Invalid Submission');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      const emailInput = await page.$('input[type="email"]');
      const passwordInput = await page.$('input[type="password"]');
      const submitBtn = await page.$('button[type="submit"]');

      // Pre-filled credentials detection
      const initialEmail = emailInput ? await emailInput.inputValue() : null;
      const initialPass = passwordInput ? await passwordInput.inputValue() : null;

      // Submit invalid credentials
      if (emailInput && passwordInput && submitBtn) {
        await emailInput.fill('nonexistent@user.com');
        await passwordInput.fill('WrongPassword123!');
        await submitBtn.click();
        await page.waitForTimeout(1000);
      }

      const loginErrorEl = await page.$('.authError');
      const visibleErrorText = loginErrorEl ? await loginErrorEl.innerText() : null;

      const loginShot = path.join(SCREENSHOT_DIR, 'interaction_login_invalid_submit.png');
      await page.screenshot({ path: loginShot, fullPage: true });

      interactionResults.loginValidation = {
        prefilledEmail: initialEmail,
        prefilledPasswordPresent: Boolean(initialPass),
        visibleErrorText,
        screenshot: loginShot
      };
      console.log('Flow B Result:', interactionResults.loginValidation);
    } catch (e) {
      interactionResults.loginValidation = { error: e.message };
    } finally {
      await context.close();
    }
  }

  // Flow C: Registration Form Interaction & Validation
  {
    console.log('Testing Flow C: Registration Form Interaction');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/register`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      const orgInput = await page.$('input[placeholder*="Acme"], input[name="orgName"]');
      const emailInput = await page.$('input[type="email"]');
      const passwordInput = await page.$('input[type="password"]');
      const submitBtn = await page.$('button[type="submit"]');

      if (emailInput && passwordInput && submitBtn) {
        await emailInput.fill('test-registration@domain.test');
        await passwordInput.fill('Short');
        if (orgInput) await orgInput.fill('Test Agency Workspace');
        await submitBtn.click();
        await page.waitForTimeout(1000);
      }

      const regErrorEl = await page.$('.authError');
      const regError = regErrorEl ? await regErrorEl.innerText() : null;

      const regShot = path.join(SCREENSHOT_DIR, 'interaction_register_submit.png');
      await page.screenshot({ path: regShot, fullPage: true });

      interactionResults.registerValidation = {
        submittedInvalidPass: 'Short',
        visibleError: regError,
        screenshot: regShot
      };
      console.log('Flow C Result:', interactionResults.registerValidation);
    } catch (e) {
      interactionResults.registerValidation = { error: e.message };
    } finally {
      await context.close();
    }
  }

  // Flow D: Password Reset Flow
  {
    console.log('Testing Flow D: Password Reset Form');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/password-reset`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      const emailInput = await page.$('input[type="email"]');
      const submitBtn = await page.$('button[type="submit"]');

      if (emailInput && submitBtn) {
        await emailInput.fill('forgot@example.com');
        await submitBtn.click();
        await page.waitForTimeout(1000);
      }

      const resetShot = path.join(SCREENSHOT_DIR, 'interaction_password_reset_submit.png');
      await page.screenshot({ path: resetShot, fullPage: true });

      const successMsg = await page.$('.authSuccessMessage, .authError');
      const msgText = successMsg ? await successMsg.innerText() : null;

      interactionResults.passwordReset = {
        message: msgText,
        screenshot: resetShot
      };
      console.log('Flow D Result:', interactionResults.passwordReset);
    } catch (e) {
      interactionResults.passwordReset = { error: e.message };
    } finally {
      await context.close();
    }
  }

  // Flow E: Express Fix Checkout Flow Inspection
  {
    console.log('Testing Flow E: Express Fix Checkout Rendering & Interaction');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/checkout/express-fix?websiteId=web_123&auditId=aud_456`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      const priceText = await page.evaluate(() => {
        return document.body.innerText.match(/₹[\d,]+/g) || [];
      });

      const checkoutShot = path.join(SCREENSHOT_DIR, 'interaction_express_fix_with_params.png');
      await page.screenshot({ path: checkoutShot, fullPage: true });

      interactionResults.expressFix = {
        displayedPrices: priceText,
        screenshot: checkoutShot
      };
      console.log('Flow E Result:', interactionResults.expressFix);
    } catch (e) {
      interactionResults.expressFix = { error: e.message };
    } finally {
      await context.close();
    }
  }

  await browser.close();

  const finalReport = {
    timestamp: new Date().toISOString(),
    engine: 'Google Chrome /usr/bin/google-chrome via @playwright/test@1.62.1',
    baseUrl: BASE_URL,
    totalRoutesChecked: results.length,
    results,
    interactionResults
  };

  fs.writeFileSync(
    '/home/mohit/.gemini/antigravity-ide/brain/6055028e-e92b-4888-8030-70e6fa986f7a/browser_audit_results.json',
    JSON.stringify(finalReport, null, 2)
  );

  console.log('\n====================================================');
  console.log('BROWSER AUDIT COMPLETE. SAVED TO browser_audit_results.json');
  console.log('====================================================');
}

runComprehensiveAudit().catch(console.error);
