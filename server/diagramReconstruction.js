import { RECONSTRUCTION_PROMPT, validateReconstructedGraph } from '../src/diagrams/reconstructionGraph.js';

const MAX_BODY_BYTES = 65536;
const MAX_RESPONSE_BYTES = 262144;

class ServiceError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const send = (response, status, value) => {
  if (response.destroyed || response.writableEnded) return;
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(value));
};

const apiBase = () => {
  if (!process.env.DIAGRAM_API_BASE_URL?.trim()) throw new ServiceError(503, 'The AI service is not configured. Select Gemini or ask the app owner to configure a service.');
  try {
    const url = new URL(process.env.DIAGRAM_API_BASE_URL.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    return url.toString().replace(/\/$/, '');
  } catch { throw new ServiceError(503, 'The reconstruction service URL is not configured correctly.'); }
};

const readBody = async (request, signal) => {
  if (request.body !== undefined) {
    const raw = typeof request.body === 'string' || Buffer.isBuffer(request.body) ? request.body.toString() : JSON.stringify(request.body);
    if (Buffer.byteLength(raw || '') > MAX_BODY_BYTES) throw new ServiceError(413, 'The reconstruction request is too large.');
    try { return JSON.parse(raw); } catch { throw new ServiceError(400, 'The reconstruction request must contain valid JSON.'); }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let finished = false;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      request.removeListener('data', onData);
      request.removeListener('end', onEnd);
      request.removeListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      if (error) { request.resume(); reject(error); }
      else resolve(value);
    };
    const onData = (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BODY_BYTES) { finish(new ServiceError(413, 'The reconstruction request is too large.')); return; }
      chunks.push(bytes);
    };
    const onEnd = () => {
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { finish(new ServiceError(400, 'The reconstruction request must contain valid JSON.')); }
    };
    const onError = (error) => finish(error);
    const onAbort = () => finish(new DOMException('Request cancelled.', 'AbortError'));
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
};

const readUpstream = async (response) => {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new ServiceError(502, 'The configured AI service requires authentication. Use Gemini or another keyless service configuration.');
    if (response.status === 404) throw new ServiceError(502, 'The configured AI endpoint or selected model is unavailable.');
    if (response.status === 429) throw new ServiceError(429, 'The AI service rate limit was reached. Try again later.');
    if (response.status === 400 || response.status === 422) throw new ServiceError(502, 'The AI service rejected this model or reconstruction request. Check the model settings.');
    throw new ServiceError(502, 'The AI service is currently unavailable. Try again later.');
  }
  const declaredSize = Number(response.headers.get('content-length'));
  if (declaredSize > MAX_RESPONSE_BYTES) throw new ServiceError(502, 'The AI service returned too much data.');
  const reader = response.body?.getReader();
  let text;
  if (reader) {
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new ServiceError(502, 'The AI service returned too much data.');
        }
        chunks.push(Buffer.from(value));
      }
      text = Buffer.concat(chunks).toString('utf8');
    } finally { reader.releaseLock(); }
  } else text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new ServiceError(502, 'The AI service returned too much data.');
  try { return JSON.parse(text); }
  catch { throw new ServiceError(502, 'The AI service returned malformed response data.'); }
};

const validModel = (model) => typeof model === 'string' && !!model.trim() && model.length <= 200 && !/[\x00-\x1f\x7f]/.test(model);
const boundedText = (value, limit) => typeof value === 'string' && value.length <= limit;

/**
 * One fixed upstream serves this route. Client-supplied URLs, messages, and
 * credentials are never forwarded; only validated diagram context is used.
 */
export default async function diagramReconstruction(request, response) {
  if (!['GET', 'POST'].includes(request.method || '')) {
    response.setHeader('Allow', 'GET, POST');
    send(response, 405, { error: 'Use GET to list models or POST to reconstruct a diagram.' });
    return;
  }
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  const disconnect = () => { if (!response.writableEnded) cancel(); };
  request.on('aborted', cancel);
  response.on('close', disconnect);
  const timer = setTimeout(() => { timedOut = true; cancel(); }, request.method === 'GET' ? 10000 : 45000);
  try {
    const base = apiBase();
    if (request.method === 'GET') {
      const upstream = await fetch(`${base}/models`, { signal: controller.signal, redirect: 'error' });
      const data = await readUpstream(upstream);
      if (!Array.isArray(data?.data)) throw new ServiceError(502, 'The AI service returned no usable model list. Enter a model ID in Model settings.');
      const models = [...new Set(data.data.map(model => model?.id).filter(validModel).map(model => model.trim()))].slice(0, 100);
      if (!models.length) throw new ServiceError(502, 'The AI service returned no usable models. Enter a model ID in Model settings.');
      send(response, 200, { models });
      return;
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw new ServiceError(415, 'Send reconstruction requests as application/json.');
    const body = await readBody(request, controller.signal);
    const artifact = body?.artifact;
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) || !validModel(body.model) ||
      !boundedText(artifact.heading, 1000) || !boundedText(artifact.contextBefore, 2000) || !boundedText(artifact.contextAfter, 2000) ||
      !boundedText(artifact.labels, 12000) || !artifact.labels.trim()) throw new ServiceError(400, 'Supply a model and bounded diagram labels and context.');
    const context = { heading: artifact.heading, explanationBefore: artifact.contextBefore, explanationAfter: artifact.contextAfter, concatenatedLabels: artifact.labels };
    const schemaDescription = 'Return only one JSON object with direction (TB, LR, BT, or RL), nodes (array of {id:string,label:string}), edges (array of {source:string,target:string,label?:string}), and textOrder (array of {kind:"node"|"edge",index:integer}). No Markdown or commentary.';
    const upstream = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      redirect: 'error',
      body: JSON.stringify({ model: body.model.trim(), stream: false, max_tokens: 10000, messages: [
        { role: 'system', content: `${RECONSTRUCTION_PROMPT}\n${schemaDescription}` },
        { role: 'user', content: JSON.stringify(context) },
      ] }),
    });
    const data = await readUpstream(upstream);
    const choice = data?.choices?.[0];
    if (choice?.finish_reason && choice.finish_reason !== 'stop') throw new ServiceError(502, 'The AI service could not complete this reconstruction. Retry or use original Mermaid source.');
    const output = choice?.message?.content;
    if (typeof output !== 'string' || !output.trim() || output.length > 100000) throw new ServiceError(502, 'The AI service returned no usable graph.');
    const fenced = /^\s*```(?:json)?[ \t]*\r?\n([^]*?)\r?\n```\s*$/i.exec(output);
    let graph;
    try { graph = JSON.parse(fenced ? fenced[1] : output); }
    catch { throw new ServiceError(502, 'The AI service returned malformed graph data. Try again.'); }
    try { graph = validateReconstructedGraph(graph, artifact.labels); }
    catch (error) { throw new ServiceError(502, error.message); }
    send(response, 200, { graph });
  } catch (error) {
    if (response.destroyed || response.writableEnded) return;
    if (timedOut) send(response, 504, { error: 'The reconstruction service timed out. Try again.' });
    else if (controller.signal.aborted) send(response, 499, { error: 'Reconstruction was cancelled.' });
    else if (error instanceof ServiceError) send(response, error.status, { error: error.message });
    else send(response, 502, { error: 'Could not reach the configured AI service. It may be offline or inaccessible.' });
  } finally {
    controller.abort();
    clearTimeout(timer);
    request.removeListener('aborted', cancel);
    response.removeListener('close', disconnect);
  }
}
