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

const formattingDocument = `# Formatting report

Plain text with **BOLD**, __also bold__, *italic*, _also italic_, ***both***, ~~deleted~~, [a link](https://example.com), and \`inline **literal**\`.

> A quote with **important** text.

- **First** item
  - *Nested* item

| Format | Value |
| --- | --- |
| **Bold cell** | ~~Old value~~ |

First line${'  '}
Second line

\`\`\`
single line **literal**
\`\`\`

A multiline code span: \`first
second\`.

\`\`\`mermaid
flowchart TD
 A[Start] --> B[Finish]
\`\`\`
`;

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  if (process.env.PLAYWRIGHT_TAILWIND_CACHE) {
    const tailwind = readFileSync(process.env.PLAYWRIGHT_TAILWIND_CACHE);
    await page.route('https://cdn.tailwindcss.com**', route => route.fulfill({ contentType: 'application/javascript', body: tailwind }));
  }
  await page.goto('/', { waitUntil: 'commit' });
  await page.locator('textarea').waitFor({ timeout: 60_000 });
});

const paste = async (page: Page, html: string, plain: string) => {
  await page.locator('textarea').evaluate((textarea, data) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', data.html);
    clipboardData.setData('text/plain', data.plain);
    textarea.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData }));
  }, { html, plain });
};

test('common Markdown stays visibly formatted in paginated preview and print', async ({ page }) => {
  await page.locator('textarea').fill(formattingDocument);
  await expect(page.locator('.markdown-pages [data-diagram-state="ready"] svg')).toHaveCount(1);
  for (const theme of ['Modern Light', 'Midnight']) {
    await page.locator('[title="Document theme"] select').selectOption({ label: theme });
    await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
    const preview = page.locator('.markdown-pages');
    const bold = preview.locator('strong').filter({ hasText: /^BOLD$/ });
    await expect(bold).toHaveCount(1);
    await expect(bold).toHaveCSS('font-weight', '700');
    await expect(preview.locator('em').filter({ hasText: /^italic$/ })).toHaveCSS('font-style', 'italic');
    await expect(preview.locator('del').filter({ hasText: /^deleted$/ })).toHaveCSS('text-decoration-line', 'line-through');
    await expect(preview.locator('em strong')).toHaveText('both');
    await expect(preview.locator('a')).toHaveAttribute('href', 'https://example.com');
    await expect(preview.locator('blockquote strong')).toHaveText('important');
    await expect(preview.locator('ul ul em')).toHaveText('Nested');
    await expect(preview.locator('td strong')).toHaveText('Bold cell');
    await expect(preview.locator('p br')).toHaveCount(1);
    await page.emulateMedia({ media: 'print' });
    await expect(bold).toHaveCSS('font-weight', '700');
    await page.emulateMedia({ media: 'screen' });
  }
  await expect(page.locator('.markdown-pages .code-block-wrapper')).toHaveCount(1);
  await expect(page.locator('.markdown-pages .code-block-wrapper')).toContainText('single line **literal**');
  await expect(page.locator('.markdown-pages p code')).toHaveText(['inline **literal**', 'first second']);
});

test('standalone formatting wrappers survive pagination and splitting', async ({ page }) => {
  const longBold = 'Standalone bold text remains bold across page breaks. '.repeat(350).trim();
  await page.locator('textarea').fill(`**BOLD ONLY**\n\n*ITALIC ONLY*\n\n~~STRIKE ONLY~~\n\n\`CODE ONLY\`\n\n**${longBold}**`);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  const preview = page.locator('.markdown-pages');
  await expect(preview.locator('strong').filter({ hasText: /^BOLD ONLY$/ })).toHaveCSS('font-weight', '700');
  await expect(preview.locator('em')).toHaveText('ITALIC ONLY');
  await expect(preview.locator('del')).toHaveText('STRIKE ONLY');
  await expect(preview.locator('p code')).toHaveText('CODE ONLY');
  const fragments = preview.locator('.pagination-text-fragment').filter({ hasText: 'Standalone bold text' });
  expect(await fragments.count()).toBeGreaterThan(1);
  expect(await fragments.evaluateAll(nodes => nodes.every(node => node.querySelector('strong')?.textContent === node.textContent))).toBe(true);
});

test('rich diagram paste preserves emphasis and common formats throughout the document', async ({ page }) => {
  await page.locator('textarea').fill('');
  await paste(page, '<h1>Copied formatting</h1><p><strong>BOLD</strong> and <em>italic</em> and <del>deleted</del>.</p><pre><code class="language-mermaid">flowchart LR\n A--&gt;B</code></pre><p><strong>After diagram</strong> and <code>literal **stars**</code>.</p>', 'Copied formatting\nBOLD and italic and deleted.\nFlattened diagram\nAfter diagram and literal **stars**.');
  await expect(page.locator('.markdown-pages [data-diagram-state="ready"] svg')).toHaveCount(1);
  await expect(page.locator('.markdown-pages strong').filter({ hasText: /^BOLD$/ })).toHaveCSS('font-weight', '700');
  await expect(page.locator('.markdown-pages em')).toHaveCSS('font-style', 'italic');
  await expect(page.locator('.markdown-pages del')).toHaveText('deleted');
  await expect(page.locator('.markdown-pages strong').filter({ hasText: /^After diagram$/ })).toHaveCount(1);
  await expect(page.locator('.markdown-pages p code')).toHaveText('literal **stars**');
});

