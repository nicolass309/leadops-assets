#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const API_URL = 'https://api.buffer.com';
const ROOT = process.cwd();
const CALENDAR_PATH = path.join(ROOT, '22-calendario-organico-30-dias.csv');
const STATE_DIR = path.join(ROOT, 'automation/state');
const LOG_DIR = path.join(ROOT, 'automation/logs');
const STATE_PATH = path.join(STATE_DIR, 'scheduled-posts.csv');

const channels = {
  instagram: '69fab1125c4c051afa1555a5',
  tiktok: '69fab1945c4c051afa1557b0',
  twitter: '69fab1a35c4c051afa1557f3',
};

const hashtags = {
  base: '#Inmobiliaria #VentasInmobiliarias #CRM #WhatsAppBusiness #RevenueOps',
  framework: '#Inmobiliaria #CRM #VentasInmobiliarias #RevenueOps #Automatizacion',
  errores: '#MarketingInmobiliario #Automatizacion #CRM #Ventas #RevenueOps',
  oferta: '#Inmobiliaria #Ventas #Automatizacion #CRM #RevenueOps',
};

const allowedFormats = ['Quote graphic', 'Carrusel', 'Fake UI content', 'Fake UI carousel', 'Pseudo-video simple'];
const operationalTerms = [
  'lead', 'leads', 'crm', 'seguimiento', 'velocidad', 'broker', 'inmobiliaria',
  'pipeline', 'visita', 'whatsapp', 'operacion', 'operacional', 'comercial',
  'fuga', 'sistema', 'califica', 'agenda', 'contexto', 'revenue',
];
const tensionTerms = [
  'no', 'problema', 'fuga', 'pierde', 'perder', 'caos', 'tarde', 'enfria',
  'enfriar', 'lento', 'riesgo', 'culpar', 'depende', 'roto', 'fallo',
  'rompe', 'sin', 'desaparece', 'desperdiciado', 'ocupado', 'pregunta',
  'precio', 'desorden', 'friccion', 'manual',
];
const categoryTerms = [
  'lead leakage', 'fuga', 'infraestructura comercial', 'tiempo de enfriamiento',
  'sistema pre-vendedor', 'pipeline operativo', 'operacion comercial',
  'revenueops', 'control', 'velocidad operacional', 'primer tramo comercial',
  'pre-vendedor', 'respuesta operacional', 'fuga operacional',
  'pipeline', 'crm', 'seguimiento',
];
const slopTerms = [
  'revoluciona', 'transforma tu negocio', 'potencia tus ventas', 'escala sin limites',
  'futuro de las ventas', 'magico', 'magica', 'secreto', 'hack definitivo',
  'lleva al siguiente nivel', 'disruptivo', 'increible', 'imperdible',
  'automatiza todo', 'vende en automatico', 'garantizado',
];

function env(name, fallback = null) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
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

function csv(value) {
  return `"${String(value ?? '').replace(/\r?\n/g, ' ').replaceAll('"', '""')}"`;
}

async function readCalendar() {
  const raw = await fs.readFile(CALENDAR_PATH, 'utf8');
  const [headerLine, ...lines] = raw.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

async function readState() {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    const [, ...lines] = raw.trim().split(/\r?\n/);
    return new Set(lines.map((line) => parseCsvLine(line)[0]));
  } catch {
    return new Set();
  }
}

function localDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: env('LEADOPS_TIMEZONE', 'America/Santiago'),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === 'year').value,
    month: parts.find((part) => part.type === 'month').value,
    day: parts.find((part) => part.type === 'day').value,
  };
}

function localDateString(date = new Date()) {
  const { year, month, day } = localDateParts(date);
  return `${year}-${month}-${day}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  return Math.round((endDate - startDate) / 86400000);
}

function dueAt(dateString, time) {
  const offset = '-04:00';
  const planned = new Date(`${dateString}T${time}:00${offset}`);
  const now = new Date();
  if (planned > now) return { date: planned, shifted: false };
  return { date: new Date(now.getTime() + 20 * 60 * 1000), shifted: true };
}

function slugFor(row) {
  const day = String(row.dia).padStart(2, '0');
  return `day-${day}-${row.pilar.toLowerCase().replaceAll(' ', '-')}`;
}

function rawVideoUrl(row) {
  const repo = env('GITHUB_REPO', 'nicolass309/leadops-assets');
  const branch = env('GITHUB_BRANCH', 'main');
  return `https://raw.githubusercontent.com/${repo}/${branch}/leadops/month-01/videos/${slugFor(row)}.mp4`;
}

