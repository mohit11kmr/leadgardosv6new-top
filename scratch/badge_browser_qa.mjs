import { chromium } from 'playwright';

async function verifyBrowserUI() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Test rendering of all badge variants dynamically
  const badgeEvaluation = await page.evaluate(() => {
    const testContainer = document.createElement('div');
    testContainer.id = 'badge-test-container';
    testContainer.style.background = '#111726'; // App surface dark color
    testContainer.style.padding = '20px';

    const variants = [
      'critical', 'high', 'medium', 'low', 'neutral',
      'success', 'info', 'warning', 'purple', 'error',
      'emerald', 'indigo', 'slate'
    ];

    variants.forEach(variant => {
      const span = document.createElement('span');
      span.className = `badge badge-${variant}`;
      span.textContent = variant.toUpperCase();
      testContainer.appendChild(span);
    });

    document.body.appendChild(testContainer);

    const results = variants.map(variant => {
      const el = document.querySelector(`.badge-${variant}`);
      const computed = window.getComputedStyle(el);
      return {
        variant,
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        borderColor: computed.borderColor,
        fontWeight: computed.fontWeight,
      };
    });

    document.body.removeChild(testContainer);
    return results;
  });

  console.log('Badge verification results:');
  console.log(JSON.stringify(badgeEvaluation, null, 2));

  await browser.close();
  console.log('Browser verification completed successfully.');
}

verifyBrowserUI().catch(err => {
  console.error('Browser QA failed:', err);
  process.exit(1);
});