test('currency keeps prose formatting while numeric and TeX formulas still render', async ({ page }) => {
  const source = '**Cost** $5 and **Fee** $10. **After prices**.\n\nPrices $5, $10, and **Total** $15. Range $5 - $10.\n\nA price $25 next to $x$. Escaped \\$15 and **bold afterward**.\n\nMath $x$, $5+10$, $5 + 10$, $5 + 10 $, $5 + 10\n= 15$, $5+10$2, $5 - 10$, and \\(x^2\\).\n\n$$\n5 + 10 = 15\n$$';
  await page.locator('textarea').fill(source);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  await expect(page.locator('.markdown-pages strong')).toHaveText(['Cost', 'Fee', 'After prices', 'Total', 'bold afterward']);
  await expect(page.locator('.markdown-pages')).toContainText('$5 and Fee $10.');
  await expect(page.locator('.markdown-pages')).toContainText('Prices $5, $10, and Total $15. Range $5 - $10.');
  await expect(page.locator('.markdown-pages')).toContainText('A price $25');
  await expect(page.locator('.markdown-pages')).toContainText('Escaped $15');
  await expect(page.locator('.markdown-pages .katex')).toHaveCount(10);
  await expect(page.locator('.markdown-pages .katex-display')).toHaveCount(1);
  const formulas = await page.locator('.markdown-pages annotation').allTextContents();
  expect(formulas).toEqual(['x', 'x', '5+10', '5 + 10', '5 + 10 ', '5 + 10\n= 15', '5+10', '5 - 10', 'x^2', '5 + 10 = 15']);
});

test('indented code and escaped delimiters survive Markdown extensions unchanged', async ({ page }) => {
  const source = 'Before **BOLD**.\n\n    [img - half - https://example.com/photo.png]\n    \\(literal\\)\n    **literal bold**\n\nEscaped \\`tick, \\(x\\), and \\`tick.\n\nAfter **BOLD**.';
  await page.locator('textarea').fill(source);
  const processed = await page.evaluate(async (text) => {
    const { preprocessMarkdown } = await import(String('/src/diagrams/preprocessMarkdown.ts'));
    return preprocessMarkdown(text);
  }, source);
  expect(processed).toContain('    [img - half - https://example.com/photo.png]\n    \\(literal\\)\n    **literal bold**');
  expect(processed).toContain('Escaped \\`tick, $x$, and \\`tick.');
  await expect(page.locator('.markdown-pages .code-block-wrapper')).toHaveCount(1);
  await expect(page.locator('.markdown-pages .code-block-wrapper')).toContainText('[img - half - https://example.com/photo.png]');
  await expect(page.locator('.markdown-pages .code-block-wrapper strong')).toHaveCount(0);
  await expect(page.locator('.markdown-pages .katex')).toHaveCount(1);
  await expect(page.locator('.markdown-pages strong')).toHaveText(['BOLD', 'BOLD']);
});

test('Word download preserves bold, italic, strike, formatted links, code, and diagrams', async ({ page }) => {
  await page.locator('textarea').fill(formattingDocument + '\n[**linked bold** and *linked italic* and ~~linked strike~~](https://example.com/formatted)\n');
  await expect(page.locator('.markdown-pages [data-diagram-state="ready"] svg')).toHaveCount(1);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  const downloaded = page.waitForEvent('download');
  await page.locator('button[title="Export as Word (.docx)"]').click();
  const download = await downloaded;
  const xml = zipEntry(readFileSync((await download.path())!), 'word/document.xml');
  const runs = Array.from(xml.matchAll(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g), match => match[0]);
  const run = (text: string) => runs.find(value => value.includes(`<w:t xml:space="preserve">${text}</w:t>`))!;
  expect(run('BOLD')).toMatch(/<w:b(?:\s[^>]*)?\/>/);
  expect(run('italic')).toMatch(/<w:i(?:\s[^>]*)?\/>/);
  expect(run('deleted')).toMatch(/<w:strike(?:\s[^>]*)?\/>/);
  expect(run('linked bold')).toMatch(/<w:b(?:\s[^>]*)?\/>/);
  expect(run('linked italic')).toMatch(/<w:i(?:\s[^>]*)?\/>/);
  expect(run('linked strike')).toMatch(/<w:strike(?:\s[^>]*)?\/>/);
  expect(xml).toContain('inline **literal**');
  expect(xml).toContain('single line **literal**');
  expect(xml).toContain('<w:br/>');
  expect(xml).toContain('<w:hyperlink');
  expect(xml).toContain('<asvg:svgBlip');
});

