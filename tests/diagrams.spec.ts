import { test, expect } from '@playwright/test';

const svg = '<svg id="chatgpt-mermaid-example" width="360" height="180" aria-roledescription="flowchart" xmlns="http://www.w3.org/2000/svg"><style>#chatgpt-mermaid-example .node rect{fill:#00284d}#chatgpt-mermaid-example .node p{color:#99ceff;font-size:16px}</style><defs><marker id="arrow"><path d="M0,0L5,3L0,6Z"/></marker></defs><g class="node"><rect width="140" height="70"/><foreignObject width="140" height="70"><div xmlns="http://www.w3.org/1999/xhtml"><p>学习 / Learning</p></div></foreignObject></g><path d="M140,35L260,35" marker-end="url(#arrow)"/></svg>';
const artifact = '\\#chatgpt-mermaid-\\_example\\_{font-family:Arial;}#chatgpt-mermaid-_example_ .node{fill:#00284d;}LearningReasoning';

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit', timeout: 60000 });
  await page.locator('textarea').waitFor({ state: 'visible', timeout: 60000 });
});

test('whole rich document retains prose, structure, and multiple diagrams', async ({ page }) => {
  const result = await page.evaluate(async ({ svg }) => {
    const { getChatGptDiagramPaste } = await import('/src/diagrams/' + 'chatgptClipboard.ts');
    const html = `<h2>Start</h2><p>Before <strong>both diagrams</strong>.</p>${svg}<ul><li>Keep list</li></ul><table><thead><tr><th>Kind</th></tr></thead><tbody><tr><td>Graph</td></tr></tbody></table><pre><code class="language-js">const x = 1;</code></pre><div data-mermaid-source="sequenceDiagram\n A-&gt;&gt;B: Hello"></div><p>After both.</p>`;
    return getChatGptDiagramPaste(html, 'flattened plain text');
  }, { svg });
  expect(result).toContain('## Start');
  expect(result).toContain('**both diagrams**');
  expect(result).toMatch(/- +Keep list/);
  expect(result).toContain('| Kind |');
  expect(result).toContain('const x = 1;');
  expect(result).toContain('sequenceDiagram');
  expect(result).toContain('After both.');
  expect(result!.indexOf('chatgpt-svg')).toBeLessThan(result!.indexOf('sequenceDiagram'));
});

test('rich diagrams repair Markdown artifact positions without losing Markdown extensions', async ({ page }) => {
  const result = await page.evaluate(async ({ svg, artifact }) => {
    const { getChatGptDiagramPaste } = await import('/src/diagrams/' + 'chatgptClipboard.ts');
    return getChatGptDiagramPaste(`${svg}${svg}`, `# Original\n\n::: columns\n\n${artifact.replace('LearningReasoning', '学习 / Learning')}\n\n|||\n\n${artifact.replace('LearningReasoning', '学习 / Learning')}\n\n:::\n\nEnd.`);
  }, { svg, artifact });
  expect(result).toContain('::: columns');
  expect(result).toContain('|||');
  expect(result).toContain('End.');
  expect(result!.match(/```chatgpt-svg/g)).toHaveLength(2);
  expect(result).not.toContain('font-family:Arial');
});

test('flattened diagrams show recovery rather than invented arrows, protecting code', async ({ page }) => {
  const result = await page.evaluate(async ({ artifact }) => {
    const { replaceChatGptArtifacts } = await import('/src/diagrams/' + 'artifacts.ts');
    return replaceChatGptArtifacts(`# Heading\n\n${artifact}\n\nProse after.\n\n\`\`\`text\n${artifact}\n\`\`\``);
  }, { artifact });
  expect(result.count).toBe(1);
  expect(result.text).toContain('Diagram data missing');
  expect(result.text).toContain('Learning · Reasoning');
  expect(result.text).toContain('Prose after.');
  expect(result.text).not.toContain('-->');
  expect(result.text).toContain(`\`\`\`text\n${artifact}`);
});

