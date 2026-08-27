import { scanPage } from './apps/worker/src/audit.ts';
const page = {
  url: 'https://example.com/',
  finalUrl: 'https://example.com/',
  statusCode: 200,
  contentType: 'text/html',
  headers: {},
  htmlAvailable: true,
  responseTimeMs: 1,
  depth: 0,
  redirectChain: [],
  html: '<a href="https://wa.me/919876543210">x</a>',
};
const findings = scanPage(page);
const lg001 = findings.filter(f => f.ruleId === 'LG-001');
console.log('LG-001 findings:', JSON.stringify(lg001, null, 2));
