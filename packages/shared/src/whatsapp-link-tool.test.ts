import { describe, it, expect } from 'vitest';
import { buildAndValidateWhatsAppLink } from './whatsapp-link-tool.js';

describe('buildAndValidateWhatsAppLink', () => {
  it('builds a valid wa.me link for a clean international number', () => {
    const result = buildAndValidateWhatsAppLink('919876543210', 'Hi, I have an inquiry');
    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.waLink).toBe('https://wa.me/919876543210?text=Hi%2C%20I%20have%20an%20inquiry');
  });

  it('flags a leading-zero number as invalid', () => {
    const result = buildAndValidateWhatsAppLink('0919876543210');
    expect(result.isValid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('LEADING_ZERO');
  });

  it('flags a duplicated country code for IN mode', () => {
    const result = buildAndValidateWhatsAppLink('919191876543210', undefined, 'IN');
    expect(result.isValid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('DUPLICATE_CC');
  });

  it('flags an empty/too-short number as malformed', () => {
    const result = buildAndValidateWhatsAppLink('123');
    expect(result.isValid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('MALFORMED');
  });

  it('builds a link without a text param when no message is given', () => {
    const result = buildAndValidateWhatsAppLink('919876543210');
    expect(result.waLink).toBe('https://wa.me/919876543210');
  });
});
