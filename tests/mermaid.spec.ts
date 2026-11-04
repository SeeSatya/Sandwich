import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fullDocument = readFileSync(new URL('./fixtures/data-science-toolbox.md', import.meta.url), 'utf8');
const svg = (id: string, label: string) => `<svg id="chatgpt-mermaid-${id}" viewBox="0 0 240 80" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrow-${id}"><path d="M0,0 L5,5 L0,10Z"/></marker></defs><style>#chatgpt-mermaid-${id} .label { color: #1f2937; }</style><rect x="1" y="1" width="130" height="60" fill="#f8fafc"/><path d="M130 30 L230 30" stroke="#475569" marker-end="url(#arrow-${id})"/><foreignObject width="125" height="55"><div xmlns="http://www.w3.org/1999/xhtml" class="label">${label}</div></foreignObject></svg>`;
const paste = async (page: Page, html: string, plain = '') => {
  await page.locator('textarea').evaluate((textarea, data) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', data.html);
    clipboardData.setData('text/plain', data.plain);
    textarea.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData }));
  }, { html, plain });
};
const ready = async (page: Page, count: number) => {
  await expect(page.locator('#markdown-source [data-diagram-state="ready"] svg')).toHaveCount(count);
  await expect(page.locator('.markdown-pages [data-diagram-state="ready"] svg')).toHaveCount(count);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' });
  await page.locator('textarea').waitFor({ timeout: 60_000 });
});

test('prose extensions preserve every fenced source and mixed CommonMark fence length', async ({ page }) => {
  const result = await page.evaluate(async (document) => {
    const { preprocessMarkdown } = await import(String('/src/diagrams/preprocessMarkdown.ts'));
    const { fencedCodeRanges } = await import(String('/src/diagrams/markdownCode.ts'));
    const tricky = 'Before \\(x\\)\n\n````mermaid\nflowchart TD\n A["[img - half - keep-me]"] --> B["\\\\[source\\\\] &amp;"]\n```\n````\n\n~~~mermaid\nflowchart LR\n C((Circle)) -.-> D{Decision}\n~~~~\n\nAfter \\(y\\) and ``\\\\[literal\\\\]``.\n';
    const processed = preprocessMarkdown(tricky);
    const code = (text: string) => fencedCodeRanges(text).map(range => text.slice(range.start, range.end));
    return {
      exact: preprocessMarkdown(document) === document,
      diagramCount: fencedCodeRanges(preprocessMarkdown(document)).filter(range => range.language === 'mermaid').length,
      before: code(tricky), after: code(processed), processed,
      fallback: preprocessMarkdown('# Spiral Model\n#chatgpt-mermaid-test .node {fill:red;}PlanningDesignDevelopmentTesting\n'),
    };
  }, fullDocument);
  expect(result.exact).toBe(true);
  expect(result.diagramCount).toBe(5);
  expect(result.after).toEqual(result.before);
  expect(result.processed).toContain('Before $x$');
  expect(result.processed).toContain('After $y$');
  expect(result.processed).toContain('``\\\\[literal\\\\]``');
  expect(result.fallback).toContain('flowchart LR');
  expect(result.fallback).toContain('PHASE4 -.-> PHASE1');
});