test('multiline CSS artifacts preserve following Markdown', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { replaceChatGptArtifacts } = await import('/src/diagrams/' + 'artifacts.ts');
    return replaceChatGptArtifacts('#chatgpt-mermaid-x{\n font-size:16px;\n}\n#chatgpt-mermaid-x .node{fill:blue;}\nFirst\nSecond\n\n## Next\nKeep paragraph.');
  });
  expect(result.count).toBe(1);
  expect(result.text).toContain('First Second');
  expect(result.text).toContain('## Next\nKeep paragraph.');
  expect(result.text).not.toContain('fill:blue');
});

test('sanitizer preserves Unicode labels, local markers, scope, and dimensions', async ({ page }) => {
  const result = await page.evaluate(async ({ svg }) => {
    const { sanitizeDiagramSvg } = await import('/src/diagrams/' + 'svg.ts');
    const first = sanitizeDiagramSvg(svg);
    const second = sanitizeDiagramSvg(svg);
    const host = document.createElement('div');
    host.className = 'mermaid-container';
    host.innerHTML = first + second;
    document.body.append(host);
    const diagrams = Array.from(host.querySelectorAll('svg'));
    const result = {
      labels: diagrams.map((diagram) => diagram.textContent),
      dimensions: diagrams.map((diagram) => diagram.getAttribute('viewBox')),
      ids: Array.from(host.querySelectorAll('[id]'), (element) => element.id),
      references: diagrams.map((diagram) => {
        const edge = diagram.querySelector('[marker-end]')!;
        const marker = edge.getAttribute('marker-end')!.match(/#([^)'"\s]+)/)![1];
        return !!diagram.querySelector(`[id="${marker}"]`);
      }),
      colors: Array.from(host.querySelectorAll('p'), (element) => getComputedStyle(element).color),
    };
    host.remove();
    return result;
  }, { svg });
  expect(result.labels.every((label) => label?.includes('学习 / Learning'))).toBeTruthy();
  expect(result.dimensions).toEqual(['0 0 360 180', '0 0 360 180']);
  expect(new Set(result.ids).size).toBe(result.ids.length);
  expect(result.references).toEqual([true, true]);
  expect(result.colors).toEqual(['rgb(153, 206, 255)', 'rgb(153, 206, 255)']);
});

test('sanitizer rejects executable and external SVG resources and global styles', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { sanitizeDiagramSvg } = await import('/src/diagrams/' + 'svg.ts');
    return sanitizeDiagramSvg('<svg viewBox="0 0 100 100" onload="alert(1)"><style>@import "https://bad.invalid/a.css"; body{background:red}.node{fill:url(https://bad.invalid/a.svg)}.node{stroke:blue}</style><script>alert(1)</script><image href="https://bad.invalid/a.png"/><a href="javascript:alert(1)"><rect class="node" width="10" height="10" style="fill:url(\\68 ttp://bad.invalid/a)"/></a><foreignObject><iframe src="https://bad.invalid"/></foreignObject></svg>');
  });
  expect(result).not.toMatch(/script|onload|iframe|https:|javascript:|@import|<image/i);
  expect(result).not.toMatch(/(^|\n)body\s*\{/);
  expect(result).toContain('stroke: blue');
});

test('editor rich paste inserts all diagrams and surrounding text', async ({ page }) => {
  await page.locator('textarea').fill('');
  await page.locator('textarea').evaluate((textarea, svg) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', `<h2>Clipboard start</h2>${svg}<p>Between graphs</p>${svg}<p>Clipboard end</p>`);
    clipboardData.setData('text/plain', 'flattened');
    textarea.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, svg);
  await expect(page.locator('textarea')).toHaveValue(/Clipboard start[\s\S]*chatgpt-svg[\s\S]*Between graphs[\s\S]*chatgpt-svg[\s\S]*Clipboard end/);
  await expect(page.locator('#markdown-source .imported-diagram svg')).toHaveCount(2);
  await expect(page.locator('#markdown-source .imported-diagram p').first()).toHaveCSS('color', 'rgb(153, 206, 255)');
  await expect(page.locator('#markdown-source .imported-diagram p').first()).toHaveCSS('margin-bottom', '0px');
});

