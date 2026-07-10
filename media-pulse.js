import fs from 'fs';
import { JSDOM } from 'jsdom';
import path from 'path';

const MONTH_MAP = {
  'janv.': '01', 'janvier': '01',
  'févr.': '02', 'février': '02',
  'mars': '03',
  'avr.': '04', 'avril': '04',
  'mai': '05',
  'juin': '06',
  'juil.': '07', 'juillet': '07',
  'août': '08',
  'sept.': '09', 'septembre': '09',
  'oct.': '10', 'octobre': '10',
  'nov.': '11', 'novembre': '11',
  'déc.': '12', 'décembre': '12'
};

// Allow override of stats path for testing
export function getStatsPath() { return process.env.MP_STATS_PATH || path.join('docs', 'stats.json'); }

export function formatNumber(n) {
  if (n === null || n === undefined) return '';
  if (n < 1_0000) return Math.round(n).toString();
  if (n < 1_000_000) return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (n < 1_000_000_000) {
    const millions = Math.floor(n / 1_000_000);
    if (millions >= 1 && millions < 10) {
      const decimal = (n / 1_000_000).toFixed(1).replace('.0', '');
      return decimal + ' million' + (millions > 1 ? 's' : '');
    }
    return millions + ' million' + (millions > 1 ? 's' : '');
  }
  const milliards = Math.floor(n / 1_000_000_000);
  if (milliards >= 1 && milliards < 10) {
    const decimal = (n / 1_000_000_000).toFixed(1).replace('.0', '');
    return decimal + ' milliard' + (milliards > 1 ? 's' : '');
  }
  return milliards + ' milliard' + (milliards > 1 ? 's' : '');
}

export function getValue(cell) {
  if (!cell) return NaN;
  const text = cell.textContent.replace(/\s/g, '').replace(/\u00A0/g, '');
  return parseInt(text, 10);
}

export function calculateAverages(metrics) {
  const last12Months = metrics.slice(0, 12);
  if (last12Months.length === 0) return { avgVisits: 0, avgPages: 0 };
  return {
    avgVisits: last12Months.reduce((sum, m) => sum + m.visits, 0) / last12Months.length,
    avgPages: last12Months.reduce((sum, m) => sum + m.pages, 0) / last12Months.length
  };
}

export function calculateTotals(metrics) {
  const last12Months = metrics.slice(0, 12);
  return {
    totalVisits: last12Months.reduce((sum, m) => sum + m.visits, 0),
    totalPages: last12Months.reduce((sum, m) => sum + m.pages, 0)
  };
}

async function saveSvg(siteId, svgContent, variant = 'dark') {
  fs.mkdirSync('docs', { recursive: true });
  const filename = variant === 'light' ? `${siteId}-light.svg` : `${siteId}-dark.svg`;
  fs.writeFileSync(path.join('docs', filename), svgContent);
}

function getLastPeriod(period) {
  const [year, month] = period.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
}

async function generateSiteSvgs(site, metrics) {
  if (!metrics || metrics.length === 0) {
    console.log(`⏭ Skipping SVGs for ${site.id} - no data`);
    return;
  }
  let visits, pages, sourceFooter;
  if (metrics.length >= 12) {
    const avg = calculateAverages(metrics);
    visits = avg.avgVisits;
    pages = avg.avgPages;
    sourceFooter = '';
  } else {
    const last = metrics[0];
    visits = last.visits;
    pages = last.pages;
    const date = getLastPeriod(last.period);
    const lastUpdate = new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
    sourceFooter = `Moyenne pour ${date}. Mise à jour: ${lastUpdate}`;
  }
  const logoSvgContent = await loadLogoSvg(site.id, 'dark');
  const logoSvgContentLight = await loadLogoSvg(site.id, 'light');
  const svgContent = generateSVG(site.id, visits, pages, logoSvgContent, false, site.website, sourceFooter);
  const svgContentLight = generateSVG(site.id, visits, pages, logoSvgContentLight, true, site.website, sourceFooter);
  await saveSvg(site.id, svgContent, 'dark');
  await saveSvg(site.id, svgContentLight, 'light');
}

