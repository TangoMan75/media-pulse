import { it } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_PATH = fileURLToPath(new URL('../../media-pulse.js', import.meta.url));
const SUCCESS_HTML = `
  <div id="detail_diffusion">
    <table class="support-table">
      <tbody>
        <tr>
          <td>Octobre 2026</td>
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
const FAILURE_HTML = `
  <div id="detail_diffusion">
    <table class="support-table">
      <tbody></tbody>
    </table>
  </div>
`;

function dataUrl(html) {
  return `data:text/html,${encodeURIComponent(html)}`;
}

function makeStaleSite(id, html) {
  return {
    id,
    title: id,
    website: `https://${id}.example`,
    url: dataUrl(html),
    lastUpdated: '2020-01-01T00:00:00.000Z',
    metrics: [{ period: '2026-03', visits: 1000, pages: 2000 }]
  };
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'media-pulse-'));
}

function runCli(cwd, statsPath) {
  const env = { ...process.env, MP_STATS_PATH: statsPath };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NODE_CHANNEL_') || key === 'NODE_TEST_CONTEXT') {
      delete env[key];
    }
  }

  return spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd,
    encoding: 'utf-8',
    env,
    timeout: 15000
  });
}

it('should exit 1 when a site fails, after scraping the remaining sites', () => {
  const tempDir = makeTempDir();
  const statsPath = path.join(tempDir, 'stats.json');
  fs.writeFileSync(statsPath, JSON.stringify([
    makeStaleSite('lemonde', FAILURE_HTML),
    makeStaleSite('obs', SUCCESS_HTML)
  ]));

  try {
    const result = runCli(tempDir, statsPath);

    assert.strictEqual(result.status, 1, result.stderr);
    assert.match(result.stderr, /Scraping failed for 1 site\(s\): lemonde/);

    const savedData = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
    const obs = savedData.find(site => site.id === 'obs');
    assert.strictEqual(obs.metrics[0].period, '2026-10');
    assert.strictEqual(obs.metrics[0].visits, 100000);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

it('should exit 0 when every site is scraped successfully', () => {
  const tempDir = makeTempDir();
  const statsPath = path.join(tempDir, 'stats.json');
  fs.writeFileSync(statsPath, JSON.stringify([
    makeStaleSite('lemonde', SUCCESS_HTML)
  ]));

  try {
    const result = runCli(tempDir, statsPath);

    assert.strictEqual(result.status, 0, result.stderr);

    const savedData = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
    assert.strictEqual(savedData[0].metrics[0].period, '2026-10');
    assert.strictEqual(savedData[0].metrics[0].visits, 100000);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

it('should exit 1 when stats.json is missing', () => {
  const tempDir = makeTempDir();
  const statsPath = path.join(tempDir, 'missing-stats.json');

  try {
    const result = runCli(tempDir, statsPath);

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /Stats file not found/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
