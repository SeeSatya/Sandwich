import type { ChatGptArtifact } from '../diagrams/artifacts';
import { validateReconstructedGraph, graphToMermaid, RECONSTRUCTION_PROMPT } from '../diagrams/reconstructionGraph.js';
export { validateReconstructedGraph, graphToMermaid } from '../diagrams/reconstructionGraph.js';

export const DEFAULT_RECONSTRUCTION_MODEL = 'gemini-2.5-flash';

export interface ReconstructedGraph {
  direction: 'TB' | 'LR' | 'BT' | 'RL';
  nodes: { id: string; label: string }[];
  edges: { source: string; target: string; label?: string }[];
  textOrder?: ReconstructionTextReference[];
}

export interface ReconstructionTextReference {
  kind: 'node' | 'edge';
  index: number;
}

export type ReconstructionProvider = 'gemini' | 'openai';

const MAX_LABEL_TEXT = 12000;

/** CSS can identify a flowchart family, but cannot identify its connections. */
export const canReconstructArtifact = (artifact: ChatGptArtifact): boolean =>
  /\.flowchart-link\b/.test(artifact.css) && !!artifact.labels.trim() && artifact.labels.length <= MAX_LABEL_TEXT;


const responseSchema = {
  type: 'OBJECT',
  properties: {
    direction: { type: 'STRING', enum: ['TB', 'LR', 'BT', 'RL'] },
    nodes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, label: { type: 'STRING' } }, required: ['id', 'label'] } },
    edges: { type: 'ARRAY', items: { type: 'OBJECT', properties: { source: { type: 'STRING' }, target: { type: 'STRING' }, label: { type: 'STRING' } }, required: ['source', 'target'] } },
    textOrder: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { kind: { type: 'STRING', enum: ['node', 'edge'] }, index: { type: 'INTEGER' } },
        required: ['kind', 'index'],
        propertyOrdering: ['kind', 'index'],
      },
    },
  },
  required: ['direction', 'nodes', 'edges', 'textOrder'],
  propertyOrdering: ['direction', 'nodes', 'edges', 'textOrder'],
};

const validKeylessModel = (model: unknown): model is string => typeof model === 'string' && !!model.trim() && model.length <= 200 && !/[\x00-\x1f\x7f]/.test(model);

const keylessRequest = async (
  init: RequestInit,
  signal?: AbortSignal,
): Promise<any> => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) throw new DOMException('Reconstruction cancelled.', 'AbortError');
  signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
  try {
    const response = await fetch('/api/diagram-reconstruction', { ...init, signal: controller.signal });
    let data: any;
    try { data = await response.json(); }
    catch { throw new Error('The reconstruction route is unavailable. Use the deployed app, its development server, or Gemini.'); }
    if (!response.ok) {
      const message = typeof data?.error === 'string' && data.error.length <= 500 ? data.error : 'The reconstruction service is unavailable. Try again later.';
      throw new Error(message);
    }
    return data;
  } catch (error) {
    if (timedOut) throw new Error('Reconstruction timed out. Try again.');
    if (controller.signal.aborted) throw new DOMException('Reconstruction cancelled.', 'AbortError');
    if (error instanceof TypeError) throw new Error('Could not reach the reconstruction service. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
};

/** Model discovery happens only when recovery is explicitly requested. */
export const discoverReconstructionModels = async (options: { signal?: AbortSignal } = {}): Promise<string[]> => {
  const data = await keylessRequest({ method: 'GET' }, options.signal);
  if (!Array.isArray(data?.models)) throw new Error('The reconstruction service returned no usable model list. Enter a model ID in Model settings.');
  const models = [...new Set<string>(data.models.filter(validKeylessModel).map((model: string) => model.trim()))].slice(0, 100);
  if (!models.length) throw new Error('The reconstruction service returned no usable models. Enter a model ID in Model settings.');
  return models;
};

export const reconstructArtifact = async (
  artifact: ChatGptArtifact,
  apiKey: string,
  options: { signal?: AbortSignal; model?: string; provider?: ReconstructionProvider } = {},
): Promise<string> => {
  if (!canReconstructArtifact(artifact)) throw new Error('This copy does not contain recognizable flowchart labels. Paste Mermaid source or a rendered SVG instead.');
  if (options.provider === 'openai') {
    const model = options.model?.trim() || (await discoverReconstructionModels({ signal: options.signal }))[0];
    if (!validKeylessModel(model)) throw new Error('Enter a valid model ID in Model settings.');
    const result = await keylessRequest({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, artifact: { heading: artifact.heading, contextBefore: artifact.contextBefore, contextAfter: artifact.contextAfter, labels: artifact.labels } }),
    }, options.signal);
    return graphToMermaid(validateReconstructedGraph(result?.graph, artifact.labels));
  }
  if (!apiKey.trim()) throw new Error('Enter a Gemini API key to reconstruct diagrams.');
  const model = options.model || DEFAULT_RECONSTRUCTION_MODEL;
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model)) throw new Error('Invalid Gemini model name.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) throw new DOMException('Reconstruction cancelled.', 'AbortError');
  options.signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: RECONSTRUCTION_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify({ heading: artifact.heading, explanationBefore: artifact.contextBefore, explanationAfter: artifact.contextAfter, concatenatedLabels: artifact.labels }) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.1, maxOutputTokens: 10000 },
      }),
    });
    if (!response.ok) {
      // Do not expose provider response bodies: they can contain request data.
      if (response.status === 400 || response.status === 401 || response.status === 403) throw new Error('Gemini rejected the request. Check your API key and access to the selected model.');
      if (response.status === 404) throw new Error('This Gemini model is unavailable. Enter a model supported by your API key.');
      if (response.status === 429) throw new Error('Gemini quota or rate limit reached. Retry after checking your account quota.');
      throw new Error(`Gemini is unavailable (${response.status}). Try again later.`);
    }
    const payload = await response.json();
    const candidate = payload?.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error('Gemini could not complete this reconstruction. Retry, or use the original diagram source.');
    const output = candidate?.content?.parts?.filter((part: { text?: string; thought?: boolean }) => typeof part.text === 'string' && !part.thought).map((part: { text: string }) => part.text).join('');
    if (!output || output.length > 100000) throw new Error('Gemini returned no usable graph. Retry, or paste the original Mermaid source.');
    let graph: unknown;
    try { graph = JSON.parse(output); } catch { throw new Error('Gemini returned malformed graph data. Try again.'); }
    return graphToMermaid(validateReconstructedGraph(graph, artifact.labels));
  } catch (error) {
    if (timedOut) throw new Error('Reconstruction timed out. Try again.');
    if (controller.signal.aborted) throw new DOMException('Reconstruction cancelled.', 'AbortError');
    if (error instanceof TypeError) throw new Error('Could not reach Gemini. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
};

/** Use the offsets captured from the exact source snapshot, never a new edit. */
export const applyReconstructions = (source: string, artifacts: ChatGptArtifact[], charts: string[]): string => {
  if (artifacts.length !== charts.length) throw new Error('Incomplete diagram reconstruction.');
  let result = source;
  for (let index = artifacts.length - 1; index >= 0; index--) {
    const artifact = artifacts[index];
    const block = ['_AI reconstruction — review connections._', '', '```mermaid', charts[index], '```']
      .join('\n').split('\n').map(line => artifact.indent + line).join('\n');
    result = result.slice(0, artifact.start) + block + result.slice(artifact.end);
  }
  return result;
};