test('typing batches preview work while keeping the editor responsive', async ({ page }) => {
  const paragraph = 'A readable paragraph with **bold**, *italic*, and several words for a longer document. '.repeat(8);
  await page.locator('textarea').fill(Array.from({ length: 80 }, (_, index) => `Paragraph ${index + 1}. ${paragraph}`).join('\n\n'));
  await expect(page.locator('.markdown-pages')).toContainText('Paragraph 80.');
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  await page.locator('textarea').focus();
  await page.locator('textarea').press('Control+End');
  await page.evaluate(() => {
    const metrics = { batches: 0, processing: [] as number[], durations: [] as number[] };
    (window as any).editorMetrics = metrics;
    new MutationObserver(() => metrics.batches++).observe(document.getElementById('markdown-source')!, { childList: true, subtree: true, characterData: true });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) {
        if (['keydown', 'keypress', 'beforeinput', 'input', 'keyup'].includes(entry.name)) {
          metrics.processing.push(entry.processingEnd - entry.processingStart);
          metrics.durations.push(entry.duration);
        }
      }
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
  });
  await page.keyboard.type('abcdefghijkl', { delay: 5 });
  await expect(page.locator('textarea')).toHaveValue(/abcdefghijkl$/);
  await expect(page.locator('.markdown-pages')).toContainText('abcdefghijkl');
  const metrics = await page.evaluate(() => (window as any).editorMetrics);
  console.log('Editor typing metrics:', JSON.stringify({
    previewBatches: metrics.batches,
    maxEventProcessingMs: Math.max(0, ...metrics.processing),
    maxEventDurationMs: Math.max(0, ...metrics.durations),
  }));
  expect(metrics.batches).toBeLessThanOrEqual(2);
});

test('single source newlines retain the Java example and block/code/math structure', async ({ page }) => {
  const java = '**1. Simple:**\nJava is considered simple because its syntax is easy to understand and similar to C and C++. It removes complicated features such as explicit pointer manipulation and supports automatic memory management.';
  const source = `${java}\n\n- **Feature**\n  Second feature line.\n\n\`\`\`text\nfirst code line\nsecond code line\n\`\`\`\n\nMath $5 + 10\n= 15$.\n\n$$\n5 + 10 = 15\n$$`;
  await page.locator('textarea').fill(source);
  const paragraph = page.locator('.markdown-pages p').filter({ hasText: /^1\. Simple:\s*Java is considered/ });
  await expect(paragraph.locator('strong')).toHaveText('1. Simple:');
  await expect(paragraph.locator('strong')).toHaveCSS('font-weight', '700');
  await expect(paragraph.locator('br')).toHaveCount(1);
  await expect(page.locator('.markdown-pages li br')).toHaveCount(1);
  await expect(page.locator('.markdown-pages .code-block-wrapper')).toContainText('first code line');
  await expect(page.locator('.markdown-pages .code-block-wrapper')).toContainText('second code line');
  await expect(page.locator('.markdown-pages .katex')).toHaveCount(2);
  await expect(page.locator('.markdown-pages .katex br')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  await expect(paragraph.locator('br')).toHaveCount(1);
  await page.emulateMedia({ media: 'screen' });
  const downloaded = page.waitForEvent('download');
  await page.locator('button[title="Export as Word (.docx)"]').click();
  const xml = zipEntry(readFileSync((await (await downloaded).path())!), 'word/document.xml');
  expect(xml).toMatch(/1\. Simple:<\/w:t>[\s\S]*?<w:br\/>[\s\S]*?Java is considered simple/);
});

test('exporting immediately after an edit flushes the latest text for Word and print', async ({ page }) => {
  await page.locator('textarea').fill('Previous document.');
  await expect(page.locator('.markdown-pages')).toContainText('Previous document.');
  const downloaded = page.waitForEvent('download');
  await page.locator('textarea').fill('**Latest Word draft**\nNew line saved immediately.');
  await page.locator('button[title="Export as Word (.docx)"]').click();
  const xml = zipEntry(readFileSync((await (await downloaded).path())!), 'word/document.xml');
  expect(xml).toContain('Latest Word draft');
  expect(xml).toContain('New line saved immediately.');
  expect(xml).not.toContain('Previous document.');
  expect(xml).toContain('<w:br/>');
  await page.evaluate(() => {
    window.print = () => { (window as any).printedText = document.querySelector('.markdown-pages')?.textContent; };
  });
  await page.locator('textarea').fill('**Latest PDF draft**\nAnother immediate line.');
  await page.locator('button[title="Export as PDF (print)"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).printedText)).toContain('Latest PDF draft');
});