test('complete plain Markdown takes precedence over a rich first diagram', async ({ page }) => {
  await page.locator('textarea').fill('');
  const rich = `<h1>Incomplete rich clipboard</h1><div data-mermaid-source="flowchart TD\n A-->B"></div>`;
  const result = await page.evaluate(async ({ rich, plain }) => {
    const { getChatGptDiagramPaste } = await import(String('/src/diagrams/chatgptClipboard.ts'));
    return getChatGptDiagramPaste(rich, false, plain);
  }, { rich, plain: fullDocument });
  expect(result).toBeNull();
  // A real browser handles the default plain-text insertion when interception
  // returns null; verify the same document through the controlled editor.
  await page.locator('textarea').fill(fullDocument);
  await ready(page, 5);
  await expect(page.locator('textarea')).toHaveValue(fullDocument);
  await expect(page.locator('#markdown-source h1')).toHaveCount(5);
  await expect(page.locator('.markdown-pages h1')).toHaveCount(5);
  await expect(page.locator('.markdown-pages')).toContainText('valuable tools for data analysis and scientific research');
  const dimensions = await page.locator('.markdown-pages .mermaid-container svg').evaluateAll(elements => elements.map(svg => ({
    width: svg.getBoundingClientRect().width, height: svg.getBoundingClientRect().height,
    labels: svg.querySelectorAll('.nodeLabel').length,
    paths: svg.querySelectorAll('.flowchart-link').length,
  })));
  expect(dimensions.map(diagram => diagram.labels)).toEqual([13, 8, 7, 8, 6]);
  expect(dimensions[0].paths).toBe(12);
  expect(dimensions.every(diagram => diagram.width > 50 && diagram.height > 50 && diagram.height < 1000)).toBe(true);
  const printedFontSize = await page.locator('#markdown-source .mermaid-container svg').first().evaluate(svg =>
    16 * svg.getBoundingClientRect().width / (svg as SVGSVGElement).viewBox.baseVal.width);
  expect(printedFontSize).toBeGreaterThan(10);
});

test('rich clipboard keeps multiple source and SVG diagrams with surrounding prose', async ({ page }) => {
  await page.locator('textarea').fill('');
  const html = `<h1>Copied report</h1><p>Before the first diagram.</p><div class="mermaid"><pre><code class="language-mermaid">flowchart TD\n A((Start)) --&gt; B{Decision}\n B -- Yes --&gt; C[Finish]</code></pre>${svg('duplicate', 'Source panel rendering')}</div><p>Between the diagrams.</p>${svg('second', 'Retained SVG label')}<p>After the final diagram.</p>`;
  await paste(page, html, 'Copied report\nBefore the first diagram.\nFlattened labels\nBetween the diagrams.\nFlattened labels\nAfter the final diagram.');
  await ready(page, 2);
  const markdown = await page.locator('textarea').inputValue();
  expect((markdown.match(/```mermaid/g) || []).length).toBe(1);
  expect((markdown.match(/```chatgpt-svg/g) || []).length).toBe(1);
  expect(markdown).toContain('A((Start)) --> B{Decision}');
  await expect(page.locator('.markdown-pages')).toContainText('Before the first diagram');
  await expect(page.locator('.markdown-pages')).toContainText('Between the diagrams');
  await expect(page.locator('.markdown-pages')).toContainText('After the final diagram');
  await expect(page.locator('.markdown-pages')).toContainText('Retained SVG label');
  expect(await page.locator('.markdown-pages .mermaid-container').first().locator('circle, ellipse').count()).toBeGreaterThan(0);
  expect(await page.locator('.markdown-pages .mermaid-container').first().locator('polygon, path').count()).toBeGreaterThan(0);
  const references = await page.locator('.markdown-pages svg').evaluateAll(elements => elements.every(svg => {
    return Array.from(svg.querySelectorAll('[marker-end]')).every(path => {
      const id = path.getAttribute('marker-end')?.match(/#([^)'"\s]+)/)?.[1];
      return !!id && !!svg.querySelector(`[id="${id}"]`);
    });
  }));
  expect(references).toBe(true);
});

test('mixed plain source and rich SVG preserves the second diagram', async ({ page }) => {
  await page.locator('textarea').fill('');
  const html = `<h2>Mixed report</h2><pre><code class="language-mermaid">flowchart LR\n A--&gt;B</code></pre><p>Middle prose</p>${svg('mixed', 'Second diagram')}<p>Final prose</p>`;
  await paste(page, html, '## Mixed report\n```mermaid\nflowchart LR\n A-->B\n```\nMiddle prose\n#chatgpt-mermaid-mixed .label {color:red;}Second diagram\nFinal prose');
  await ready(page, 2);
  await expect(page.locator('.markdown-pages')).toContainText('Middle prose');
  await expect(page.locator('.markdown-pages')).toContainText('Second diagram');
  await expect(page.locator('.markdown-pages')).toContainText('Final prose');
});

test('one bad block stays isolated and rapid edits finish without stale diagrams', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (/generativelanguage|gemini|api\.openai/i.test(request.url())) requests.push(request.url()); });
  await page.locator('textarea').fill('```mermaid\nflowchart TD\nA[Broken\n```\n\nMiddle prose\n\n```mermaid\nflowchart LR\nA-->B\n```\n\nEnd prose');
  await ready(page, 1);
  await expect(page.locator('#markdown-source [data-diagram-state="error"]')).toHaveCount(1);
  await expect(page.locator('.markdown-pages')).toContainText('End prose');
  for (let index = 0; index < 3; index++) await page.locator('textarea').fill(`\`\`\`mermaid\nflowchart TD\n A[Version ${index}] --> B((Done))\n\`\`\``);
  await ready(page, 1);
  await expect(page.locator('.markdown-pages')).toContainText('Version 2');
  await expect(page.locator('.markdown-pages')).not.toContainText('Version 0');
  await expect(page.locator('.mermaid-measurement-host')).toHaveCount(0);
  await expect(page.locator('#markdown-source [data-diagram-state="error"]')).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('wrapped flowchart edges remain a local best-effort fallback', async ({ page }) => {
  await page.locator('textarea').fill('```mermaid\nflowchart LR\n A[Start]\n --> B[Finish]\n```');
  await ready(page, 1);
  await expect(page.locator('.markdown-pages')).toContainText('Start');
  await expect(page.locator('.markdown-pages')).toContainText('Finish');
  await expect(page.locator('.markdown-pages .flowchart-link')).toHaveCount(1);
});

