#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

const ROOT = process.cwd();
const OUT_DIR = path.resolve(ROOT, 'assets/generated/month-01');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const VIDEO_DIR = path.join(OUT_DIR, 'videos');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function videoPathFor(file) {
  const base = path.basename(file, path.extname(file));
  return path.join(VIDEO_DIR, `${base}.mp4`);
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  await fs.mkdir(VIDEO_DIR, { recursive: true });
  const ffmpeg = ffmpegPath || 'ffmpeg';

  for (const asset of manifest.assets) {
    const input = path.resolve(ROOT, asset.file);
    const output = videoPathFor(asset.file);
    await run(ffmpeg, [
      '-y',
      '-loop', '1',
      '-i', input,
      '-t', '8',
      '-r', '30',
      '-vf', 'scale=1080:1920,format=yuv420p',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-movflags', '+faststart',
      output,
    ]);
  }

  console.log(`Rendered ${manifest.assets.length} videos in ${VIDEO_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
