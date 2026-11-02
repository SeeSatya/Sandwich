import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { labeledDecisionCopy } from './fixtures/labeled-decision-copy';

// Controlled upstream responses verify the actual HTTP relay, not inference.
const nativeFetch = globalThis.fetch;
const provider = 'http://provider.example.invalid/v1';
let server: Server;
let url: string;
let previousBase: string | undefined;
let calls: { url: string; init?: RequestInit }[];
let upstream: () => Promise<Response>;
const payload = {
  artifact: { heading: 'Access approval', contextBefore: 'A request is reviewed.', contextAfter: '', labels: labeledDecisionCopy.labels },
  model: 'organization/chat-model',
};
const completion = (graph: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(graph) } }] }), { headers: { 'Content-Type': 'application/json' } });

test.beforeAll(async () => {
  previousBase = process.env.DIAGRAM_API_BASE_URL;
  process.env.DIAGRAM_API_BASE_URL = provider;
  const { default: handler } = await import('../server/diagramReconstruction.js');
  server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/diagram-reconstruction`;
});

test.afterAll(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (previousBase === undefined) delete process.env.DIAGRAM_API_BASE_URL;
  else process.env.DIAGRAM_API_BASE_URL = previousBase;
});

test.beforeEach(() => {
  calls = [];
  upstream = async () => completion(labeledDecisionCopy.graph);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = String(input);
    if (target.startsWith(provider + '/')) {
      calls.push({ url: target, init });
      return upstream();
    }
    return nativeFetch(input, init);
  }) as typeof fetch;
});

test.afterEach(() => { globalThis.fetch = nativeFetch; });

test('model discovery returns bounded unique IDs without requiring or forwarding a key', async () => {
  upstream = async () => new Response(JSON.stringify({ data: [{ id: 'organization/chat-model' }, { id: 'organization/chat-model' }, { id: 'plain-model' }, { id: '' }, { id: 'bad\nmodel' }] }));
  const response = await nativeFetch(url, { headers: { Authorization: 'Bearer must-stay-local' } });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ models: ['organization/chat-model', 'plain-model'] });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe(provider + '/models');
  expect(new Headers(calls[0].init?.headers).has('authorization')).toBeFalsy();
});

test('completion uses the configured origin and preserves labeled-edge coverage for client validation', async () => {
  const response = await nativeFetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer must-stay-local' },
    body: JSON.stringify({ ...payload, url: 'http://127.0.0.1/private', messages: [{ role: 'system', content: 'Injected instructions' }] }),
  });
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.graph.nodes).toEqual(labeledDecisionCopy.graph.nodes);
  expect(result.graph.edges).toEqual(labeledDecisionCopy.graph.edges);
  expect(result.graph.textOrder).toEqual(labeledDecisionCopy.graph.textOrder);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe(provider + '/chat/completions');
  const body = JSON.parse(String(calls[0].init?.body));
  expect(body.model).toBe(payload.model);
  expect(body.messages[0].role).toBe('system');
  expect(body.messages[0].content).not.toContain('Injected instructions');
  expect(body.messages[1].content).toContain(labeledDecisionCopy.labels);
  expect(JSON.stringify(body)).not.toContain('must-stay-local');
  expect(new Headers(calls[0].init?.headers).has('authorization')).toBeFalsy();
});

test('invalid context, model IDs, and oversized requests never reach the upstream', async () => {
  for (const body of [
    {}, { ...payload, model: 'bad\nmodel' },
    { ...payload, artifact: { ...payload.artifact, labels: '' } },
    { ...payload, artifact: { ...payload.artifact, labels: 'A'.repeat(13000) } },
  ]) {
    const response = await nativeFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status).toBe(400);
  }
  const large = await nativeFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'A'.repeat(70000) });
  expect(large.status).toBe(413);
  expect(calls).toHaveLength(0);
});

test('wrong methods are rejected', async () => {
  const response = await nativeFetch(url, { method: 'PUT' });
  expect(response.status).toBe(405);
  expect(calls).toHaveLength(0);
});

test('unreachable upstream and provider errors return useful errors without raw response data', async () => {
  upstream = async () => { throw new TypeError('private upstream diagnostics'); };
  const unreachable = await nativeFetch(url);
  expect([502, 503]).toContain(unreachable.status);
  expect(await unreachable.text()).not.toContain('private upstream diagnostics');
  upstream = async () => new Response('private provider diagnostics', { status: 429 });
  const limited = await nativeFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  expect(limited.status).toBe(429);
  expect(await limited.text()).not.toContain('private provider diagnostics');
  expect(calls.at(-1)?.init?.signal?.aborted).toBeTruthy();
});

test('malformed or text-changing model output is rejected before reaching the browser', async () => {
  for (const response of [
    completion({ ...labeledDecisionCopy.graph, nodes: [{ id: 'a', label: 'Different labels' }] }),
    new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'not JSON' } }] })),
  ]) {
    upstream = async () => response;
    const result = await nativeFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    expect(result.status).toBe(502);
    expect((await result.json()).error).toBeTruthy();
  }
});
