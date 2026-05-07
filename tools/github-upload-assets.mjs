#!/usr/bin/env node

import fs from 'node:fs/promises';
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
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponentPath(key)}`;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const sha = await existingSha({ repo, branch, key, token });
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

async function writeManifest(rows) {
  await fs.writeFile('github-assets-manifest.json', JSON.stringify({ generatedAt: new Date().toISOString(), assets: rows }, null, 2), 'utf8');
  const csv = [
    'file,key,publicUrl,bytes',
    ...rows.map((row) => [row.file, row.key, row.publicUrl, row.bytes].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')),
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
  } else {
    throw new Error(`Unknown command: ${command}`);
  }

  await writeManifest(uploads);
  console.table(uploads.map((row) => ({
    file: path.basename(row.file),
    bytes: row.bytes,
    url: row.publicUrl,
  })));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
