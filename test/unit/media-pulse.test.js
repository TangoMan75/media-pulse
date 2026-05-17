import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { formatNumber, getValue, parseHTML, calculateAverages, calculateTotals, loadStatsFromJson, saveStatsToJson, SITES, isDataFresh } from '../../media-pulse.js';

describe('formatNumber', () => {
  it('should return string for numbers below 10000', () => {
    assert.strictEqual(formatNumber(9999), '9999');
  });

  it('should format numbers with spaces between 10000 and 999999', () => {
    assert.strictEqual(formatNumber(10000), '10 000');
    assert.strictEqual(formatNumber(123456), '123 456');
  });

  it('should format millions without decimals for >= 10', () => {
    assert.strictEqual(formatNumber(10000000), '10 millions');
    assert.strictEqual(formatNumber(15000000), '15 millions');
  });

  it('should format millions with one decimal for 1-9 millions', () => {
    assert.strictEqual(formatNumber(1500000), '1.5 million');
    assert.strictEqual(formatNumber(2500000), '2.5 millions');
  });

  it('should format billions without decimals for >= 10', () => {
    assert.strictEqual(formatNumber(10000000000), '10 milliards');
  });

  it('should format billions with one decimal for 1-9 billions', () => {
    assert.strictEqual(formatNumber(1500000000), '1.5 milliard');
    assert.strictEqual(formatNumber(2500000000), '2.5 milliards');
  });

  it('should round the input number', () => {
    assert.strictEqual(formatNumber(1500000.7), '1.5 million');
    assert.strictEqual(formatNumber(1500000.4), '1.5 million');
  });
});

describe('getValue', () => {
  it('should return NaN for null', () => {
    assert.strictEqual(getValue(null), NaN);
  });

  it('should return NaN for undefined', () => {
    assert.strictEqual(getValue(undefined), NaN);
  });

  it('should parse simple number', () => {
    const cell = { textContent: '123456' };
    assert.strictEqual(getValue(cell), 123456);
  });

  it('should strip whitespace and non-breaking spaces', () => {
    const cell = { textContent: '  12\u00A0345\u00A0678  ' };
    assert.strictEqual(getValue(cell), 12345678);
  });
});

