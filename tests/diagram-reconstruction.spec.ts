import { test, expect, type Page } from '@playwright/test';
import { copiedDiagrams } from './fixtures/chatgpt-copies';
import { labeledDecisionCopy } from './fixtures/labeled-decision-copy';

const api = '**/models/*:generateContent';
const fakeKey = 'test-key-never-persist';
const modelResponse = (graph: unknown) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(graph) }] } }] });
const graphFor = (fixture: typeof copiedDiagrams[number]) => {
  const labels = Array.from(new Set(fixture.edges.flat())).sort((a, b) => fixture.labels.indexOf(a) - fixture.labels.indexOf(b));
  const ids = new Map(labels.map((label, index) => [label, `v${index}`]));
  return { direction: 'TB', nodes: labels.map(label => ({ id: ids.get(label), label })), edges: fixture.edges.map(([source, target]) => ({ source: ids.get(source), target: ids.get(target) })), textOrder: labels.map((_label, index) => ({ kind: 'node', index })) };
};
const panel = (page: Page) => page.getByRole('region', { name: 'Diagram reconstruction' });

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit', timeout: 60000 });
  await page.locator('textarea').waitFor({ state: 'visible', timeout: 60000 });
});

test('actual pasted CSS copies offer explicit recovery without automatic requests', async ({ page }) => {
  let calls = 0;
  await page.route(api, async route => { calls++; await route.abort(); });
  for (const fixture of copiedDiagrams) {
    await page.locator('textarea').fill(fixture.markdown);
    await expect(panel(page)).toContainText('This copy lost its arrows');
    await expect(panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true })).toBeDisabled();
    await expect(page.locator('#markdown-source')).toContainText('Diagram data missing');
  }
  expect(calls).toBe(0);
});

