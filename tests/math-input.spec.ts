import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const sample = readFileSync(new URL('./fixtures/numerical-methods.md', import.meta.url), 'utf8');
const proofDir = '/tmp/sandwich-math-proof';

const zipEntries = (zip: Buffer): Map<string, Buffer> => {
  const entries = new Map<string, Buffer>();
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let cursor = zip.readUInt32LE(end + 16);
  while (zip.readUInt32LE(cursor) === 0x02014b50) {
    const length = zip.readUInt16LE(cursor + 28);
    const name = zip.subarray(cursor + 46, cursor + 46 + length).toString();
    const local = zip.readUInt32LE(cursor + 42);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const bytes = zip.subarray(start, start + zip.readUInt32LE(cursor + 20));
    entries.set(name, zip.readUInt16LE(cursor + 10) === 8 ? inflateRawSync(bytes) : bytes);
    cursor += 46 + length + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32);
  }
  return entries;
};

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  if (process.env.PLAYWRIGHT_TAILWIND_CACHE) {
    const tailwind = readFileSync(process.env.PLAYWRIGHT_TAILWIND_CACHE);
    await page.route('https://cdn.tailwindcss.com**', route => route.fulfill({ contentType: 'application/javascript', body: tailwind }));
  }
  await page.goto('/', { waitUntil: 'commit' });
  await page.locator('textarea').waitFor({ timeout: 60_000 });
});

test('the complete copied Numerical Methods sample renders all five boxed equations', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1400 });
  await page.locator('textarea').fill(sample);
  await expect(page.locator('.markdown-pages .katex-display')).toHaveCount(5);
  await expect(page.locator('.markdown-pages .katex-error')).toHaveCount(0);
  await expect(page.locator('.markdown-pages .fbox')).toHaveCount(5);
  await expect(page.locator('.markdown-pages h3')).toHaveCount(6);
  await expect(page.locator('#markdown-source table')).toHaveCount(1);
  await expect(page.locator('.markdown-pages tbody tr')).toHaveCount(6);
  await expect(page.locator('.markdown-pages')).toContainText('They are important for both theory and numerical problems.');
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  const formulas = await page.locator('.markdown-pages annotation').allTextContents();
  expect(formulas.every(formula => formula.startsWith('\\boxed{'))).toBe(true);
  expect(formulas[4]).toContain('af(b)-bf(a)');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.markdown-pages .fbox')).toHaveCount(5);
  await page.emulateMedia({ media: 'screen' });
  mkdirSync(proofDir, { recursive: true });
  const pages = page.locator('.markdown-pages > .page');
  for (let index = 0; index < await pages.count(); index++) {
    await pages.nth(index).screenshot({ path: `${proofDir}/numerical-methods-page-${index + 1}.png` });
  }
  await page.locator('.markdown-pages .katex-display').last().screenshot({ path: `${proofDir}/regula-falsi-closeup.png` });
  console.log(`Screenshot proof: ${proofDir}/numerical-methods-page-*.png and ${proofDir}/regula-falsi-closeup.png`);
});

test('native/copied roots, delimiters, matrix rows, currency, and literal code keep their contexts', async ({ page }) => {
  const nativeAligned = String.raw`$$
\begin{aligned}
a &= b \\
c &= d
\end{aligned}
$$`;
  const nativeMatrix = String.raw`$$
\begin{matrix}
a & b \\
c & d
\end{matrix}
$$`;
  const incomplete = String.raw`\boxed{x=1`;
  const prose = String.raw`\boxed{x=1} trailing prose`;
  const source = [
    String.raw`\boxed{x=\frac{a}{b}}`,
    String.raw`\\boxed{x=\\frac{a}{b}}`,
    String.raw`\frac{a}
{b}`,
    String.raw`\sqrt{x}`,
    String.raw`\[
x=\frac{a}{b}
\]`,
    String.raw`\(
x=\frac{a}{b}
\)`,
    nativeAligned, nativeMatrix,
    String.raw`Inline $x$ and $\\boxed{x=1}$.`,
    String.raw`Greek $\\alpha + \\beta$.`,
    String.raw`$$
\\sin(x) + \\cos(x)
$$`,
    String.raw`\lim_{n\to\infty}
\frac{|e_{n+1}|}{|e_n|^p}=C
Following prose stays outside the formula.`,
    'Prices $5, $10, and **Total** $15.',
    incomplete, prose,
    '`\\boxed{literal}`',
    '```text\n\\boxed{literal}\n```',
  ].join('\n\n');
  await page.locator('textarea').fill(source);
  await expect(page.locator('#markdown-source annotation')).toHaveCount(13);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  await expect(page.locator('.markdown-pages .katex')).toHaveCount(13);
  await expect(page.locator('.markdown-pages .katex-display')).toHaveCount(9);
  await expect(page.locator('.markdown-pages .katex-error')).toHaveCount(0);
  await expect(page.locator('.markdown-pages')).toContainText('Prices $5, $10, and Total $15.');
  await expect(page.locator('.markdown-pages strong')).toHaveText('Total');
  await expect(page.locator('.markdown-pages p code')).toHaveText('\\boxed{literal}');
  await expect(page.locator('.markdown-pages .code-block-wrapper')).toContainText('\\boxed{literal}');
  const processed = await page.evaluate(async (text) => {
    const { preprocessMarkdown } = await import(String('/src/diagrams/preprocessMarkdown.ts'));
    return preprocessMarkdown(text);
  }, source);
  expect(processed).toContain(nativeAligned);
  expect(processed).toContain(nativeMatrix);
  expect(processed).toContain(incomplete);
  expect(processed).toContain(prose);
  expect(processed).toContain('```text\n\\boxed{literal}\n```');
  expect(processed).toContain('$$\n\\lim_{n\\to\\infty}\n\\frac{|e_{n+1}|}{|e_n|^p}=C\n$$\nFollowing prose');
  const formulas = await page.locator('.markdown-pages annotation').allTextContents();
  expect(formulas).toContain('\\alpha + \\beta');
  expect(formulas).toContain('\\sin(x) + \\cos(x)');
  expect(formulas).toContain('\\lim_{n\\to\\infty}\n\\frac{|e_{n+1}|}{|e_n|^p}=C');
});

