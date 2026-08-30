import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = path.resolve('docs/screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function main() {
  console.log('Starting Vite preview server...');
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: path.resolve('apps/web'),
    stdio: 'pipe',
  });

  preview.stdout.on('data', (d) => console.log(`[Vite Preview] ${d.toString().trim()}`));
  preview.stderr.on('data', (d) => console.error(`[Vite Preview Err] ${d.toString().trim()}`));

  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 2500));

  console.log('Launching browser for responsive QA & screenshots...');
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'homepage_desktop', width: 1440, height: 900 },
    { name: 'homepage_laptop', width: 1024, height: 900 },
    { name: 'homepage_tablet', width: 768, height: 1024 },
    { name: 'homepage_mobile', width: 375, height: 812 },
  ];

  const results = [];
  const consoleErrors = [];

  for (const vp of viewports) {
    console.log(`\nTesting viewport: ${vp.name} (${vp.width}x${vp.height})...`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[${vp.name}] Console Error: ${msg.text()}`);
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Verify Title & Hero presence
    const title = await page.title();
    const heroH1 = await page.textContent('h1');
    console.log(`Page title: "${title}"`);
    console.log(`H1 text: "${heroH1}"`);

    // Check for horizontal overflow
    const overflowInfo = await page.evaluate(() => {
      const docEl = document.documentElement;
      const bodyEl = document.body;
      const scrollW = Math.max(docEl.scrollWidth, bodyEl.scrollWidth);
      const clientW = Math.max(docEl.clientWidth, bodyEl.clientWidth);
      const windowW = window.innerWidth;
      return {
        scrollWidth: scrollW,
        clientWidth: clientW,
        windowWidth: windowW,
        hasHorizontalOverflow: scrollW > clientW,
      };
    });

    console.log(`Overflow evaluation (${vp.name}):`, overflowInfo);

    // Verify Sample Label is visible
    const sampleLabel = await page.locator('text=Sample Diagnostic Report — Illustrative Example — Not Live Customer Data').isVisible();
    console.log(`Sample Diagnostic Label visible: ${sampleLabel}`);

    // Verify 4 Pillars are present
    const leadPillar = await page.locator('text=Lead Capture').first().isVisible();
    const adsPillar = await page.locator('text=Advertising').first().isVisible();
    const seoPillar = await page.locator('text=SEO Hygiene').first().isVisible();
    const secPillar = await page.locator('text=Security & TLS').first().isVisible();
    console.log(`Pillars visible: Lead=${leadPillar}, Ads=${adsPillar}, SEO=${seoPillar}, Sec=${secPillar}`);

    // Capture Full Page Screenshot
    const screenshotPath = path.join(SCREENSHOT_DIR, `${vp.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Captured screenshot: ${screenshotPath}`);

    // Test Calculator on Desktop/Mobile
    if (vp.name === 'homepage_desktop') {
      console.log('Testing interactive revenue calculator...');
      const visitorsSlider = page.locator('#calc-visitors');
      if (await visitorsSlider.isVisible()) {
        await visitorsSlider.fill('35000');
        await page.waitForTimeout(300);
        const calcOutput = await page.locator('text=/ mo').first().textContent();
        console.log(`Recalculated Opportunity Loss text: "${calcOutput}"`);
      }
    }

    results.push({
      viewport: vp.name,
      width: vp.width,
      height: vp.height,
      hasHorizontalOverflow: overflowInfo.hasHorizontalOverflow,
      scrollWidth: overflowInfo.scrollWidth,
      clientWidth: overflowInfo.clientWidth,
      sampleLabelVisible: sampleLabel,
      screenshot: screenshotPath,
    });

    await context.close();
  }

  await browser.close();
  preview.kill();

  console.log('\n========================================');
  console.log('HOMEPAGE RESPONSIVE QA SUMMARY');
  console.log('========================================');
  console.table(results);
  if (consoleErrors.length > 0) {
    console.log('Console Errors:', consoleErrors);
  } else {
    console.log('Console Errors: 0');
  }

  const hasAnyOverflow = results.some((r) => r.hasHorizontalOverflow);
  if (hasAnyOverflow) {
    console.error('FAIL: Horizontal overflow detected on one or more viewports!');
    process.exit(1);
  } else {
    console.log('PASS: All viewports have 0 horizontal overflow and render cleanly.');
  }
}

main().catch((err) => {
  console.error('Browser QA script failed:', err);
  process.exit(1);
});