describe('parseHTML', () => {
  it('should parse HTML with new table structure', () => {
    const html = `
      <div id="detail_diffusion">
        <table class="support-table">
          <tbody>
            <tr>
              <td>Mars 2026</td>
              <td>214316867</td>
              <td></td>
              <td></td>
              <td></td>
              <td>556432131</td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const { metrics } = parseHTML(html);
    assert.strictEqual(metrics.length, 1);
    assert.strictEqual(metrics[0].period, '2026-03');
    assert.strictEqual(metrics[0].visits, 214316867);
    assert.strictEqual(metrics[0].pages, 556432131);
  });

  it('should return empty array for HTML without detail_diffusion table', () => {
    const html = '<table><tr><td>No data</td></tr></table>';
    const { metrics } = parseHTML(html);
    assert.strictEqual(metrics.length, 0);
  });

  it('should skip rows with private-access class', () => {
    const html = `
      <div id="detail_diffusion">
        <table class="support-table">
          <tbody>
            <tr>
              <td>Mars 2026</td>
              <td class="private-access"><div class="private-access__blur">contenu caché</div></td>
              <td></td>
              <td></td>
              <td></td>
              <td class="private-access"><div class="private-access__blur">contenu caché</div></td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const { metrics } = parseHTML(html);
    assert.strictEqual(metrics.length, 0);
  });

  it('should parse multiple visible rows', () => {
    const html = `
      <div id="detail_diffusion">
        <table class="support-table">
          <tbody>
            <tr>
              <td>Mars 2026</td>
              <td>100000</td>
              <td></td>
              <td></td>
              <td></td>
              <td>500000</td>
              <td></td>
              <td></td>
            </tr>
            <tr>
              <td>Février 2026</td>
              <td>110000</td>
              <td></td>
              <td></td>
              <td></td>
              <td>550000</td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const { metrics } = parseHTML(html);
    assert.strictEqual(metrics.length, 2);
  });

  it('should parse full month names with 4-digit year', () => {
    const html = `
      <div id="detail_diffusion">
        <table class="support-table">
          <tbody>
            <tr>
              <td>Janvier 2024</td>
              <td>100000</td>
              <td></td>
              <td></td>
              <td></td>
              <td>500000</td>
              <td></td>
              <td></td>
            </tr>
            <tr>
              <td>Décembre 2023</td>
              <td>110000</td>
              <td></td>
              <td></td>
              <td></td>
              <td>550000</td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const { metrics } = parseHTML(html);
    assert.strictEqual(metrics[0].period, '2024-01');
    assert.strictEqual(metrics[1].period, '2023-12');
  });

  it('should parse 2-digit year format', () => {
    const html = `
      <div id="detail_diffusion">
        <table class="support-table">
          <tbody>
            <tr>
              <td>août 23</td>
              <td>100000</td>
              <td></td>
              <td></td>
              <td></td>
              <td>500000</td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const { metrics } = parseHTML(html);
    assert.strictEqual(metrics[0].period, '2023-08');
  });

  it('should parse real fixture HTML', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'test/fixtures/lemonde-fr.html'), 'utf-8');
    const { metrics } = parseHTML(html);
    assert.strictEqual(metrics.length, 1);
    assert.strictEqual(metrics[0].period, '2026-03');
    assert.strictEqual(metrics[0].visits, 214316867);
    assert.strictEqual(metrics[0].pages, 556432131);
  });
});

describe('calculateAverages', () => {
  it('should calculate average across last 12 months', () => {
    const metrics = Array.from({ length: 12 }, (_, i) => ({
      period: `2024-${String(i + 1).padStart(2, '0')}`,
      visits: 1000000,
      pages: 5000000
    }));
    const { avgVisits, avgPages } = calculateAverages(metrics);
    assert.strictEqual(avgVisits, 1000000);
    assert.strictEqual(avgPages, 5000000);
  });

  it('should handle fewer than 12 months', () => {
    const metrics = [
      { period: '2024-01', visits: 1000000, pages: 5000000 },
      { period: '2024-02', visits: 1100000, pages: 5500000 }
    ];
    const { avgVisits, avgPages } = calculateAverages(metrics);
    assert.strictEqual(avgVisits, 1050000);
    assert.strictEqual(avgPages, 5250000);
  });

  it('should return zeros for empty metrics', () => {
    const { avgVisits, avgPages } = calculateAverages([]);
    assert.strictEqual(avgVisits, 0);
    assert.strictEqual(avgPages, 0);
  });
});

describe('calculateTotals', () => {
  it('should sum last 12 months of metrics', () => {
    const metrics = [
      { period: '2024-01', visits: 1000000, pages: 5000000 },
      { period: '2024-02', visits: 2000000, pages: 10000000 },
      { period: '2024-03', visits: 3000000, pages: 15000000 }
    ];
    const { totalVisits, totalPages } = calculateTotals(metrics);
    assert.strictEqual(totalVisits, 6000000);
    assert.strictEqual(totalPages, 30000000);
  });

  it('should correctly compute group averages when dividing totals by 12', () => {
    const sites = [
      { id: 'site1', metrics: Array.from({ length: 12 }, () => ({ visits: 15000000, pages: 1000000 })) },
      { id: 'site2', metrics: Array.from({ length: 12 }, () => ({ visits: 1000000, pages: 374000000 })) },
      { id: 'site3', metrics: Array.from({ length: 12 }, () => ({ visits: 36000000, pages: 21000000 })) }
    ];
    let totalVisits = 0, totalPages = 0;
    for (const site of sites) {
      const { totalVisits: tVisits, totalPages: tPages } = calculateTotals(site.metrics);
      totalVisits += tVisits;
      totalPages += tPages;
    }
    const avgVisits = totalVisits / 12;
    const avgPages = totalPages / 12;
    assert.strictEqual(avgVisits, 52000000);
    assert.strictEqual(avgPages, 396000000);
  });
});

describe('isDataFresh', () => {
  it('should return false for null', () => {
    assert.strictEqual(isDataFresh(null), false);
  });

  it('should return false for undefined', () => {
    assert.strictEqual(isDataFresh(undefined), false);
  });

  it('should return false for data older than a week', () => {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    assert.strictEqual(isDataFresh(tenDaysAgo.toISOString()), false);
  });

  it('should return true for data less than a week old', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    assert.strictEqual(isDataFresh(yesterday.toISOString()), true);
  });

  it('should return true for data exactly 6 days old', () => {
    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
    assert.strictEqual(isDataFresh(sixDaysAgo.toISOString()), true);
  });

  it('should return false for data exactly 7 days old', () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    assert.strictEqual(isDataFresh(sevenDaysAgo.toISOString()), false);
  });
});