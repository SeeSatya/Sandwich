import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { copiedDiagrams } from './fixtures/chatgpt-copies';
import { labeledDecisionCopy } from './fixtures/labeled-decision-copy';

// A private file supplied by the test operator; never put a key in the repo.
const secretFile = process.env.DIAGRAM_GEMINI_SECRET_FILE;
const model = process.env.DIAGRAM_GEMINI_MODEL;
const decisionLabels = new Map(labeledDecisionCopy.graph.nodes.map(node => [node.id, node.label]));
const fixtures = [
  ...copiedDiagrams,
  {
    heading: 'Access approval with arrow labels',
    markdown: labeledDecisionCopy.markdown,
    edges: labeledDecisionCopy.graph.edges.map(edge => [decisionLabels.get(edge.source)!, decisionLabels.get(edge.target)!]),
  },
];

for (const [index, fixture] of fixtures.entries()) {
  test(`live inference preserves reference connections: ${fixture.heading}`, async ({ page }, testInfo) => {
    test.skip(!secretFile, 'Real reconstruction requires a privately supplied Gemini key; mocks do not verify graph quality.');
    test.setTimeout(150000);
    await page.goto('/', { waitUntil: 'commit', timeout: 60000 });
    await page.locator('textarea').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('[title="Document theme"] select').selectOption('Midnight');
    await page.locator('textarea').fill(fixture.markdown);
    const panel = page.getByRole('region', { name: 'Diagram reconstruction' });
    // Never assert/log the key's value or save traces containing request headers.
    await panel.getByLabel('Gemini API key (this session only)').fill(readFileSync(secretFile!, 'utf8').trim());
    if (model) {
      await panel.getByText('Model settings', { exact: true }).click();
      await panel.getByLabel('Gemini model', { exact: true }).fill(model);
    }
    await panel.getByRole('button', { name: 'Reconstruct diagrams', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('Reconstructed 1 diagram', { timeout: 70000 });
    await panel.getByRole('button', { name: 'Clear key', exact: true }).click();
    const svg = page.locator('#markdown-source .mermaid-container svg');
    await expect(svg).toHaveCount(1, { timeout: 45000 });
    await expect(page.locator('.markdown-pages .mermaid-container svg')).toHaveCount(1, { timeout: 45000 });
    // Sanitization intentionally replaces SVG IDs. Compare the editable
    // source's relationships, then verify rendered labels and arrow count.
    const source = await page.locator('textarea').inputValue();
    const chart = source.match(/```mermaid\n([^]*?)\n```/)?.[1] || '';
    const labels = new Map(Array.from(chart.matchAll(/^\s*(n\d+)\["(.*)"\]$/gm), match => [match[1], match[2]]));
    const actual = Array.from(chart.matchAll(/^\s*(n\d+) -->[ ]*(?:\|".*"\|[ ]*)?(n\d+)$/gm), match => [labels.get(match[1]), labels.get(match[2])]);
    expect(await svg.locator('.flowchart-link').count()).toBe(actual.length);
    expect(await svg.locator('.flowchart-link[marker-end]').count()).toBe(actual.length);
    expect((await svg.locator('.nodeLabel').allTextContents()).map(label => label.trim()).sort()).toEqual([...labels.values()].sort());
    await testInfo.attach('reference-edge-comparison', {
      body: JSON.stringify({ expected: fixture.edges, actual }, null, 2), contentType: 'application/json',
    });
    await testInfo.attach('actual-reconstruction', {
      body: await page.locator('.markdown-pages .mermaid-container').first().screenshot(), contentType: 'image/png',
    });
    expect(actual.map(edge => JSON.stringify(edge)).sort()).toEqual(fixture.edges.map(edge => JSON.stringify(edge)).sort());
    if (index === fixtures.length - 1) {
      await expect(svg.locator('.edgeLabel p')).toHaveText(['Approved', 'Denied']);
    }
  });
}