function hashtagSet(row) {
  if (row.pilar === 'Errores') return hashtags.errores;
  if (row.pilar === 'Framework') return hashtags.framework;
  if (row.pilar === 'Oferta') return hashtags.oferta;
  return hashtags.base;
}

function compactX(row) {
  const cta = row.cta.replace(/^Responde /, 'Comenta ');
  const options = [
    `${row.hook}\n\n${row.idea}\n\n${cta}.`,
    `${row.hook}\n\n${cta}.`,
    `${row.hook}`,
  ];
  return options.find((text) => text.length <= 280) ?? options.at(-1).slice(0, 277);
}

function caption(row) {
  return `${row.hook}. ${row.idea}. ${row.cta}. ${hashtagSet(row)}`.replace(/\s+/g, ' ').trim();
}

function postKey(post) {
  return `${post.network}|${post.date}|${post.time}|day-${post.day}`;
}

function containsAny(text, terms) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function scoreFrom(condition, high = 5, low = 2) {
  return condition ? high : low;
}

function contentScore(post) {
  const row = post.source;
  const text = `${row.hook} ${row.idea} ${post.text}`.toLowerCase();
  const hookLength = row.hook.length;
  const totalLength = post.text.length;
  const hasOperational = containsAny(text, operationalTerms);
  const hasTension = containsAny(text, tensionTerms);
  const hasCategory = containsAny(text, categoryTerms) || containsAny(row.pilar, categoryTerms);
  const hasSlop = containsAny(text, slopTerms) || /[\u{1F300}-\u{1FAFF}]/u.test(post.text);
  const hasCta = /\b(comenta|responde|dm|manda|guarda)\b/i.test(row.cta) || /\b(comenta|responde|dm|manda|guarda)\b/i.test(post.text);
  const isAllowedFormat = allowedFormats.includes(row.formato);
  const isSaveFormat = row.formato.includes('Carrusel') || row.formato.includes('Fake UI') || /checklist|guarda|mapa/i.test(post.text);
  const isDmFormat = /dm|auditoria|mapa|resumen|pipeline|sistema/i.test(post.text);
  const isFast = hookLength <= 95 && totalLength <= (post.network === 'X' ? 280 : 260);

  const scores = {
    painClarity: scoreFrom(hasOperational && hasTension),
    comprehensionSpeed: isFast ? 5 : hookLength <= 120 ? 3 : 1,
    hookStrength: scoreFrom(hasTension && !hasSlop),
    commentPotential: /comenta|responde/i.test(post.text) ? 5 : hasCta ? 4 : 2,
    savePotential: isSaveFormat ? 5 : 3,
    dmPotential: isDmFormat ? 5 : 3,
    visualClarity: post.network === 'X' ? scoreFrom(totalLength <= 280) : scoreFrom(isAllowedFormat && hookLength <= 95),
    visualSimplicity: post.network === 'X' ? scoreFrom(totalLength <= 280) : scoreFrom(isAllowedFormat),
    realEstateRelevance: scoreFrom(/inmobiliaria|broker|whatsapp|crm|lead|visita/i.test(text)),
    categoryCoherence: scoreFrom(hasCategory),
  };

  const reasons = [];
  if (hasSlop) reasons.push('slop-language-or-emoji');
  if (!hasOperational) reasons.push('missing-operational-clarity');
  if (!hasTension) reasons.push('missing-tension');
  if (!hasCta) reasons.push('missing-clear-cta');
  if (!hasCategory) reasons.push('missing-category-creation');
  if (!isAllowedFormat) reasons.push('unsupported-format');
  if (hookLength > 110) reasons.push('hook-too-long');
  if (totalLength > (post.network === 'X' ? 280 : 300)) reasons.push('too-much-text');

  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const minCriterion = Math.min(...Object.values(scores));
  if (total < 38) reasons.push('score-below-threshold');
  const passed = total >= 38 && reasons.length === 0;

  return { total, minCriterion, passed, reasons, scores };
}

async function gql(query, variables = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('BUFFER_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(JSON.stringify(payload, null, 2));
  }
  return payload.data;
}

function inputFor(post) {
  const input = {
    channelId: post.channelId,
    text: post.text,
    schedulingType: 'automatic',
    mode: 'customScheduled',
    saveToDraft: false,
    dueAt: post.dueAt.toISOString(),
  };

  if (post.videoUrl) input.assets = { videos: [{ url: post.videoUrl }] };
  if (post.network === 'Instagram') {
    input.metadata = { instagram: { type: 'reel', shouldShareToFeed: true } };
  }

  return input;
}