test('theme changes rerender all five diagrams with readable light and dark labels', async ({ page }) => {
  await page.locator('textarea').fill(fullDocument);
  await ready(page, 5);
  const themeSelector = page.locator('[title="Document theme"] select');
  for (const theme of ['Midnight', 'Modern Light']) {
    await themeSelector.selectOption({ label: theme });
    await ready(page, 5);
    // Wait for pagination to carry the newly themed SVGs as well.
    const expectedColor = theme === 'Midnight' ? 'rgb(248, 250, 252)' : 'rgb(31, 41, 55)';
    await expect.poll(() => page.locator('.markdown-pages .mermaid-container .nodeLabel').first().evaluate(label => getComputedStyle(label).color)).toBe(expectedColor);
    const labels = await page.locator('.markdown-pages .mermaid-container .nodeLabel').evaluateAll(elements => elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
    expect(labels).toHaveLength(42);
    expect(labels.every(label => label.width > 0 && label.height > 0)).toBe(true);
    await expect(page.locator('.mermaid-measurement-host')).toHaveCount(0);
  }
});

test('SVG import keeps labels and local arrows while stripping active/external content', async ({ page }) => {
  const markup = svg('unsafe', 'Safe label').replace('</svg>', '<script>alert(1)</script><image href="https://example.com/tracker.png"/><rect onclick="alert(1)" style="fill: url(https://example.com/paint)"/></svg>');
  const result = await page.evaluate(async (markup) => {
    const { sanitizeDiagramSvg } = await import(String('/src/diagrams/svg.ts'));
    const clean = sanitizeDiagramSvg(markup);
    const doc = new DOMParser().parseFromString(clean, 'text/html');
    const svg = doc.querySelector('svg')!;
    const arrow = svg.querySelector('[marker-end]')?.getAttribute('marker-end')?.match(/#([^)'"\s]+)/)?.[1];
    return { clean, arrowExists: !!arrow && !!svg.querySelector(`[id="${arrow}"]`) };
  }, markup);
  expect(result.clean).toContain('Safe label');
  expect(result.clean).toContain('foreignObject');
  expect(result.clean).not.toMatch(/<script|onclick|example\.com/);
  expect(result.arrowExists).toBe(true);
});
