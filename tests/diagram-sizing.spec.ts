import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const imported = (width: number, height: number, label: string) => {
  const markup = `<svg viewBox=" 0, 0, ${width}, ${height} " xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z"/></marker></defs><rect x="10" y="10" width="${width - 20}" height="${height - 20}" fill="none" stroke="black"/><text x="20" y="35">${label}</text><line x1="20" y1="50" x2="${width - 20}" y2="${height - 20}" stroke="black" marker-end="url(#arrow)"/></svg>`;
  return `\`\`\`chatgpt-svg\n${Buffer.from(markup).toString('base64')}\n\`\`\``;
};

test.beforeEach(async ({ page }) => {
  // System fonts make geometric checks independent of Google Fonts availability.
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  if (process.env.PLAYWRIGHT_TAILWIND_CACHE) {
    const tailwind = readFileSync(process.env.PLAYWRIGHT_TAILWIND_CACHE);
    await page.route('https://cdn.tailwindcss.com**', route => route.fulfill({ contentType: 'application/javascript', body: tailwind }));
  }
  await page.goto('/', { waitUntil: 'commit' });
  await page.locator('textarea').waitFor({ timeout: 60_000 });
});

test('copied diagrams and tall Mermaid flows stay compact without clipping or enlargement', async ({ page }) => {
  const flow = `\`\`\`mermaid\nflowchart TD\n${Array.from({ length: 12 }, (_, i) => `N${i}[Step ${i + 1}] --> N${i + 1}[Step ${i + 2}]`).join('\n')}\n\`\`\``;
  await page.locator('textarea').fill([
    imported(240, 80, 'Small'), imported(1000, 1000, 'Square'),
    imported(1600, 800, 'Wide'), imported(480, 1100, 'Tall'), flow,
  ].join('\n\n'));
  await expect(page.locator('#markdown-source [data-diagram-state="ready"] svg')).toHaveCount(5);
  await expect(page.locator('.markdown-pages [data-diagram-state="ready"] svg')).toHaveCount(5);
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  const dimensions = await page.locator('#markdown-source .mermaid-container svg').evaluateAll(elements => elements.map(element => {
    const svg = element as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    return { width: rect.width, height: rect.height, naturalWidth: svg.viewBox.baseVal.width, naturalHeight: svg.viewBox.baseVal.height };
  }));
  expect(dimensions[0].width).toBe(240);
  expect(dimensions[0].height).toBe(80);
  expect(dimensions[1].height).toBeLessThanOrEqual(400);
  expect(dimensions[1].height).toBeGreaterThan(390);
  expect(dimensions[2].height).toBeLessThanOrEqual(400);
  expect(dimensions[3].height).toBeGreaterThan(400);
  expect(dimensions[3].height).toBeLessThanOrEqual(504);
  expect(dimensions[4].height).toBeGreaterThan(400);
  expect(dimensions[4].height).toBeLessThanOrEqual(720);
  for (const diagram of dimensions) {
    expect(diagram.width).toBeLessThanOrEqual(diagram.naturalWidth);
    expect(diagram.height).toBeLessThanOrEqual(diagram.naturalHeight);
    expect(Math.abs(diagram.height - diagram.width * diagram.naturalHeight / diagram.naturalWidth)).toBeLessThan(2);
  }
  const pages = page.locator('.markdown-pages .mermaid-container');
  for (let i = 0; i < 4; i++) {
    await expect(pages.nth(i).locator('text')).toHaveText(['Small', 'Square', 'Wide', 'Tall'][i]);
    await expect(pages.nth(i).locator('line[marker-end]')).toHaveCount(1);
  }
  await expect(pages.nth(4).locator('.nodeLabel')).toHaveCount(13);
  await expect(pages.nth(4).locator('.flowchart-link')).toHaveCount(12);
  await expect(pages.nth(4)).toContainText('Step 13');
});

test('narrow columns, generated diagrams, and raw ChatGPT SVGs share the size limits', async ({ page }) => {
  const raw = '<svg id="chatgpt-mermaid-sizing-raw" viewBox="0 0 1000 1000" width="1000" height="1000"><rect x="0" y="0" width="1000" height="1000" fill="none" stroke="black"/><text x="20" y="40">Raw square</text></svg>';
  const data = {
    type: 'flowchart', title: 'Generated tall flow',
    nodes: Array.from({ length: 12 }, (_, i) => ({ id: `node${i}`, label: `Stage ${i + 1}` })),
    edges: Array.from({ length: 11 }, (_, i) => ({ source: `node${i}`, target: `node${i + 1}` })),
  };
  await page.locator('textarea').fill(`::: columns\n${imported(1000, 1000, 'Left column')}\n|||\n${imported(1600, 800, 'Right column')}\n:::\n\n${raw}\n\n\`\`\`diagram\n${JSON.stringify(data)}\n\`\`\``);
  await expect(page.locator('.markdown-pages .md-column .mermaid-container svg')).toHaveCount(2);
  await expect(page.locator('.markdown-pages .diagram-svg-renderer svg')).toHaveCount(1);
  await expect(page.locator('.markdown-pages')).toContainText('Stage 12');
  await expect(page.locator('.markdown-pages')).toHaveAttribute('data-pagination-state', 'ready');
  const columns = await page.locator('#markdown-source .md-column svg').evaluateAll(elements => elements.map(svg => ({
    width: svg.clientWidth, columnWidth: svg.closest('.md-column')!.clientWidth, height: svg.clientHeight,
  })));
  expect(columns).toHaveLength(2);
  for (const column of columns) {
    expect(column.width).toBeLessThanOrEqual(column.columnWidth);
    expect(column.height).toBeLessThanOrEqual(400);
    expect(column.width).toBeGreaterThan(100);
  }
  const rawSize = await page.locator('#markdown-source .chatgpt-mermaid-container svg').evaluate(svg => ({ width: svg.clientWidth, height: svg.clientHeight }));
  expect(rawSize).toEqual({ width: 400, height: 400 });
  const generated = await page.locator('#markdown-source .diagram-svg-renderer svg').evaluate(svg => ({ width: svg.clientWidth, height: svg.clientHeight }));
  expect(generated.height).toBeGreaterThan(400);
  expect(generated.height).toBeLessThanOrEqual(720);
});