test('Word preserves the five boxed formulas as images without duplicated TeX text', async ({ page }) => {
  await page.locator('textarea').fill(sample);
  await expect(page.locator('.markdown-pages .fbox')).toHaveCount(5);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  const downloaded = page.waitForEvent('download');
  await page.locator('button[title="Export as Word (.docx)"]').click();
  const download = await downloaded;
  const entries = zipEntries(readFileSync((await download.path())!));
  const xml = entries.get('word/document.xml')!.toString();
  const pngs = Array.from(entries).filter(([name]) => /^word\/media\/.*\.png$/.test(name));
  expect(pngs).toHaveLength(5);
  expect(xml.match(/<w:drawing>/g)).toHaveLength(5);
  expect(xml).not.toContain('\\boxed');
  expect(xml).not.toContain('\\frac');
  expect(xml).toContain('They are important for both theory and numerical problems.');
  mkdirSync(proofDir, { recursive: true });
  writeFileSync(`${proofDir}/word-formula.png`, pngs[0][1]);
  expect(pngs[0][1].readUInt32BE(16)).toBeGreaterThan(100);
  expect(pngs[0][1].readUInt32BE(20)).toBeGreaterThan(60);
  await expect(page.locator('[data-docx-math-host], .html2canvas-container')).toHaveCount(0);
});

test('Word freezes click-time formulas during editing and keeps narrow-table image extents positive', async ({ page }) => {
  const headings = Array.from({ length: 40 }, (_, index) => `C${index + 1}`);
  const table = `| ${headings.join(' | ')} |\n| ${headings.map(() => '---').join(' | ')} |\n| ${headings.map((_, index) => index === 0 ? '$x$' : '1').join(' | ')} |`;
  await page.locator('textarea').fill(sample + '\n\n' + table);
  await expect(page.locator('#markdown-source .katex')).toHaveCount(6);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  const downloaded = page.waitForEvent('download');
  await page.locator('button[title="Export as Word (.docx)"]').click();
  await expect(page.locator('[data-docx-snapshot]')).toHaveCount(1);
  await page.locator('textarea').fill('Changed draft $z$.');
  const download = await downloaded;
  const entries = zipEntries(readFileSync((await download.path())!));
  const xml = entries.get('word/document.xml')!.toString();
  expect(xml.match(/<w:drawing>/g)).toHaveLength(6);
  expect(xml).toContain('Numerical Methods');
  expect(xml).not.toContain('Changed draft');
  const extents = Array.from(xml.matchAll(/<wp:extent cx="([^"]+)" cy="([^"]+)"/g));
  expect(extents).toHaveLength(6);
  for (const extent of extents) {
    expect(Number.isFinite(Number(extent[1]))).toBe(true);
    expect(Number.isFinite(Number(extent[2]))).toBe(true);
    expect(Number(extent[1])).toBeGreaterThan(0);
    expect(Number(extent[2])).toBeGreaterThan(0);
  }
  await expect(page.locator('#markdown-source')).toContainText('Changed draft');
  await expect(page.locator('[data-docx-snapshot], [data-docx-math-host], .html2canvas-container')).toHaveCount(0);
});