async function loadLogoSvg(siteId, variant = 'dark') {
  const suffix = variant === 'dark' ? '_logo_invert.svg' : '_logo.svg';
  const filePath = path.join(process.cwd(), 'logos', `${siteId}${suffix}`);
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const match = content.match(/<svg[^>]*>[\s\S]*?<\/svg>/i);
    return match ? match[0] : '';
  } catch (error) {
    if (variant === 'dark') {
      return loadLogoSvg(siteId, 'light');
    }
    console.error(`Error loading logo for ${siteId}:`, error.message);
    return '';
  }
}

function extractSvgDimensions(svgContent) {
  if (!svgContent) {
    return { width: 100, height: 100 };
  }
  const widthMatch = svgContent.match(/\swidth="([\d.]+)"/);
  const heightMatch = svgContent.match(/\sheight="([\d.]+)"/);
  const viewBoxMatch = svgContent.match(/\sviewBox="([^"]+)"/);

  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/);
    if (parts.length === 4) {
      return { width: parseFloat(parts[2]), height: parseFloat(parts[3]) };
    }
  }
  return {
    width: widthMatch ? parseFloat(widthMatch[1]) : 100,
    height: heightMatch ? parseFloat(heightMatch[1]) : 100
  };
}

function buildSvgDataUri(logoSvgContent) {
  if (!logoSvgContent) return '';
  const base64Svg = Buffer.from(logoSvgContent).toString('base64');
  return `data:image/svg+xml;base64,${base64Svg}`;
}

function getMetricLabels(avgVisits, avgPages) {
  return {
    visitsLabel: avgVisits > 1000000 ? 'de visiteurs mensuels' : 'visiteurs mensuels',
    vuesLabel: avgPages > 1000000 ? 'de pages vues par mois' : 'pages vues par mois'
  };
}

function buildSvgContent(dataUri, dataWidth, dataHeight, visits, visitsLabel, pages, pagesLabel, isLight = false, header = '', sourceFooter = '') {
  const date = new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
  const footer = sourceFooter || `Moyenne des 12 derniers mois. Mise à jour: ${date}`;

  const bgStart = isLight ? '#f8fafc' : '#0f172a';
  const bgEnd = isLight ? '#e2e8f0' : '#020617';
  const cardStart = isLight ? '#ffffff' : '#111827';
  const cardEnd = isLight ? '#f1f5f9' : '#020617';
  const stroke = isLight ? '#e2e8f0' : '#1f2937';
  const labelFill = isLight ? '#64748b' : '#9ca3af';
  const valueFill = isLight ? '#0f172a' : '#f9fafb';
  const sourceFill = isLight ? '#94a3b8' : '#6b7280';
  const headerFill = isLight ? '#475569' : '#9ca3af';

  return `<svg width="480" height="270" viewBox="0 0 480 270" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgStart}"/>
      <stop offset="100%" stop-color="${bgEnd}"/>
    </linearGradient>
    <linearGradient id="cardGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${cardStart}"/>
      <stop offset="100%" stop-color="${cardEnd}"/>
    </linearGradient>
    <style>
      .header { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: ${headerFill}; font-size: 14px; }
      .value { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: ${valueFill}; font-size: 20px; font-weight: 600; }
      .label { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: ${labelFill}; font-size: 12px; }
      .footer { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: ${sourceFill}; font-size: 11px; }
    </style>
  </defs>
  <rect x="0" y="0" width="480" height="270" fill="url(#bgGradient)" rx="16"/>
  <g transform="translate(20, 20)"><image href="${dataUri}" width="${dataWidth}" height="${dataHeight}"/></g>
  <g transform="translate(20, 100)"><text x="0" y="0" class="header">${header}</text></g>
  <g transform="translate(20, 120)">
    <g>
      <rect width="210" height="70" rx="12" fill="url(#cardGradient)" stroke="${stroke}"/>
      <text x="15" y="30" class="value">${visits}</text>
      <text x="15" y="50" class="label">${visitsLabel}</text>
    </g>
    <g transform="translate(230, 0)">
      <rect width="210" height="70" rx="12" fill="url(#cardGradient)" stroke="${stroke}"/>
      <text x="15" y="30" class="value">${pages}</text>
      <text x="15" y="50" class="label">${pagesLabel}</text>
    </g>
  </g>
  <g transform="translate(0, 200)">
    <text x="240" y="30" class="footer" text-anchor="middle">Source ACPM: classement des sites et applications d'information générale.</text>
    <text x="240" y="44" class="footer" text-anchor="middle">${footer}</text>
  </g>
</svg>`;
}

