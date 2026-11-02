import { test, expect } from '@playwright/test';
import { labeledDecisionCopy } from './fixtures/labeled-decision-copy';

const route = '**/api/diagram-reconstruction';
const model = 'organization/chat-model';
const panel = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Diagram reconstruction' });

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit', timeout: 60000 });
  await page.locator('textarea').waitFor({ state: 'visible', timeout: 60000 });
});

// These controlled model responses test transport and UI, not inference quality.
test('keyless recovery discovers a model only on request and preserves arrow labels through the relay', async ({ page }) => {
  const requests: { method: string; url: string; body: any; headers: Record<string, string> }[] = [];
  await page.route(route, async requestRoute => {
    const request = requestRoute.request();
    requests.push({ method: request.method(), url: request.url(), body: request.postDataJSON(), headers: request.headers() });
    await requestRoute.fulfill({ json: request.method() === 'GET' ? { models: [model] } : { graph: labeledDecisionCopy.graph } });
  });
  await page.locator('textarea').fill(labeledDecisionCopy.markdown);
  await expect(panel(page).getByLabel('Reconstruction provider')).toHaveValue('openai');
  await expect(panel(page).getByLabel('Gemini API key (this session only)')).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('Reconstructed 1 diagram');
  expect(requests.map(request => request.method)).toEqual(['GET', 'POST']);
  expect(requests[1].body.model).toBe(model);
  expect(requests[1].body.artifact.labels).toBe(labeledDecisionCopy.labels);
  expect(requests[1].body.artifact.css).toBeUndefined();
  expect(requests[1].headers.authorization).toBeUndefined();
  expect(new URL(requests[1].url).origin).toBe(new URL(page.url()).origin);
  await expect(page.locator('#markdown-source .nodeLabel')).toHaveText(['Request', 'Review', 'Accepted', 'Rejected']);
  await expect(page.locator('#markdown-source .edgeLabel p')).toHaveText(['Approved', 'Denied']);
  await expect(page.locator('.markdown-pages')).toContainText('AI reconstruction — review connections');
  await panel(page).getByRole('button', { name: 'Undo reconstruction', exact: true }).click();
  await expect(page.locator('textarea')).toHaveValue(labeledDecisionCopy.markdown);
});

test('a manually selected model bypasses unavailable discovery and malformed results preserve the copy', async ({ page }) => {
  const methods: string[] = [];
  await page.route(route, async requestRoute => {
    methods.push(requestRoute.request().method());
    await requestRoute.fulfill({ json: { graph: { ...labeledDecisionCopy.graph, nodes: [{ id: 'wrong', label: 'Invented labels' }] } } });
  });
  await page.locator('textarea').fill(labeledDecisionCopy.markdown);
  await panel(page).getByText('Model settings', { exact: true }).click();
  await panel(page).getByLabel('AI model ID (optional)').fill(model);
  await panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('invalid graph');
  expect(methods).toEqual(['POST']);
  await expect(page.locator('textarea')).toHaveValue(labeledDecisionCopy.markdown);
});

test('unconfigured relay reports its actual error and keeps the original document', async ({ page }) => {
  // Uses the real Vite HTTP middleware. No configured endpoint means no remote call.
  test.skip(!!process.env.DIAGRAM_API_BASE_URL, 'This regression checks the explicitly unconfigured state.');
  await page.locator('textarea').fill(labeledDecisionCopy.markdown);
  await panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('not configured');
  await expect(page.locator('textarea')).toHaveValue(labeledDecisionCopy.markdown);
});

test('cancelling model discovery preserves the original and permits retry', async ({ page }) => {
  await page.route(route, async () => { /* Pending until user cancellation. */ });
  await page.locator('textarea').fill(labeledDecisionCopy.markdown);
  await panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Cancel reconstruction', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('cancelled');
  await expect(page.locator('textarea')).toHaveValue(labeledDecisionCopy.markdown);
  await expect(panel(page).getByRole('button', { name: 'Reconstruct diagrams', exact: true })).toBeEnabled();
});
