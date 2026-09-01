import type { Finding } from './types.js';

export interface AutoFixScript {
  internalKey: string;
  title: string;
  instructions: string;
  /** Copy-paste-able snippet. Contains placeholder tokens (e.g. G-XXXXXXXXXX) the user must fill in — never a fabricated real ID. */
  snippet: string;
  placeholders: string[];
}

type Generator = (finding: Finding) => AutoFixScript;

const GENERATORS: Record<string, Generator> = {
  GA4_MISSING: () => ({
    internalKey: 'GA4_MISSING',
    title: 'Install Google Analytics 4 (GA4)',
    instructions: 'Replace G-XXXXXXXXXX with your real GA4 Measurement ID, then paste this into the <head> of every page.',
    snippet: `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>`,
    placeholders: ['G-XXXXXXXXXX'],
  }),

  GTM_MISSING: () => ({
    internalKey: 'GTM_MISSING',
    title: 'Install Google Tag Manager (GTM)',
    instructions: 'Replace GTM-XXXXXXX with your real GTM Container ID. Paste the first block as high as possible in <head>, and the <noscript> block immediately after the opening <body> tag.',
    snippet: `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-XXXXXXX');</script>
<!-- End Google Tag Manager -->

<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`,
    placeholders: ['GTM-XXXXXXX'],
  }),

  META_PIXEL_MISSING: () => ({
    internalKey: 'META_PIXEL_MISSING',
    title: 'Install Meta (Facebook) Pixel',
    instructions: 'Replace YOUR_PIXEL_ID with your real Meta Pixel ID, then paste this into the <head> of every page.',
    snippet: `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'YOUR_PIXEL_ID');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=YOUR_PIXEL_ID&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->`,
    placeholders: ['YOUR_PIXEL_ID'],
  }),

  WHATSAPP_MISSING: () => ({
    internalKey: 'WHATSAPP_MISSING',
    title: 'Add a floating WhatsApp chat button',
    instructions: 'Replace 91XXXXXXXXXX with your real WhatsApp number in international format (no +, no spaces), then paste before the closing </body> tag.',
    snippet: `<a href="https://wa.me/91XXXXXXXXXX?text=Hi%2C%20I%20have%20an%20inquiry"
   target="_blank" rel="noopener"
   style="position:fixed;bottom:20px;right:20px;z-index:9999;background:#25D366;
   border-radius:50%;width:56px;height:56px;display:flex;align-items:center;
   justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);"
   aria-label="Chat on WhatsApp">
  <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M17.6 6.32A8.86 8.86 0 0 0 12.05 4a8.94 8.94 0 0 0-7.75 13.36L3 21l3.76-1.24a8.9 8.9 0 0 0 4.29 1.1h.01A8.94 8.94 0 0 0 20 11.94a8.87 8.87 0 0 0-2.4-5.62z"/></svg>
</a>`,
    placeholders: ['91XXXXXXXXXX'],
  }),

  CART_LINK_MISSING: () => ({
    internalKey: 'CART_LINK_MISSING',
    title: 'Add a visible cart/checkout link',
    instructions: 'This is a store-configuration change, not a script — verify your e-commerce platform (Shopify/WooCommerce/custom) exposes a working /cart or /checkout link in the main navigation, and that it is reachable from every product page.',
    snippet: `<!-- Example: add to your site navigation -->
<a href="/cart">View Cart</a>`,
    placeholders: [],
  }),
};

const MANUAL_FIX_KEYS = new Set([
  'SEC_HEADER_CSP',
  'SEC_HEADER_HSTS',
  'SEC_HEADER_XFO',
  'SEC_HEADER_XCTO',
  'SEC_HEADER_RP',
  'SEC_HEADER_PP',
  'TLS_ERROR',
  'CART_CHECKOUT_BROKEN',
  'NOINDEX_PAGE',
]);

/**
 * Generates a copy-paste-able fix snippet for a finding, where one genuinely
 * exists (client-side-injectable tracking/CTA code). Findings that require a
 * server-side config change (security headers, TLS, broken routes) are never
 * given a fake "fix script" — they're explicitly reported as not
 * auto-fixable so the UI can point the user to the real remediation path
 * instead of implying a paste-and-done solution that wouldn't work.
 */
export function generateAutoFixScript(finding: Finding): AutoFixScript | null {
  const key = finding.internalKey;
  if (!key) return null;
  const generator = GENERATORS[key];
  if (!generator) return null;
  return generator(finding);
}

export function isAutoFixable(finding: Finding): boolean {
  return Boolean(finding.internalKey && GENERATORS[finding.internalKey]);
}

export function isManualFixRequired(finding: Finding): boolean {
  return Boolean(finding.internalKey && MANUAL_FIX_KEYS.has(finding.internalKey));
}