export function generateSVG(siteId, avgVisits, avgPages, logoSvgContent, isLight = false, header = '', sourceFooter = '') {
  const { width: logoWidth, height: logoHeight } = extractSvgDimensions(logoSvgContent);
  const maxLogoWidth = 400;
  const maxLogoHeight = 50;
  const scale = Math.min(maxLogoWidth / logoWidth, maxLogoHeight / logoHeight);
  const scaledWidth = Math.round(logoWidth * scale);
  const scaledHeight = Math.round(logoHeight * scale);

  const { visitsLabel, vuesLabel } = getMetricLabels(avgVisits, avgPages);
  const dataUri = buildSvgDataUri(logoSvgContent);

  return buildSvgContent(dataUri, scaledWidth, scaledHeight, formatNumber(avgVisits), visitsLabel, formatNumber(avgPages), vuesLabel, isLight, header, sourceFooter);
}

function parsePeriodToISO(periodStr) {
  const lower = periodStr.toLowerCase().trim();
  for (const [month, num] of Object.entries(MONTH_MAP)) {
    if (lower.includes(month)) {
      const yearMatch4 = lower.match(/(\d{4})$/);
      if (yearMatch4) {
        return `${yearMatch4[1]}-${num}`;
      }
      const yearMatch2 = lower.match(/(\d{2})$/);
      if (yearMatch2) {
        const year = yearMatch2[1] >= '90' ? '19' + yearMatch2[1] : '20' + yearMatch2[1];
        return `${year}-${num}`;
      }
    }
  }
  return periodStr;
}

export function parseHTML(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const table = document.querySelector('#detail_diffusion table.support-table');
  const metrics = [];

  if (!table) return { metrics };

  const rows = table.querySelectorAll('tbody tr');

  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (!cells || cells.length < 6) return;

    const periodRaw = cells[0].textContent.trim();
    const visitsCell = cells[1];
    const pagesCell = cells[5];

    if (visitsCell.classList.contains('private-access') || pagesCell.classList.contains('private-access')) {
      return;
    }

    const visits = getValue(visitsCell);
    const pages = getValue(pagesCell);

    if (periodRaw && !isNaN(visits) && !isNaN(pages)) {
      metrics.push({
        period: parsePeriodToISO(periodRaw),
        visits,
        pages
      });
    }
  });

  return { metrics };
}

export async function scrapeSite(site) {
  console.log(`⏭ Scraping: ${site.id} (${site.url})`);

  const response = await fetch(site.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);

  const html = await response.text();
  const { metrics } = parseHTML(html);

  if (metrics.length === 0) throw new Error(`No data rows found for ${site.id}`);

  return {
    id: site.id,
    title: site.title,
    website: site.website,
    url: site.url,
    lastUpdated: new Date().toISOString(),
    metrics
  };
}

export function loadStatsFromJson() {
  const statsPath = getStatsPath();
  if (!fs.existsSync(statsPath)) {
    throw new Error(`Stats file not found: ${statsPath}. Run 'scrape' command first.`);
  }
  return JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
}

export function saveStatsToJson(allData) {
  fs.mkdirSync(path.dirname(getStatsPath()), { recursive: true });
  fs.writeFileSync(getStatsPath(), JSON.stringify(allData, null, 2));
}

