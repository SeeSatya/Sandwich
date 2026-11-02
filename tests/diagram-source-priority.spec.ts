import { test, expect } from '@playwright/test';

const source = 'flowchart TB\n A[Input] --> B[Output]';
const sourcePanel = `<pre><code class="language-mermaid">${source.replaceAll('>', '&gt;')}</code></pre>`;
const svg = '<svg id="chatgpt-mermaid-priority" viewBox="0 0 160 90" xmlns="http://www.w3.org/2000/svg"><g class="node"><text>Input</text></g><g class="node"><text>Output</text></g><path d="M0 0L30 30"/></svg>';

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit', timeout: 60000 });
  await page.locator('textarea').waitFor({ state: 'visible', timeout: 60000 });
});

test('source wins in either card order without losing sibling prose or inserting duplicate diagrams', async ({ page }) => {
  const results = await page.evaluate(async ({ sourcePanel, svg }) => {
    const { getChatGptDiagramPaste } = await import('/src/diagrams/' + 'chatgptClipboard.ts');
    return [[svg, sourcePanel], [sourcePanel, svg]].map(([first, second]) => getChatGptDiagramPaste(
      `<h2>Response</h2><div class="mermaid"><p>Before diagram.</p>${first}<p>Between representations.</p>${second}<p>After diagram.</p></div><p>After card.</p>`,
    ));
  }, { sourcePanel, svg });
  for (const result of results) {
    expect(result?.match(/```mermaid/g)).toHaveLength(1);
    expect(result).not.toContain('chatgpt-svg');
    expect(result).toContain(source);
    expect(result).toContain('Before diagram.');
    expect(result).toContain('Between representations.');
    expect(result).toContain('After diagram.');
    expect(result).toContain('After card.');
    expect(result!.indexOf('```mermaid')).toBeLessThan(result!.indexOf('Between representations.'));
  }
  await page.locator('textarea').fill(results[0]!);
  await expect(page.locator('#markdown-source .mermaid-container svg')).toHaveCount(1, { timeout: 45000 });
  await expect(page.locator('#markdown-source .nodeLabel')).toHaveText(['Input', 'Output']);
  expect(await page.locator('#markdown-source .flowchart-link').count()).toBe(1);
});

test('separate cards keep their diagram and document order inside a broad wrapper', async ({ page }) => {
  const result = await page.evaluate(async ({ sourcePanel, svg }) => {
    const { getChatGptDiagramPaste } = await import('/src/diagrams/' + 'chatgptClipboard.ts');
    return getChatGptDiagramPaste(`<div class="mermaid"><div data-testid="mermaid-card">${svg}<p>First card explanation.</p>${sourcePanel}</div><p>Between cards.</p><div data-testid="mermaid-card"><pre><code class="language-mermaid">sequenceDiagram\n A-&gt;&gt;B: Request</code></pre><p>Second card explanation.</p>${svg}</div></div>`);
  }, { sourcePanel, svg });
  expect(result?.match(/```mermaid/g)).toHaveLength(2);
  expect(result).not.toContain('chatgpt-svg');
  expect(result).toContain('First card explanation.');
  expect(result).toContain('Second card explanation.');
  expect(result!.indexOf('flowchart TB')).toBeLessThan(result!.indexOf('Between cards.'));
  expect(result!.indexOf('Between cards.')).toBeLessThan(result!.indexOf('sequenceDiagram'));
});

test('ambiguous multi-SVG owners retain all independent assets', async ({ page }) => {
  const result = await page.evaluate(async ({ sourcePanel, svg }) => {
    const { getChatGptDiagramPaste } = await import('/src/diagrams/' + 'chatgptClipboard.ts');
    return getChatGptDiagramPaste(`<div class="mermaid">${svg}<p>Between independent renderings.</p>${sourcePanel}${svg}<p>Keep every asset.</p></div>`);
  }, { sourcePanel, svg });
  expect(result?.match(/```chatgpt-svg/g)).toHaveLength(2);
  expect(result?.match(/```mermaid/g)).toHaveLength(1);
  expect(result).toContain('Between independent renderings.');
  expect(result).toContain('Keep every asset.');
  expect(result!.indexOf('chatgpt-svg')).toBeLessThan(result!.indexOf('flowchart TB'));
  expect(result!.lastIndexOf('chatgpt-svg')).toBeGreaterThan(result!.indexOf('flowchart TB'));
});

test('source metadata preserves visible card content and avoids repeated source panels or nested SVG icons', async ({ page }) => {
  const result = await page.evaluate(async ({ source, sourcePanel, svg }) => {
    const { getChatGptDiagramPaste } = await import('/src/diagrams/' + 'chatgptClipboard.ts');
    const withIcon = svg.replace('</svg>', '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg></svg>');
    return getChatGptDiagramPaste(`<div data-mermaid-source="${source.replaceAll('>', '&gt;')}"><h3>Diagram heading</h3><p>Metadata card explanation.</p>${withIcon}${sourcePanel}<p>After representations.</p></div>`);
  }, { source, sourcePanel, svg });
  expect(result?.match(/```mermaid/g)).toHaveLength(1);
  expect(result).not.toContain('chatgpt-svg');
  expect(result).toContain('### Diagram heading');
  expect(result).toContain('Metadata card explanation.');
  expect(result).toContain('After representations.');
});

test('paired SVG labels retain original Markdown extensions when source repairs a CSS artifact', async ({ page }) => {
  const result = await page.evaluate(async ({ sourcePanel, svg }) => {
    const { getChatGptDiagramPaste } = await import('/src/diagrams/' + 'chatgptClipboard.ts');
    return getChatGptDiagramPaste(`<div class="mermaid">${svg}${sourcePanel}</div>`, '# Original\n\n::: columns\n\n#chatgpt-mermaid-copy .node{fill:blue;}InputOutput\n\n|||\n\nKeep original Markdown.\n\n:::');
  }, { sourcePanel, svg });
  expect(result?.match(/```mermaid/g)).toHaveLength(1);
  expect(result).toContain('::: columns');
  expect(result).toContain('|||');
  expect(result).toContain('Keep original Markdown.');
  expect(result).not.toContain('fill:blue');
});

test('source metadata on the SVG itself replaces the rendering without leaking its labels', async ({ page }) => {
  const result = await page.evaluate(async ({ source, svg }) => {
    const { getChatGptDiagramPaste } = await import('/src/diagrams/' + 'chatgptClipboard.ts');
    return getChatGptDiagramPaste(svg.replace('<svg ', `<svg data-mermaid-source="${source.replaceAll('>', '&gt;')}" `));
  }, { source, svg });
  expect(result?.trim()).toBe(`\`\`\`mermaid\n${source}\n\`\`\``);
});
