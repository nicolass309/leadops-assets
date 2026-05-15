#!/usr/bin/env node

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

function usage() {
  console.log(`
Upload LeadOps AI assets to a public GitHub repo using the Contents API.

Required env:
  GITHUB_TOKEN
  GITHUB_REPO      owner/repo

Optional env:
  GITHUB_BRANCH    default: main

Commands:
  upload-dir --dir assets/generated/week-01/videos --prefix leadops/week-01/videos
  upload-file --file assets/generated/week-01/videos/day-01-leads-tarde.mp4 --key leadops/week-01/videos/day-01-leads-tarde.mp4
  upload-window --manifest assets/generated/month-01/manifest.json --prefix leadops/month-01/videos

Output:
  github-assets-manifest.json
  github-assets-manifest.csv
`);
}

function env(name, fallback = null) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function gitBlobSha(content) {
  return crypto
    .createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content]))
    .digest('hex');
}

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(full));
    else files.push(full);
  }
  return files;
}

async function existingSha({ repo, branch, key, token }) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponentPath(key)}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'leadops-ai-publisher',
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub get failed for ${key}: HTTP ${response.status} ${text.slice(0, 500)}`);
  }

  const json = await response.json();
  return json.sha ?? null;
}

function encodeURIComponentPath(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

function rawUrl({ repo, branch, key }) {
  return `https://raw.githubusercontent.com/${repo}/${branch}/${key}`;
}

async function uploadFile({ filePath, key }) {
  const token = env('GITHUB_TOKEN');
  const repo = env('GITHUB_REPO');
  const branch = env('GITHUB_BRANCH', 'main');
  const content = await fs.readFile(filePath);
  const localSha = gitBlobSha(content);
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponentPath(key)}`;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const sha = await existingSha({ repo, branch, key, token });
    if (sha === localSha) {
      return {
        file: filePath.replaceAll('\\', '/'),
        key,
        publicUrl: rawUrl({ repo, branch, key }),
        bytes: content.length,
        skipped: true,
      };
    }

    const body = {
      message: `Upload LeadOps asset ${key}`,
      content: content.toString('base64'),
      branch,
    };
    if (sha) body.sha = sha;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'leadops-ai-publisher',
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return {
        file: filePath.replaceAll('\\', '/'),
        key,
        publicUrl: rawUrl({ repo, branch, key }),
        bytes: content.length,
        skipped: false,
      };
    }

    const text = await response.text();
    if (response.status === 409 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      continue;
    }

    throw new Error(`GitHub upload failed for ${filePath}: HTTP ${response.status} ${text.slice(0, 500)}`);
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

function videoPathFromManifestAsset(asset) {
  return asset.file
    .replaceAll('\\', '/')
    .replace('/vertical/', '/videos/')
    .replace(/\.png$/i, '.mp4');
}

async function uploadWindow({ manifestPath, prefix, dryRun }) {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  const assets = manifest.assets ?? [];
  const cycleLength = assets.length;
  if (!cycleLength) throw new Error(`Manifest has no assets: ${manifestPath}`);

  const startDate = env('LEADOPS_START_DATE', '2026-05-07');
  const today = localDateString();
  const windowDays = Number(env('LEADOPS_WINDOW_DAYS', '1'));
  const repo = env('GITHUB_REPO', 'nicolass309/leadops-assets');
  const branch = env('GITHUB_BRANCH', 'main');
  const uploads = [];

  for (let offset = 0; offset < windowDays; offset += 1) {
    const date = addDays(today, offset);
    const campaignIndex = daysBetween(startDate, date);
    const day = ((campaignIndex % cycleLength) + cycleLength) % cycleLength + 1;
    const asset = assets.find((item) => Number(item.day) === day);
    if (!asset) throw new Error(`No manifest asset for day ${day}`);

    const filePath = videoPathFromManifestAsset(asset);
    const key = `${prefix}/${path.basename(filePath)}`;
    if (dryRun) {
      const content = await fs.readFile(filePath);
      uploads.push({
        file: filePath.replaceAll('\\', '/'),
        key,
        publicUrl: rawUrl({ repo, branch, key }),
        bytes: content.length,
        skipped: 'dry-run',
      });
    } else {
      uploads.push(await uploadFile({ filePath, key }));
    }
  }

  return uploads;
}

async function writeManifest(rows) {
  await fs.writeFile('github-assets-manifest.json', JSON.stringify({ generatedAt: new Date().toISOString(), assets: rows }, null, 2), 'utf8');
  const csv = [
    'file,key,publicUrl,bytes,skipped',
    ...rows.map((row) => [row.file, row.key, row.publicUrl, row.bytes, row.skipped ?? false].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')),
  ].join('\n');
  await fs.writeFile('github-assets-manifest.csv', csv, 'utf8');
}

async function main() {
  const command = process.argv[2];
  if (!command || process.argv.includes('--help')) {
    usage();
    process.exit(command ? 0 : 1);
  }

  let uploads = [];

  if (command === 'upload-file') {
    const file = getArg('--file');
    const key = getArg('--key');
    if (!file || !key) throw new Error('upload-file requires --file and --key.');
    uploads = [await uploadFile({ filePath: file, key })];
  } else if (command === 'upload-dir') {
    const dir = getArg('--dir');
    const prefix = (getArg('--prefix') ?? '').replace(/^\/+|\/+$/g, '');
    if (!dir || !prefix) throw new Error('upload-dir requires --dir and --prefix.');
    const files = await listFiles(dir);
    for (const file of files) {
      const rel = path.relative(dir, file).replaceAll('\\', '/');
      uploads.push(await uploadFile({ filePath: file, key: `${prefix}/${rel}` }));
    }
  } else if (command === 'upload-window') {
    const manifest = getArg('--manifest') ?? 'assets/generated/month-01/manifest.json';
    const prefix = (getArg('--prefix') ?? '').replace(/^\/+|\/+$/g, '');
    if (!prefix) throw new Error('upload-window requires --prefix.');
    uploads = await uploadWindow({ manifestPath: manifest, prefix, dryRun: hasArg('--dry-run') });
  } else {
    throw new Error(`Unknown command: ${command}`);
  }

  await writeManifest(uploads);
  console.table(uploads.map((row) => ({
    file: path.basename(row.file),
    bytes: row.bytes,
    skipped: row.skipped ?? false,
    url: row.publicUrl,
  })));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
