#!/usr/bin/env node
/**
 * inject-env.mjs
 *
 * Reads VITE_API_URL from the environment and writes it into
 * artifacts/menu/.env.local before Vite builds, so the value is
 * baked into the JavaScript bundle at build time.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFilePath = resolve(__dirname, '../artifacts/menu/.env.local');

const apiUrl = process.env.VITE_API_URL;

if (!apiUrl) {
  console.warn(
    '[inject-env] WARNING: VITE_API_URL is not set. ' +
    'The Menu frontend will fall back to relative /api/ paths, ' +
    'which will fail when the frontend and API are on different domains.'
  );
}

const content = `VITE_API_URL=${apiUrl ?? ''}\n`;

mkdirSync(dirname(envFilePath), { recursive: true });
writeFileSync(envFilePath, content, 'utf8');

console.log(`[inject-env] Wrote ${envFilePath}`);
console.log(`[inject-env] VITE_API_URL=${apiUrl ?? '(empty)'}`);