async function createPost(post) {
  const data = await gql(`
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post {
            id
            status
            channelService
            dueAt
          }
        }
        ... on MutationError {
          message
        }
      }
    }
  `, { input: inputFor(post) });

  const result = data.createPost;
  if (result?.message || !result?.post?.id) {
    throw new Error(result?.message || JSON.stringify(result));
  }
  return result.post;
}

function buildPosts(calendar) {
  const startDate = env('LEADOPS_START_DATE', '2026-05-07');
  const today = localDateString();
  const windowDays = Number(env('LEADOPS_WINDOW_DAYS', '1'));
  const posts = [];

  for (let offset = 0; offset < windowDays; offset += 1) {
    const date = addDays(today, offset);
    const campaignIndex = daysBetween(startDate, date);
    const row = calendar[((campaignIndex % calendar.length) + calendar.length) % calendar.length];
    const day = Number(row.dia);
    const videoUrl = rawVideoUrl(row);
    const xText = compactX(row);
    const socialCaption = caption(row);

    const specs = [
      { network: 'X', time: '12:20', channelId: channels.twitter, text: xText },
      { network: 'TikTok', time: '16:30', channelId: channels.tiktok, text: socialCaption, videoUrl },
      { network: 'Instagram', time: '18:30', channelId: channels.instagram, text: socialCaption, videoUrl },
    ];

    for (const spec of specs) {
      const planned = dueAt(date, spec.time);
      posts.push({ ...spec, date, day, source: row, dueAt: planned.date, shifted: planned.shifted });
    }
  }

  return posts;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR, { recursive: true });

  const calendar = await readCalendar();
  const scheduled = await readState();
  const posts = buildPosts(calendar);
  const newStateRows = ['key,network,date,time,day,due_at,status,post_id,asset,score,error'];
  const runRows = ['key,network,date,time,day,due_at,status,post_id,asset,score,error'];

  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    newStateRows.push(...raw.trim().split(/\r?\n/).slice(1));
  } catch {
    // Empty state on first run.
  }

  for (const post of posts) {
    const key = postKey(post);
    if (scheduled.has(key)) {
      console.log(`[SKIP] ${key}`);
      runRows.push([key, post.network, post.date, post.time, post.day, '', 'skipped', '', post.videoUrl || '', '', 'already-scheduled'].map(csv).join(','));
      continue;
    }

    const quality = contentScore(post);
    if (!quality.passed) {
      const error = `content-rejected score=${quality.total}/50 reasons=${quality.reasons.join('|')}`;
      console.error(`[REJECT] ${key}: ${error}`);
      runRows.push([key, post.network, post.date, post.time, post.day, post.dueAt.toISOString(), 'rejected', '', post.videoUrl || '', quality.total, error].map(csv).join(','));
      continue;
    }

    if (dryRun) {
      console.log(`[DRY] ${key} ${post.dueAt.toISOString()} ${post.videoUrl ? 'video' : 'text'} chars=${post.text.length} score=${quality.total}/50`);
      runRows.push([key, post.network, post.date, post.time, post.day, post.dueAt.toISOString(), 'dry-run', '', post.videoUrl || '', quality.total, ''].map(csv).join(','));
      continue;
    }

    try {
      const created = await createPost(post);
      console.log(`[OK] ${key} ${created.id} ${created.dueAt}`);
      const row = [key, post.network, post.date, post.time, post.day, created.dueAt, created.status, created.id, post.videoUrl || '', quality.total, ''].map(csv).join(',');
      newStateRows.push(row);
      runRows.push(row);
    } catch (error) {
      console.error(`[ERROR] ${key}: ${error.message}`);
      runRows.push([key, post.network, post.date, post.time, post.day, post.dueAt.toISOString(), 'error', '', post.videoUrl || '', quality.total, error.message].map(csv).join(','));
      if (error.message.includes('RATE_LIMIT_EXCEEDED') || error.message.includes('Too many requests')) {
        console.error('[STOP] Buffer rate limit reached. Stopping this run to avoid burning more requests.');
        break;
      }
    }
  }

  await fs.writeFile(STATE_PATH, `${newStateRows.join('\n')}\n`, 'utf8');
  const logPath = path.join(LOG_DIR, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
  await fs.writeFile(logPath, `${runRows.join('\n')}\n`, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
