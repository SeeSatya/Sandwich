import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const zipEntry = (zip: Buffer, name: string): string => {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let cursor = zip.readUInt32LE(end + 16);
  while (zip.readUInt32LE(cursor) === 0x02014b50) {
    const length = zip.readUInt16LE(cursor + 28);
    if (zip.subarray(cursor + 46, cursor + 46 + length).toString() === name) {
      const local = zip.readUInt32LE(cursor + 42);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const bytes = zip.subarray(start, start + zip.readUInt32LE(cursor + 20));
      return (zip.readUInt16LE(cursor + 10) === 8 ? inflateRawSync(bytes) : bytes).toString();
    }
    cursor += 46 + length + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32);
  }
  throw new Error(`ZIP entry missing: ${name}`);
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

const downloadWordArchive = async (page: Page) => {
  const downloaded = page.waitForEvent('download');
  await page.locator('button[title="Export as Word (.docx)"]').click();
  return readFileSync((await (await downloaded).path())!);
};

const downloadWord = async (page: Page) => zipEntry(await downloadWordArchive(page), 'word/document.xml');

const wordParagraphs = async (page: Page, xml: string) => page.evaluate(source => {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const document = new DOMParser().parseFromString(source, 'application/xml');
  const elements = (element: Element, tag: string) => Array.from(element.getElementsByTagNameNS(ns, tag));
  const text = (element: Element) => elements(element, 't').map(node => node.textContent).join('');
  const val = (element: Element | undefined) => element?.getAttributeNS(ns, 'val');
  return elements(document.documentElement, 'p').map(paragraph => ({
    text: text(paragraph).trim(),
    alignment: val(elements(paragraph, 'jc')[0]),
    pageBreakBefore: elements(paragraph, 'pageBreakBefore').length > 0,
    numbered: elements(paragraph, 'numPr').length > 0,
    runs: elements(paragraph, 'r').map(run => ({
      text: text(run),
      bold: elements(run, 'b').length > 0,
      italic: elements(run, 'i').length > 0,
      strike: elements(run, 'strike').length > 0,
      underline: elements(run, 'u').length > 0,
      highlight: val(elements(run, 'highlight')[0]),
      color: val(elements(run, 'color')[0]),
    })),
  }));
}, xml);

test('Word emits native manual breaks before headings, lists, and tables without empty sheets', async ({ page }) => {
  await page.locator('textarea').fill(`[pagebreak]

# First page

Cover text.

[pagebreak]

[pagebreak]

[align - center]

# Second page

[pagebreak]

- Third-page list
- Another list item

[pagebreak]

| Fourth-page table |
| --- |
| Table content |

[pagebreak]

[pagebreak]`);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  const xml = await downloadWord(page);
  const paragraphs = await wordParagraphs(page, xml);
  expect(paragraphs.filter(p => p.pageBreakBefore)).toHaveLength(3);
  expect(paragraphs.find(p => p.text === 'First page')?.pageBreakBefore).toBe(false);
  expect(paragraphs.find(p => p.text === 'Second page')).toMatchObject({ pageBreakBefore: true, alignment: 'center' });
  expect(paragraphs.find(p => p.text === 'Third-page list')).toMatchObject({ pageBreakBefore: true, numbered: true });
  expect(xml).toMatch(/<w:pageBreakBefore\/>[\s\S]*?<\/w:p><w:tbl>/);
  expect(paragraphs.at(-1)?.text).toBe('Table content');
  expect(xml).not.toContain('[pagebreak]');
});

test('Word preserves combined formats and explicit alignment over Academic theme defaults', async ({ page }) => {
  await page.locator('[title="Document theme"] select').selectOption({ label: 'Academic Report' });
  await page.locator('textarea').fill(`[align - center]

# Centered heading

[text - right - bold - italic - underline - strike - highlight] Combined [linked text](https://example.com) and \`inline code\`.

[align - left] Explicit left paragraph.

[align - justify] Explicit justified paragraph.

Default academic paragraph.`);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  const xml = await downloadWord(page);
  const paragraphs = await wordParagraphs(page, xml);
  expect(paragraphs.find(p => p.text === 'Centered heading')?.alignment).toBe('center');
  const combined = paragraphs.find(p => p.text.startsWith('Combined linked text'))!;
  expect(combined.alignment).toBe('right');
  for (const run of combined.runs.filter(run => run.text.trim())) {
    expect(run).toMatchObject({ bold: true, italic: true, strike: true, underline: true, highlight: 'yellow', color: '000000' });
  }
  expect(xml).toContain('<w:hyperlink');
  expect(paragraphs.find(p => p.text === 'Explicit left paragraph.')?.alignment).toBe('left');
  expect(paragraphs.find(p => p.text === 'Explicit justified paragraph.')?.alignment).toBe('both');
  expect(paragraphs.find(p => p.text === 'Default academic paragraph.')?.alignment).toBe('both');
  expect(xml).not.toContain('[text -');
  expect(xml).not.toContain('[align -');
});