const charts = [
  'flowchart TB\n E[Environment] --> S[Sensors / Data Collection]\n S --> D[Data Processing]\n D --> A[AI / Decision Making]\n A --> R[Action / Response]\n R --> F[Feedback]\n F --> S',
  'flowchart TB\n I[Intelligence] --> L[Learning] & R[Reasoning] & P[Problem Solving] & D[Decision Making]\n L & R & P & D --> A[Artificial Intelligence]\n A --> M[Intelligent Machines]',
  'sequenceDiagram\n participant User\n participant System\n User->>System: Request\n System-->>User: Response',
  'stateDiagram-v2\n [*] --> Ready\n Ready --> Working: Start\n Working --> Ready: Finish',
  'classDiagram\n class Machine {\n +learn()\n }\n class Sensor\n Machine --> Sensor',
  'erDiagram\n USER ||--o{ DOCUMENT : writes\n DOCUMENT {\n string title\n }',
  'pie title Data sources\n "Sensors" : 60\n "Users" : 40',
  'mindmap\n root((Intelligence))\n  Learning\n  Reasoning\n  Decisions',
];

test('multiple diagram families render with topology intact', async ({ page }) => {
  await page.locator('textarea').fill(charts.map((chart, index) => `## Diagram ${index + 1}\n\n\`\`\`mermaid\n${chart}\n\`\`\``).join('\n\n'));
  await expect(page.locator('#markdown-source .mermaid-container svg')).toHaveCount(charts.length, { timeout: 45000 });
  await expect(page.locator('#markdown-source [role="alert"]')).toHaveCount(0);
  const graphs = page.locator('#markdown-source .mermaid-container svg');
  expect(await graphs.nth(0).locator('.flowchart-link').count()).toBe(6);
  expect(await graphs.nth(1).locator('.flowchart-link').count()).toBe(9);
  expect(await graphs.nth(0).locator('.nodeLabel').count()).toBe(6);
  await expect(page.locator('.markdown-pages .nodeLabel').first()).toContainText('Environment');
  await expect(page.locator('.markdown-pages .nodeLabel').first()).toBeVisible();
  const labels = await page.locator('#markdown-source .mermaid-container p').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).marginBottom));
  expect(labels.every((margin) => margin === '0px')).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  const cropped = await graphs.evaluateAll((elements) => elements.some((element) => element.getBoundingClientRect().right > element.closest('.mermaid-container')!.getBoundingClientRect().right + 1));
  expect(cropped).toBeFalsy();

  const er = page.locator('#markdown-source .mermaid-container').nth(5).locator('svg');
  const lightId = await er.getAttribute('id');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('[title="Document theme"] select').selectOption('Midnight');
  await expect(er).toHaveCount(1, { timeout: 45000 });
  await expect(er).not.toHaveAttribute('id', lightId!, { timeout: 45000 });
  const contrasts = await er.evaluate(svg => {
    const luminance = (color: string) => {
      const channels = (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(channel => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    return Array.from(svg.querySelectorAll('.row-rect-odd, .row-rect-even')).map(row => {
      const shape = row.querySelector('path, rect') || row;
      const label = row.parentElement!.querySelector('.attribute-type p, .attribute-type text')!;
      const background = luminance(getComputedStyle(shape).fill);
      const foreground = luminance(label.tagName.toLowerCase() === 'text' ? getComputedStyle(label).fill : getComputedStyle(label).color);
      return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
    });
  });
  expect(contrasts.length).toBeGreaterThan(0);
  expect(contrasts.every(contrast => contrast >= 4.5)).toBeTruthy();
});

test('invalid Mermaid and SVG remain visible as recoverable errors in print', async ({ page }) => {
  await page.locator('textarea').fill('```mermaid\nnot-a-diagram\n```\n\n```chatgpt-svg\ninvalid!\n```');
  await expect(page.locator('#markdown-source [role="alert"]')).toHaveCount(2);
  await page.emulateMedia({ media: 'print' });
  expect(await page.locator('.markdown-pages [role="alert"]').count()).toBeGreaterThan(0);
});

test('artifact repair preserves adjacent prose and longer code fences', async ({ page }) => {
  const result = await page.evaluate(async ({ svg, artifact }) => {
    const { replaceChatGptArtifacts, mapMarkdownProse } = await import('/src/diagrams/' + 'artifacts.ts');
    const { getChatGptDiagramPaste } = await import('/src/diagrams/' + 'chatgptClipboard.ts');
    const copied = artifact.replace('LearningReasoning', '学习 / Learning');
    const prose = `${copied}\nThis paragraph must remain.\n- Keep this list item\n\nAfter.`;
    const repaired = getChatGptDiagramPaste(`${svg}<p>This paragraph must remain.</p><ul><li>Keep this list item</li></ul><p>After.</p>`, prose);
    const fenced = `\`\`\`\`markdown\n\`\`\`text\n${artifact}\n\`\`\`\n${artifact}\n\`\`\`\``;
    return { repaired, fallback: replaceChatGptArtifacts(prose).text, fenced, protected: mapMarkdownProse(fenced, () => 'CHANGED') };
  }, { svg, artifact });
  expect(result.repaired).toContain('This paragraph must remain.');
  expect(result.repaired).toContain('- Keep this list item');
  expect(result.repaired).toContain('After.');
  expect(result.fallback).toContain('\nThis paragraph must remain.\n- Keep this list item');
  expect(result.protected).toBe(result.fenced);
});

test('root presentation and safe embedded bitmap resources survive SVG import', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { sanitizeDiagramSvg } = await import('/src/diagrams/' + 'svg.ts');
    return sanitizeDiagramSvg('<svg width="200" height="100" style="font-family:serif;font-size:18px;background:#123456;width:200px;height:100px"><rect width="200" height="100" style="fill:url(https://bad.invalid/a);stroke:blue"/><image href="data:image/png;base64,AAAA//AA==" width="10" height="10"/></svg>');
  });
  expect(result).toContain('font-family: serif');
  expect(result).toContain('font-size: 18px');
  expect(result).toContain('background: rgb(18, 52, 86)');
  expect(result).toContain('data:image/png;base64,AAAA//AA==');
  expect(result).toContain('stroke: blue');
  expect(result).not.toContain('bad.invalid');
  expect(result).not.toContain('width: 200px');
});

test('rich paste retains diagrams and prose inside headed and headerless table cells', async ({ page }) => {
  for (const heading of ['', '<thead><tr><th>Diagram column</th></tr></thead>']) {
    await page.locator('textarea').fill('');
    await page.locator('textarea').evaluate((textarea, { svg, heading }) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', `<table>${heading}<tbody><tr><td>Before first ${svg} Between diagrams ${svg} After second</td></tr></tbody></table><p>After table</p>`);
      textarea.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    }, { svg, heading });
    await expect(page.locator('#markdown-source table .imported-diagram svg')).toHaveCount(2);
    await expect(page.locator('#markdown-source table')).toContainText('Before first');
    await expect(page.locator('#markdown-source table')).toContainText('Between diagrams');
    await expect(page.locator('#markdown-source table')).toContainText('After second');
    await expect(page.locator('textarea')).not.toHaveValue(/data-diagram-placeholder/);
    await expect(page.locator('#markdown-source')).toContainText('After table');
  }
});
