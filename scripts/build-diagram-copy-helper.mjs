import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/diagrams/copyHelperEntry.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'inline',
});
const code = result.outputFiles[0].text;
const header = `// ==UserScript==
// @name         MarkMind diagram copy helper
// @namespace    https://github.com/SeeSatya/Sandwich
// @version      1.1.0
// @description  Preserve live diagram SVG when copying ChatGPT responses. No network requests or AI.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
`;
await mkdir(path.join(root, 'public'), { recursive: true });
await writeFile(path.join(root, 'public/diagram-copy-helper.user.js'), header + code);
await writeFile(path.join(root, 'public/diagram-copy-helper.bookmarklet.txt'), 'javascript:' + encodeURIComponent(code));
console.log('Built self-contained diagram copy userscript and bookmarklet.');
