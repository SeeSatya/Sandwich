import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

// DOCX is a ZIP archive. Read its central-directory entries with Node builtins
// so the regression checks the downloaded document and embedded vector assets.
const unzip = (zip: Buffer): Map<string, Buffer> => {
  const entries = new Map<string, Buffer>();
  for (let offset = 0; offset < zip.length - 46; offset++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) continue;
    const method = zip.readUInt16LE(offset + 10);
    const size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString();
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const bytes = zip.subarray(start, start + size);
    entries.set(name, method === 8 ? inflateRawSync(bytes) : bytes);
    offset += 45 + nameLength + extraLength + commentLength;
  }
  return entries;
};

const diagram = (id: string, label: string): string => `<svg id="chatgpt-mermaid-${id}" viewBox="0 0 280 140" xmlns="http://www.w3.org/2000/svg"><style>#chatgpt-mermaid-${id} .node rect{fill:#00284d}#chatgpt-mermaid-${id} p{color:#99ceff;font-family:Arial;font-size:16px;font-weight:600;line-height:20px;text-align:center}</style><g class="node"><rect x="10" y="10" width="250" height="110" rx="16"/><foreignObject x="10" y="10" width="250" height="110"><div xmlns="http://www.w3.org/1999/xhtml">${label}</div></foreignObject></g></svg>`;
const fence = (svg: string): string => ['```chatgpt-svg', Buffer.from(svg).toString('base64'), '```'].join('\n');

test('downloaded DOCX preserves complete multiline Unicode labels as SVG text and PNG fallback', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const svg = diagram('multiline', '<p>First line</p><p>第二行 / Second line<br/>Third line</p>');
  await page.locator('textarea').fill(`# Multiline diagram\n\n${fence(svg)}`);
  await expect(page.locator('#markdown-source .imported-diagram p')).toHaveCount(2);
  const previewSize = await page.locator('#markdown-source .imported-diagram svg').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  const downloading = page.waitForEvent('download');
  await page.getByTitle('Export as Word (.docx)', { exact: true }).click();
  const download = await downloading;
  const entries = unzip(readFileSync((await download.path())!));
  const document = entries.get('word/document.xml')!.toString();
  const extent = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(document)!;
  const expectedWidth = Math.min(previewSize.width, 620);
  // CSS layout and Word image extents round to whole pixels independently.
  expect(Math.abs(Number(extent[1]) / 9525 - expectedWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(Number(extent[2]) / 9525 - previewSize.height * expectedWidth / previewSize.width)).toBeLessThanOrEqual(1);
  const vectors = [...entries].filter(([name]) => name.endsWith('.svg'));
  expect(vectors).toHaveLength(1);
  const vector = vectors[0][1].toString();
  expect(vector).toContain('First line');
  expect(vector).toContain('第二行 / Second line');
  expect(vector).toContain('Third line');
  expect(vector).not.toContain('foreignObject');
  expect(vector.match(/<tspan\b/g)).toHaveLength(3);
  expect(vector).toContain('font-weight="600"');
  const pngs = [...entries].filter(([name]) => name.endsWith('.png'));
  expect(pngs).toHaveLength(1);
  expect(pngs[0][1].subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
});

test('downloaded DOCX retains prose and every diagram inside quotes, lists, and table cells', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const quote = fence(diagram('quote', '<p>Quoted diagram</p>')).split('\n').map(line => `> ${line}`).join('\n');
  const listFirst = fence(diagram('list-first', '<p>First list diagram</p>')).split('\n').map(line => `  ${line}`).join('\n');
  const listSecond = fence(diagram('list-second', '<p>Second list diagram</p>')).split('\n').map(line => `  ${line}`).join('\n');
  const cell = fence(diagram('cell', '<p>Cell diagram</p>'));
  const markdown = `# Nested diagrams\n\n> Quote intro\n>\n${quote}\n>\n> Quote outro\n\n- List intro\n\n${listFirst}\n\n  List middle\n\n${listSecond}\n\n  List outro\n\n<table><tbody><tr><td>\n\nCell intro\n\n${cell}\n\nCell outro\n\n</td></tr></tbody></table>\n\nEnd of document.`;
  await page.locator('textarea').fill(markdown);
  await expect(page.locator('#markdown-source .imported-diagram svg')).toHaveCount(4);
  await expect(page.locator('#markdown-source blockquote .imported-diagram')).toHaveCount(1);
  await expect(page.locator('#markdown-source li .imported-diagram')).toHaveCount(2);
  await expect(page.locator('#markdown-source td .imported-diagram')).toHaveCount(1);
  const downloading = page.waitForEvent('download');
  await page.getByTitle('Export as Word (.docx)', { exact: true }).click();
  const download = await downloading;
  const entries = unzip(readFileSync((await download.path())!));
  const document = entries.get('word/document.xml')!.toString();
  for (const text of ['Quote intro', 'Quote outro', 'List intro', 'List middle', 'List outro', 'Cell intro', 'Cell outro', 'End of document.']) expect(document).toContain(text);
  expect(document.indexOf('Quote intro')).toBeLessThan(document.indexOf('Quote outro'));
  expect(document.indexOf('List intro')).toBeLessThan(document.indexOf('List middle'));
  expect(document.indexOf('List middle')).toBeLessThan(document.indexOf('List outro'));
  expect(document.indexOf('Cell intro')).toBeLessThan(document.indexOf('Cell outro'));
  expect(document).not.toContain('chatgpt-mermaid-');
  expect(document).not.toContain('font-family:');
  const vectors = [...entries].filter(([name]) => name.endsWith('.svg')).map(([, bytes]) => bytes.toString());
  expect(vectors).toHaveLength(4);
  for (const text of ['Quoted diagram', 'First list diagram', 'Second list diagram', 'Cell diagram']) expect(vectors.some(vector => vector.includes(text))).toBeTruthy();
  expect([...entries].filter(([name]) => name.endsWith('.png'))).toHaveLength(4);
});
