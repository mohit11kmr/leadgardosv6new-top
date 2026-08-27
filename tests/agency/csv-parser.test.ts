import { describe, it, expect } from 'vitest';
import { parseRfc4180Csv, CsvProspectSource, MAX_PROSPECT_IMPORT_ROWS } from '../../apps/api/src/services/agency/prospectService.js';

describe('Agency Platform: RFC 4180 CSV Parser & Size Limits', () => {
  it('correctly parses standard, quoted, and escaped-quote fields', () => {
    const csv = `url,businessName,industry,location
https://example1.com,"Apex, Dental & Care",Healthcare,"Austin, TX"
https://example2.com,"The ""Best"" Chiro",Wellness,"New York, NY"
https://example3.com,Simple Site,Tech,Seattle`;

    const rows = parseRfc4180Csv(csv);
    expect(rows.length).toBe(4);
    expect(rows[0]).toEqual(['url', 'businessName', 'industry', 'location']);
    expect(rows[1]).toEqual(['https://example1.com', 'Apex, Dental & Care', 'Healthcare', 'Austin, TX']);
    expect(rows[2]).toEqual(['https://example2.com', 'The "Best" Chiro', 'Wellness', 'New York, NY']);
    expect(rows[3]).toEqual(['https://example3.com', 'Simple Site', 'Tech', 'Seattle']);
  });

  it('handles UTF-8 BOM, empty fields, and multi-line quoted fields', async () => {
    const bomCsv = `\uFEFFurl,businessName,industry,location
https://site1.com,Acme Corp,,Austin
https://site2.com,"Multi-line
Clinic Name",Dental,Dallas`;

    const source = new CsvProspectSource(bomCsv);
    const items = await source.extract();

    expect(items.length).toBe(2);
    expect(items[0]?.url).toBe('https://site1.com');
    expect(items[0]?.businessName).toBe('Acme Corp');
    expect(items[0]?.industry).toBeUndefined(); // Empty field
    expect(items[1]?.businessName).toBe('Multi-line\nClinic Name');
  });

  it('allows 500 rows and strictly rejects 501 rows with IMPORT_ROW_LIMIT_EXCEEDED', async () => {
    // 500 rows
    const rows500 = ['url,businessName'];
    for (let i = 1; i <= MAX_PROSPECT_IMPORT_ROWS; i++) {
      rows500.push(`https://site-${i}.com,Business ${i}`);
    }
    const source500 = new CsvProspectSource(rows500.join('\n'));
    const items500 = await source500.extract();
    expect(items500.length).toBe(500);

    // 501 rows
    const rows501 = ['url,businessName'];
    for (let i = 1; i <= MAX_PROSPECT_IMPORT_ROWS + 1; i++) {
      rows501.push(`https://site-${i}.com,Business ${i}`);
    }
    const source501 = new CsvProspectSource(rows501.join('\n'));
    await expect(source501.extract()).rejects.toThrow(/exceeds the maximum limit of 500/);
  });
});