export async function generateGroupSvgs(allData) {
  let totalVisits = 0, totalPages = 0;
  for (const site of allData) {
    const { totalVisits: tVisits, totalPages: tPages } = calculateTotals(site.metrics);
    totalVisits += tVisits;
    totalPages += tPages;
  }
  const avgVisits = totalVisits / 12;
  const avgPages = totalPages / 12;

  const logoSvgContent = await loadLogoSvg('lemonde', 'dark');
  const logoSvgContentLight = await loadLogoSvg('lemonde', 'light');
  const svgContent = generateGroupSVG(avgVisits, avgPages, logoSvgContent, allData.length, false);
  const svgContentLight = generateGroupSVG(avgVisits, avgPages, logoSvgContentLight, allData.length, true);
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync(path.join('docs', 'lemonde-group-dark.svg'), svgContent);
  fs.writeFileSync(path.join('docs', 'lemonde-group-light.svg'), svgContentLight);
  console.log('✓ Generated group SVGs for lemonde');
}

export function isDataFresh(lastUpdated) {
  if (!lastUpdated) return false;
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  return new Date(lastUpdated) > oneWeekAgo;
}

export async function runScrapeCommand() {
  const statsPath = getStatsPath();
  let allData = [];

  try {
    if (fs.existsSync(statsPath)) {
      allData = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
    }
    if (allData.length === 0) {
      console.log('No sites configured in stats.json');
      return;
    }
  } catch (e) {
    console.log('No existing stats.json found');
    return;
  }

  for (const site of allData) {
    if (isDataFresh(site.lastUpdated)) {
      console.log(`⏭ Skipping ${site.id} - data from ${site.lastUpdated} is less than a week old`);
      continue;
    }

    try {
      const siteData = await scrapeSite(site);
      const existingIndex = allData.findIndex(s => s.id === site.id);
      if (existingIndex >= 0) {
        const existingMetrics = allData[existingIndex].metrics;
        const newMetrics = siteData.metrics.filter(newM => !existingMetrics.some(oldM => oldM.period === newM.period));
        const combinedMetrics = [...newMetrics, ...existingMetrics].slice(0, 12);
        allData[existingIndex] = {
          ...siteData,
          metrics: combinedMetrics
        };
      } else {
        allData.push(siteData);
      }
      console.log(`✓ Successfully scraped ${site.id}`);
    } catch (error) {
      console.error(`✗ Error scraping ${site.id}:`, error.message);
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  saveStatsToJson(allData);

  console.log('✓ Saved stats.json');

  await runBuildCommand();
}

export async function runBuildCommand() {
  const allData = loadStatsFromJson();

  for (const siteData of allData) {
    if (siteData.metrics && siteData.metrics.length > 0) {
      const site = { id: siteData.id, website: siteData.website };
      await generateSiteSvgs(site, siteData.metrics);
      console.log(`✓ Generated SVGs for ${site.id}`);
    } else {
      console.log(`⏭ Skipping SVGs for ${siteData.id} - no data`);
    }
  }

  const filteredData = allData.filter(site => 
    ['lemonde', 'obs', 'telerama', 'courrier', 'diplo'].includes(site.id)
  );

  if (filteredData.every(s => s.metrics.length >= 12)) {
    await generateGroupSvgs(filteredData);
    console.log('✓ Generated group SVG for Le Monde');
  } else {
    console.log('⏭ Skipping group SVGs - not all sites have 12 months of data');
  }
}

export function generateGroupSVG(avgVisits, avgPages, logoSvgContent, siteCount, isLight = false) {
  const { width: logoWidth, height: logoHeight } = extractSvgDimensions(logoSvgContent);
  const maxLogoWidth = 400;
  const maxLogoHeight = 50;
  const scale = Math.min(maxLogoWidth / logoWidth, maxLogoHeight / logoHeight);
  const scaledWidth = Math.round(logoWidth * scale);
  const scaledHeight = Math.round(logoHeight * scale);
  const { visitsLabel, vuesLabel } = getMetricLabels(avgVisits, avgPages);
  const dataUri = buildSvgDataUri(logoSvgContent);

  return buildSvgContent(dataUri, scaledWidth, scaledHeight, formatNumber(avgVisits), visitsLabel, formatNumber(avgPages), vuesLabel, isLight, "Sur l'ensemble des titres du groupe");
}

const command = process.argv[2];

if (import.meta.url === `file://${process.argv[1]}`) {
  if (command === 'build') {
    runBuildCommand();
  } else {
    runScrapeCommand();
  }
}