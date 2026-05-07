#!/usr/bin/env node

import fs from 'node:fs/promises';

const files = [
  ['package.json', 'package.json'],
  ['22-calendario-organico-30-dias.csv', '22-calendario-organico-30-dias.csv'],
  ['35-estrategia-tofu-mofu-bofu.md', '35-estrategia-tofu-mofu-bofu.md'],
  ['47-estrategia-publicaciones-leadops-ai.md', '47-estrategia-publicaciones-leadops-ai.md'],
  ['49-content-os-leadops-ai.md', '49-content-os-leadops-ai.md'],
  ['.github/workflows/leadops-autopublisher.yml', '.github/workflows/leadops-autopublisher.yml'],
  ['tools/generate-month-assets.mjs', 'tools/generate-month-assets.mjs'],
  ['tools/render-month-videos.mjs', 'tools/render-month-videos.mjs'],
  ['tools/github-upload-assets.mjs', 'tools/github-upload-assets.mjs'],
  ['tools/leadops-daily-publisher.mjs', 'tools/leadops-daily-publisher.mjs'],
  ['tools/install-github-automation.mjs', 'tools/install-github-automation.mjs'],
  ['automation/trigger.txt', 'automation/trigger.txt'],
];

function env(name, fallback = null) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function encodePath(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

async function existingSha({ repo, branch, key, token }) {
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${encodePath(key)}?ref=${encodeURIComponent(branch)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'leadops-ai-installer',
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub read failed ${key}: HTTP ${response.status} ${await response.text()}`);
  return (await response.json()).sha ?? null;
}

async function upload({ file, key }) {
  const token = env('GITHUB_TOKEN');
  const repo = env('GITHUB_REPO');
  const branch = env('GITHUB_BRANCH', 'main');
  const content = await fs.readFile(file);
  const sha = await existingSha({ repo, branch, key, token });
  const body = {
    message: `Install LeadOps automation ${key}`,
    content: content.toString('base64'),
    branch,
  };
  if (sha) body.sha = sha;

  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${encodePath(key)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'leadops-ai-installer',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`GitHub upload failed ${key}: HTTP ${response.status} ${await response.text()}`);
  console.log(`[OK] ${key}`);
}

async function main() {
  for (const [file, key] of files) {
    await upload({ file, key });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
