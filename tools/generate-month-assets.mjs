#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  const require = createRequire(import.meta.url);
  sharp = require('C:/Users/nicol/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
}

const OUT_DIR = path.resolve('assets/generated/month-01');
const CALENDAR = path.resolve('22-calendario-organico-30-dias.csv');
const W = 1080;
const H = 1920;

const palette = {
  ink: '#111418',
  paper: '#f4f1e8',
  white: '#ffffff',
  blue: '#1c6dd0',
  green: '#16a36a',
  orange: '#f08a24',
  red: '#d94f38',
  graphite: '#252a31',
  line: '#d7d1c2',
};

const accentByPillar = {
  'Perdida de leads': palette.green,
  'Demo de flujo': palette.blue,
  'Errores': palette.red,
  'Framework': palette.orange,
  'Nicho inmobiliario': palette.green,
  'Construccion en publico': palette.orange,
  'Oferta': palette.blue,
};

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

async function readCalendar() {
  const raw = await fs.readFile(CALENDAR, 'utf8');
  const [headerLine, ...rows] = raw.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return rows.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function escapeXml(input) {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function wrap(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textLines(lines, { x, y, size, fill, weight = 800, lineHeight = 1.08 }) {
  return lines.map((line, index) => (
    `<text x="${x}" y="${y + index * size * lineHeight}" font-family="Montserrat, Arial, sans-serif" ` +
    `font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
  )).join('\n');
}

function chip(text, x, y, accent) {
  const width = Math.max(180, text.length * 15 + 42);
  return `
  <rect x="${x}" y="${y}" width="${width}" height="58" rx="29" fill="${accent}"/>
  <text x="${x + 24}" y="${y + 38}" font-family="Montserrat, Arial, sans-serif" font-size="22" font-weight="900" fill="${palette.white}">${escapeXml(text)}</text>`;
}

function svg(row) {
  const accent = accentByPillar[row.pilar] ?? palette.green;
  const titleLines = wrap(row.hook.replace(/:$/, ''), 18).slice(0, 5);
  const ideaLines = wrap(row.idea, 26).slice(0, 4);
  const day = String(row.dia).padStart(2, '0');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${palette.paper}"/>
  <path d="M0 1450 C250 1320 480 1640 1080 1320 L1080 1920 L0 1920 Z" fill="${accent}" opacity="0.16"/>
  <path d="M650 0 L1080 0 L1080 680 C920 540 780 280 650 0 Z" fill="${palette.ink}" opacity="0.06"/>
  <rect x="70" y="74" width="940" height="1770" rx="44" fill="none" stroke="${palette.ink}" stroke-width="6"/>
  ${chip(`DIA ${day}`, 96, 112, accent)}
  ${chip(row.pilar.toUpperCase(), 96, 194, palette.ink)}
  <text x="96" y="336" font-family="Montserrat, Arial, sans-serif" font-size="38" font-weight="900" fill="${palette.ink}">LeadOps AI</text>
  <text x="96" y="384" font-family="Montserrat, Arial, sans-serif" font-size="25" font-weight="700" fill="${palette.graphite}">IA comercial para inmobiliarias</text>
  <circle cx="930" cy="190" r="42" fill="${accent}"/>
  <path d="M910 190h40M930 170v40" stroke="${palette.white}" stroke-width="8" stroke-linecap="round"/>
  <path d="M96 448 H984" stroke="${palette.line}" stroke-width="2"/>
  ${textLines(titleLines, { x: 96, y: 620, size: 72, fill: palette.ink, weight: 900, lineHeight: 1.02 })}
  <rect x="96" y="1120" width="888" height="278" rx="34" fill="${palette.white}" stroke="${palette.line}" stroke-width="3"/>
  ${textLines(ideaLines, { x: 132, y: 1212, size: 38, fill: palette.graphite, weight: 800, lineHeight: 1.12 })}
  <rect x="96" y="1514" width="888" height="154" rx="34" fill="${palette.ink}"/>
  <text x="540" y="1612" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="52" font-weight="900" fill="${palette.white}">${escapeXml(row.cta)}</text>
  <text x="96" y="1762" font-family="Montserrat, Arial, sans-serif" font-size="25" font-weight="800" fill="${palette.graphite}">@leadopsai</text>
  <text x="984" y="1762" text-anchor="end" font-family="Montserrat, Arial, sans-serif" font-size="25" font-weight="800" fill="${palette.graphite}">${escapeXml(row.formato)}</text>
</svg>`;
}

async function main() {
  await fs.mkdir(path.join(OUT_DIR, 'vertical'), { recursive: true });
  const rows = await readCalendar();
  const manifest = [];

  for (const row of rows) {
    const day = String(row.dia).padStart(2, '0');
    const slug = `day-${day}-${row.pilar.toLowerCase().replaceAll(' ', '-')}`;
    const content = svg(row);
    const base = path.join(OUT_DIR, 'vertical', slug);
    await fs.writeFile(`${base}.svg`, content, 'utf8');
    await sharp(Buffer.from(content)).png().resize(W, H).toFile(`${base}.png`);
    manifest.push({
      day: row.dia,
      platform: row.canal_principal,
      format: row.formato,
      file: `assets/generated/month-01/vertical/${slug}.png`,
      hook: row.hook,
      cta: row.cta,
    });
  }

  await fs.writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), assets: manifest }, null, 2), 'utf8');
  const csv = [
    'day,platform,format,file,hook,cta',
    ...manifest.map((row) => [row.day, row.platform, row.format, row.file, row.hook, row.cta].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')),
  ].join('\n');
  await fs.writeFile(path.join(OUT_DIR, 'manifest.csv'), csv, 'utf8');
  console.log(`Generated ${manifest.length} monthly assets in ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