test('Word inherits list, quote, and table controls while preserving explicit cell alignment', async ({ page }) => {
  await page.locator('textarea').fill(`[text - right - underline - highlight]

- List highlight
  - Nested highlight

[text - center - italic]

> Quoted format.

[text - right - underline - highlight]

| Inherited cell | Explicit left | Explicit center |
| --- | :--- | :---: |
| Table highlight | Left cell | Center cell |

After controls.`);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  const paragraphs = await wordParagraphs(page, await downloadWord(page));
  for (const text of ['List highlight', 'Nested highlight', 'Table highlight']) {
    const paragraph = paragraphs.find(p => p.text === text)!;
    expect(paragraph.alignment).toBe('right');
    expect(paragraph.runs.find(run => run.text === text)).toMatchObject({ underline: true, highlight: 'yellow' });
  }
  const quote = paragraphs.find(p => p.text.trim() === 'Quoted format.')!;
  expect(quote.alignment).toBe('center');
  expect(quote.runs.find(run => run.text.trim() === 'Quoted format.')?.italic).toBe(true);
  expect(paragraphs.find(p => p.text === 'Left cell')?.alignment).toBe('left');
  expect(paragraphs.find(p => p.text === 'Center cell')?.alignment).toBe('center');
  expect(paragraphs.find(p => p.text === 'After controls.')?.runs.some(run => run.highlight)).toBe(false);
});

test('Word supports partial highlighting and underlining inside links while literal directives survive', async ({ page }) => {
  await page.locator('textarea').fill(`Before <mark>highlighted **bold**</mark> and <u>underlined text</u>.

[<mark><u>linked formats</u></mark>](https://example.com/formatted)

\\[pagebreak]

[text - unknown] Literal unsupported control.

\`[pagebreak]\`

\`\`\`text
[align - center]
[pagebreak]
\`\`\`
`);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  const xml = await downloadWord(page);
  const paragraphs = await wordParagraphs(page, xml);
  const runs = paragraphs.flatMap(p => p.runs);
  expect(runs.find(run => run.text === 'bold')).toMatchObject({ bold: true, highlight: 'yellow' });
  expect(runs.find(run => run.text === 'underlined text')?.underline).toBe(true);
  expect(runs.find(run => run.text === 'linked formats')).toMatchObject({ underline: true, highlight: 'yellow' });
  expect(paragraphs.some(p => p.pageBreakBefore)).toBe(false);
  expect(xml).toContain('[text - unknown] Literal unsupported control.');
  expect(xml).toContain('[align - center]');
  expect(xml).toContain('[pagebreak]');
});

test('Word exports the complete chatbot example with its JSON diagram and rendered math', async ({ page }) => {
  test.setTimeout(180_000);
  const guide = readFileSync(new URL('../documention/chatbot-instructions.md', import.meta.url), 'utf8');
  const example = guide.split('## Complete example to generate')[1].match(/````markdown\n([\s\S]*?)\n````/)![1];
  await page.locator('textarea').fill(example);
  await expect(page.locator('#markdown-source .diagram-container svg')).toHaveCount(1);
  await expect(page.locator('#markdown-source .katex')).toHaveCount(1);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');

  const archive = await downloadWordArchive(page);
  const xml = zipEntry(archive, 'word/document.xml');
  const relationships = zipEntry(archive, 'word/_rels/document.xml.rels');
  const svgTarget = relationships.match(/Target="(media\/[^\"]+\.svg)"/)![1];
  const svg = zipEntry(archive, `word/${svgTarget}`);
  expect(svg).toContain('<svg');
  for (const label of ['Draft', 'Review', 'Publish', 'Approved']) expect(svg).toContain(label);
  // One drawing is the diagram (with a vector relationship and PNG fallback),
  // the other is the independently rasterized inline formula.
  expect(xml.match(/<w:drawing>/g)).toHaveLength(2);
  expect(xml.match(/<asvg:svgBlip\b/g)).toHaveLength(1);
  expect(xml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1);
  const paragraphs = await wordParagraphs(page, xml);
  expect(paragraphs.find(p => p.text === 'Implementation Plan')).toMatchObject({ alignment: 'center', pageBreakBefore: true });
  expect(paragraphs.find(p => p.text === 'Review date: 30 November 2026')).toMatchObject({ alignment: 'right' });
  expect(paragraphs.find(p => p.text === 'Objective: deliver a clear, accessible document.')?.runs[0]).toMatchObject({ bold: true, highlight: 'yellow' });
  expect(xml).toContain('Normal text with ');
  expect(xml).toContain('highlighted words');
  expect(xml).toContain('ends the document.');
  expect(xml).not.toContain('[pagebreak]');
});

test('Word exports standalone SVG without swallowing mixed wrapper prose, code, or lists', async ({ page }) => {
  await page.locator('textarea').fill(`<div>

[text - bold] Nested literal control before diagram.

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><rect width="300" height="100" fill="#e5e7eb"/><text x="20" y="55" fill="#111827">Standalone visual</text></svg>

After diagram **bold** prose.

- Retained list item

\`\`\`text
Retained code block
\`\`\`

</div>

[pagebreak]

[text - center - underline] Outside formatted paragraph.`);
  await expect(page.locator('#markdown-source svg')).toHaveCount(1);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  const archive = await downloadWordArchive(page);
  const xml = zipEntry(archive, 'word/document.xml');
  expect(xml.match(/<w:drawing>/g)).toHaveLength(1);
  expect(xml).toContain('<asvg:svgBlip');
  expect(xml).toContain('[text - bold] Nested literal control before diagram.');
  expect(xml).toContain('After diagram ');
  expect(xml).toContain(' prose.');
  expect(xml).toContain('Retained code block');
  const paragraphs = await wordParagraphs(page, xml);
  expect(paragraphs.find(p => p.text === 'Retained list item')?.numbered).toBe(true);
  const outside = paragraphs.find(p => p.text === 'Outside formatted paragraph.')!;
  expect(outside).toMatchObject({ alignment: 'center', pageBreakBefore: true });
  expect(outside.runs[0].underline).toBe(true);
});