// Mocked responses test integration and failure handling, not AI graph quality.
test('multi-diagram recovery applies validated editable source together, with undo and private key header', async ({ page }) => {
  const original = copiedDiagrams.map(fixture => fixture.markdown).join('\n\n') + '\n\nFinal paragraph.';
  const requests: { url: string; key: string | undefined; body: string }[] = [];
  await page.route(api, async route => {
    const request = route.request();
    requests.push({ url: request.url(), key: request.headers()['x-goog-api-key'], body: request.postData() || '' });
    await route.fulfill({ json: modelResponse(graphFor(copiedDiagrams[requests.length - 1])) });
  });
  await page.locator('textarea').fill(original);
  await panel(page).getByLabel('Gemini API key (this session only)').fill(fakeKey);
  await panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('Reconstructed 3 diagrams');
  const source = await page.locator('textarea').inputValue();
  expect(source.match(/```mermaid/g)).toHaveLength(3);
  expect(source.match(/AI reconstruction — review connections/g)).toHaveLength(3);
  expect(source).toContain('Final paragraph.');
  expect(source).not.toContain('font-family:');
  expect(requests).toHaveLength(3);
  for (const request of requests) {
    expect(request.key).toBe(fakeKey);
    expect(request.url).not.toContain(fakeKey);
    expect(request.body).not.toContain(fakeKey);
    expect(request.body).not.toContain('stroke-dashoffset');
  }
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(fakeKey);
  await expect(page.locator('#markdown-source .mermaid-container svg')).toHaveCount(3, { timeout: 45000 });
  await expect(page.locator('#markdown-source [role="alert"]')).toHaveCount(0);
  await expect(page.locator('.markdown-pages')).toContainText('AI reconstruction — review connections');
  expect(await page.locator('#markdown-source .flowchart-link').count()).toBe(22);
  await panel(page).getByRole('button', { name: 'Clear key', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Clear key', exact: true })).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Undo reconstruction', exact: true }).click();
  await expect(page.locator('textarea')).toHaveValue(original);
});

test('validation rejects missing labels, unknown endpoints, duplicate IDs, and malformed graphs', async ({ page }) => {
  const errors = await page.evaluate(async () => {
    const { validateReconstructedGraph } = await import('/src/services/' + 'diagramReconstruction.ts');
    const good = { direction: 'TB', nodes: [{ id: 'a', label: 'One' }, { id: 'b', label: 'Two' }], edges: [{ source: 'a', target: 'b' }] };
    const invalid: unknown[] = [
      null, [], { ...good, direction: 'sideways' }, { ...good, nodes: null },
      { ...good, nodes: [{ id: 'a', label: 'One' }] },
      { ...good, nodes: [{ id: 'a', label: 'One' }, { id: 'a', label: 'Two' }] },
      { ...good, edges: [{ source: 'a', target: 'missing' }] },
      { ...good, edges: [...good.edges, ...good.edges] },
      { ...good, edges: [] }, { ...good, edges: [null] },
      { ...good, nodes: [{ id: 'a', label: 'Two' }, { id: 'b', label: 'One' }] },
    ];
    return invalid.map(value => {
      try { validateReconstructedGraph(value, 'OneTwo'); return ''; } catch (error) { return String(error); }
    });
  });
  expect(errors.every(Boolean)).toBeTruthy();
});

test('generated Mermaid treats punctuation, markup, Unicode, and source delimiters as label data', async ({ page }) => {
  const labels = ['学习 | "quoted" ] & <script>alert(1)</script> # literal', 'Result \\ path'];
  const source = await page.evaluate(async labels => {
    const { graphToMermaid, validateReconstructedGraph } = await import('/src/services/' + 'diagramReconstruction.ts');
    const edgeLabel = 'yes | "quoted" ]';
    return graphToMermaid(validateReconstructedGraph({ direction: 'TB', nodes: labels.map((label, index) => ({ id: `id${index}`, label })), edges: [{ source: 'id0', target: 'id1', label: edgeLabel }], textOrder: [{ kind: 'node', index: 0 }, { kind: 'node', index: 1 }, { kind: 'edge', index: 0 }] }, labels.join('') + edgeLabel));
  }, labels);
  await page.locator('textarea').fill('```mermaid\n' + source + '\n```');
  await expect(page.locator('#markdown-source .mermaid-container svg')).toHaveCount(1, { timeout: 45000 });
  await expect(page.locator('#markdown-source [role="alert"]')).toHaveCount(0);
  await expect(page.locator('#markdown-source .nodeLabel').first()).toHaveText(labels[0]);
  await expect(page.locator('#markdown-source .nodeLabel').nth(1)).toHaveText(labels[1]);
  expect(await page.locator('#markdown-source svg script').count()).toBe(0);
  expect(await page.locator('#markdown-source .flowchart-link').count()).toBe(1);
});

test('copied edge labels retain their roles and original text order', async ({ page }) => {
  await page.route(api, async route => {
    const body = route.request().postDataJSON();
    expect(body.generationConfig.responseSchema.required).toContain('textOrder');
    await route.fulfill({ json: modelResponse(labeledDecisionCopy.graph) });
  });
  await page.locator('textarea').fill(labeledDecisionCopy.markdown);
  await panel(page).getByLabel('Gemini API key (this session only)').fill(fakeKey);
  await panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('Reconstructed 1 diagram');
  await expect(page.locator('#markdown-source .mermaid-container svg')).toHaveCount(1, { timeout: 45000 });
  await expect(page.locator('#markdown-source .nodeLabel')).toHaveText(['Request', 'Review', 'Accepted', 'Rejected']);
  await expect(page.locator('#markdown-source .edgeLabel p')).toHaveText(['Approved', 'Denied']);
  expect(await page.locator('#markdown-source .flowchart-link').count()).toBe(3);
});

test('text coverage rejects invalid references and invented or omitted edge labels', async ({ page }) => {
  const errors = await page.evaluate(async ({ graph, labels }) => {
    const { validateReconstructedGraph } = await import('/src/services/' + 'diagramReconstruction.ts');
    const invalid: unknown[] = [
      { ...graph, textOrder: undefined },
      { ...graph, textOrder: graph.textOrder.slice(1) },
      { ...graph, textOrder: [graph.textOrder[0], ...graph.textOrder.slice(0, -1)] },
      { ...graph, textOrder: [{ kind: 'edge', index: 0 }, ...graph.textOrder.slice(1)] },
      { ...graph, textOrder: [{ kind: 'edge', index: -1 }, ...graph.textOrder.slice(1)] },
      { ...graph, textOrder: [{ kind: 'edge', index: 1.5 }, ...graph.textOrder.slice(1)] },
      { ...graph, textOrder: [{ kind: 'node', index: 80 }, ...graph.textOrder.slice(1)] },
      { ...graph, textOrder: [{ kind: 'unknown', index: 1 }, ...graph.textOrder.slice(1)] },
      { ...graph, textOrder: [null, ...graph.textOrder.slice(1)] },
      { ...graph, textOrder: [...graph.textOrder].reverse() },
      { ...graph, edges: graph.edges.map((edge, index) => index === 1 ? { ...edge, label: 'Invented condition' } : edge) },
    ];
    return invalid.map(value => {
      try { validateReconstructedGraph(value, labels); return ''; } catch (error) { return String(error); }
    });
  }, labeledDecisionCopy);
  expect(errors.every(Boolean)).toBeTruthy();
});

test('edits during a pending request cancel it and preserve the new document', async ({ page }) => {
  let started = false;
  await page.route(api, async route => {
    started = true;
    await new Promise(resolve => setTimeout(resolve, 1000));
    await route.fulfill({ json: modelResponse(graphFor(copiedDiagrams[0])) }).catch(() => {});
  });
  await page.locator('textarea').fill(copiedDiagrams[0].markdown);
  await panel(page).getByLabel('Gemini API key (this session only)').fill(fakeKey);
  await panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true }).click();
  await expect.poll(() => started).toBeTruthy();
  const edited = copiedDiagrams[0].markdown + '\n\nMy new edit.';
  await page.locator('textarea').fill(edited);
  await expect(panel(page).getByRole('alert')).toContainText('edits are preserved');
  await expect(page.locator('textarea')).toHaveValue(edited);
  await expect(panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true })).toBeEnabled();
});

test('failure on a later diagram keeps all originals and allows a retry', async ({ page }) => {
  let calls = 0;
  await page.route(api, async route => {
    calls++;
    if (calls === 2) await route.fulfill({ status: 429, body: 'Provider error with confidential data' });
    else await route.fulfill({ json: modelResponse(graphFor(copiedDiagrams[0])) });
  });
  const original = copiedDiagrams.slice(0, 2).map(fixture => fixture.markdown).join('\n\n');
  await page.locator('textarea').fill(original);
  await panel(page).getByLabel('Gemini API key (this session only)').fill(fakeKey);
  await panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('quota or rate limit');
  await expect(panel(page)).not.toContainText('confidential data');
  await expect(page.locator('textarea')).toHaveValue(original);
  await expect(panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true })).toBeEnabled();
  await panel(page).getByRole('button', { name: 'Clear key', exact: true }).click();
  await expect(panel(page).getByLabel('Gemini API key (this session only)')).toHaveValue('');
});

test('cancel and timeout preserve the source and permit another request', async ({ page }) => {
  await page.clock.install();
  await page.route(api, async () => { /* Deliberately pending until aborted. */ });
  await page.locator('textarea').fill(copiedDiagrams[0].markdown);
  await panel(page).getByLabel('Gemini API key (this session only)').fill(fakeKey);
  await panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Cancel reconstruction', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('cancelled');
  await expect(page.locator('textarea')).toHaveValue(copiedDiagrams[0].markdown);
  await panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true }).click();
  await page.clock.fastForward(60001);
  await expect(panel(page).getByRole('alert')).toContainText('timed out');
  await expect(page.locator('textarea')).toHaveValue(copiedDiagrams[0].markdown);
});

test('unsupported artifacts and fenced examples cannot trigger reconstruction', async ({ page }) => {
  let calls = 0;
  await page.route(api, async route => { calls++; await route.abort(); });
  await page.locator('textarea').fill('#chatgpt-mermaid-x .messageLine0{stroke:red;}AliceBob');
  await expect(panel(page)).toContainText('cannot be reconstructed as flowcharts');
  await expect(panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true })).toHaveCount(0);
  await page.locator('textarea').fill('````markdown\n' + copiedDiagrams[0].markdown + '\n````');
  await expect(panel(page)).toHaveCount(0);
  expect(calls).toBe(0);
});
