import { extractChatGptArtifacts, replaceChatGptArtifacts } from './artifacts';
import { MAX_CAPTURE_DIAGRAMS, hasChatGptCssOutsideCode, markCapturedClipboardMarkdown, validateCapturedSvgBlocks } from './capturedClipboard';
import { encodeSvg, sanitizeDiagramSvg } from './svg';

export interface CaptureResult {
  text: string;
  count: number;
  reason?: string;
}
interface SvgSnapshot { labels?: string; markup?: string; reason?: string }
export type DiagramSnapshots = Map<string, SvgSnapshot[]>;
const compact = (text: string) => text.replace(/\s+/g, '');

/** CSS/Markdown escapes encode an ID, never connections or a graph template. */
const artifactId = (css: string): string | null => {
  const match = /^\\?#(chatgpt-mermaid-(?:\\(?:[\da-f]{1,6}[ \t]?|[^\r\n])|[^\s{}.#:[>+~])+)/i.exec(css);
  if (!match) return null;
  return match[1].replace(/\\([\da-f]{1,6})[ \t]?|\\([^\r\n])/gi, (_match, hex: string, character: string) => {
    if (!hex) return character;
    const codePoint = parseInt(hex, 16);
    return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '\ufffd';
  });
};

const snapshotSvg = (svg: SVGSVGElement): SvgSnapshot => {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const dimensions = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (dimensions && (dimensions.length !== 4 || dimensions.some(value => !Number.isFinite(value)) || dimensions[2] <= 0 || dimensions[3] <= 0)) {
    return { reason: 'The live diagram has incomplete dimensions.' };
  }
  const labels = clone.cloneNode(true) as SVGSVGElement;
  labels.querySelectorAll('style, script, defs, title, desc').forEach(element => element.remove());
  // Freeze inherited typography only. Positions, paths, transforms, gradients,
  // and scoped diagram styles remain the original SVG's own data.
  const originals = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const clones = [clone, ...Array.from(clone.querySelectorAll('*'))];
  originals.forEach((element, index) => {
    if (element.localName === 'style' || element.closest('defs')) return;
    const style = svg.ownerDocument.defaultView?.getComputedStyle(element);
    if (!style) return;
    const copied = clones[index] as SVGElement | HTMLElement;
    for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'color', 'line-height']) {
      copied.style.setProperty(property, style.getPropertyValue(property));
    }
    if (['text', 'tspan'].includes(element.localName)) {
      const fill = style.getPropertyValue('fill');
      // Freeze text colors supplied outside the SVG, but never turn a local
      // paint-server reference into a computed absolute URL.
      if (fill && !/url\s*\(/i.test(fill)) copied.style.setProperty('fill', fill);
    }
    if (element.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      for (const property of ['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'text-align', 'white-space']) {
        copied.style.setProperty(property, style.getPropertyValue(property));
      }
    }
  });
  return { labels: compact(labels.textContent || ''), markup: new XMLSerializer().serializeToString(clone) };
};

/** Snapshot now, before promise-backed clipboard payloads or DOM updates run. */
export const snapshotLiveDiagrams = (document: Document): DiagramSnapshots => {
  const snapshots: DiagramSnapshots = new Map();
  for (const element of Array.from(document.querySelectorAll('[id^="chatgpt-mermaid-"]'))) {
    if (element.parentElement?.closest('svg')) continue;
    const svgs = element.localName === 'svg' ? [element] : Array.from(element.querySelectorAll('svg')).filter(svg => !svg.parentElement?.closest('svg'));
    if (!svgs.length) continue;
    let snapshot: SvgSnapshot;
    try { snapshot = svgs.length === 1 ? snapshotSvg(svgs[0] as SVGSVGElement) : { reason: 'The diagram ID matches multiple live renderings.' }; }
    catch { snapshot = { reason: 'The live diagram could not be preserved safely.' }; }
    snapshots.set(element.id, [...(snapshots.get(element.id) || []), snapshot]);
  }
  return snapshots;
};

/** Replace every damaged region together, or return every original byte. */
export const preserveCopiedDiagrams = (text: string, snapshots: DiagramSnapshots): CaptureResult => {
  const artifacts = extractChatGptArtifacts(text);
  if (!artifacts.length) return { text, count: 0, ...(hasChatGptCssOutsideCode(text) ? { reason: 'This copy contains an incomplete diagram stylesheet.' } : {}) };
  if (artifacts.length > MAX_CAPTURE_DIAGRAMS) return { text, count: 0, reason: 'This response contains too many diagrams for one capture.' };
  const encodings: string[] = [];
  for (const artifact of artifacts) {
    const id = artifactId(artifact.css);
    const candidates = id ? snapshots.get(id) : undefined;
    if (!candidates?.length) return { text, count: 0, reason: 'A copied diagram is no longer available in this ChatGPT tab.' };
    if (candidates.length !== 1) return { text, count: 0, reason: 'A copied diagram ID is ambiguous.' };
    const candidate = candidates[0];
    if (!candidate.markup) return { text, count: 0, reason: candidate.reason || 'The live diagram is incomplete.' };
    if (!candidate.labels || candidate.labels !== compact(artifact.labels)) return { text, count: 0, reason: 'The copied labels do not match the live diagram.' };
    try {
      // Only sanitize requested snapshots, after async payloads reveal their
      // IDs. The SVG itself was already frozen synchronously at the write call.
      const clean = sanitizeDiagramSvg(candidate.markup);
      const parsed = new DOMParser().parseFromString(clean, 'text/html').querySelector('svg');
      const viewBox = parsed?.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
      if (!viewBox || viewBox.length !== 4 || viewBox.some(value => !Number.isFinite(value)) || viewBox[2] <= 0 || viewBox[3] <= 0) {
        return { text, count: 0, reason: 'The live diagram has incomplete dimensions.' };
      }
      encodings.push(encodeSvg(clean));
    } catch { return { text, count: 0, reason: 'The live diagram could not be preserved safely.' }; }
  }
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const repaired = replaceChatGptArtifacts(text, (_labels, index) => ['```chatgpt-svg', encodings[index], '```'].join(newline)).text;
  const total = validateCapturedSvgBlocks(repaired);
  if (!total || hasChatGptCssOutsideCode(repaired)) return { text, count: 0, reason: 'The captured Markdown could not be validated.' };
  return { text: markCapturedClipboardMarkdown(repaired, total), count: artifacts.length };
};

export interface CopyCaptureState {
  version: 1;
  installed: boolean;
  lastResult: { count: number; reason?: string } | null;
  uninstall: () => void;
}
export type CaptureWindow = Window & typeof globalThis & { __markmindDiagramCapture?: CopyCaptureState };

const showStatus = (window: CaptureWindow, message: string) => {
  try {
    const document = window.document;
    document.getElementById('markmind-copy-capture-status')?.remove();
    const toast = document.createElement('div');
    toast.id = 'markmind-copy-capture-status';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;left:20px;bottom:20px;z-index:2147483647;max-width:440px;padding:12px 16px;border:1px solid #64748b;border-radius:10px;background:#0f172a;color:#f8fafc;font:14px/1.5 system-ui,sans-serif;box-shadow:0 4px 20px #0004;';
    (document.body || document.documentElement).append(toast);
    window.setTimeout(() => toast.remove(), 7000);
  } catch { /* Feedback must never change clipboard success/failure. */ }
};

/** Main-page-world install. No fetch, storage, graph inference, or write retry. */
export const installNativeCopyCapture = (window: CaptureWindow, notify: (message: string) => void = message => showStatus(window, message)): CopyCaptureState => {
  if (window.__markmindDiagramCapture?.version === 1 && window.__markmindDiagramCapture.installed) return window.__markmindDiagramCapture;
  const clipboard = window.navigator.clipboard;
  const state: CopyCaptureState = { version: 1, installed: false, lastResult: null, uninstall: () => {} };
  const report = (result: Pick<CaptureResult, 'count' | 'reason'>) => {
    state.lastResult = { count: result.count, ...(result.reason ? { reason: result.reason } : {}) };
    try {
      if (result.reason) notify(`Diagrams not preserved: ${result.reason} Original copy kept.`);
      else if (result.count) notify(`Preserved ${result.count} diagram${result.count === 1 ? '' : 's'}. Paste the response into MarkMind.`);
    } catch { /* Optional UI is not part of the native clipboard operation. */ }
  };
  if (!clipboard || (typeof clipboard.write !== 'function' && typeof clipboard.writeText !== 'function')) {
    report({ count: 0, reason: 'This browser does not expose the modern clipboard API.' });
    return state;
  }
  const originalWrite = clipboard.write;
  const originalWriteText = clipboard.writeText;
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  const wrappers = new Map<string, Function>();
  const restore = () => {
    for (const [name, wrapper] of wrappers) {
      if ((clipboard as any)[name] !== wrapper) continue;
      const descriptor = descriptors.get(name);
      if (descriptor) Object.defineProperty(clipboard, name, descriptor);
      else delete (clipboard as any)[name];
    }
    state.installed = false;
  };
  const install = (name: string, wrapper: Function) => {
    descriptors.set(name, Object.getOwnPropertyDescriptor(clipboard, name));
    Object.defineProperty(clipboard, name, { value: wrapper, configurable: true, writable: true });
    wrappers.set(name, wrapper);
  };
  try {
    if (typeof originalWriteText === 'function') install('writeText', function (text: string) {
      let result: CaptureResult = { text, count: 0 };
      if (typeof text === 'string' && hasChatGptCssOutsideCode(text)) {
        try { result = preserveCopiedDiagrams(text, snapshotLiveDiagrams(window.document)); }
        catch { result = { text, count: 0, reason: 'The live diagrams could not be captured.' }; }
      }
      // Keep native DOMString conversion and permission errors for other input.
      return Reflect.apply(originalWriteText, clipboard, [result.text]).then(() => { report(result); });
    });
    if (typeof originalWrite === 'function' && typeof window.ClipboardItem === 'function') install('write', function (items: ClipboardItem[]) {
      if (!Array.isArray(items) || !items.some(item => item?.types?.includes('text/plain'))) return Reflect.apply(originalWrite, clipboard, [items]);
      let snapshots: DiagramSnapshots;
      try { snapshots = snapshotLiveDiagrams(window.document); }
      catch { return Reflect.apply(originalWrite, clipboard, [items]); }
      // One promise prepares every item/type atomically. Call native write in
      // this same stack with lazy blobs, retaining Safari's user activation.
      const preparation = (async () => {
        const payloads = await Promise.all(items.map(async item => {
          const blobs = await Promise.all(item.types.map(async type => [type, await item.getType(type)] as const));
          return new Map(blobs);
        }));
        const results = await Promise.all(payloads.map(async payload => {
          const plain = payload.get('text/plain');
          return plain ? preserveCopiedDiagrams(await plain.text(), snapshots) : { text: '', count: 0 };
        }));
        const failed = results.find(result => result.reason);
        if (!failed) payloads.forEach((payload, index) => {
          if (results[index].count) payload.set('text/plain', new Blob([results[index].text], { type: 'text/plain' }));
        });
        return { payloads, result: failed || { count: results.reduce((sum, result) => sum + result.count, 0) } };
      })();
      let wrapped: ClipboardItem[];
      try {
        wrapped = items.map((item, index) => new window.ClipboardItem(Object.fromEntries(item.types.map(type => {
          const blob = preparation.then(value => value.payloads[index].get(type)!);
          // Native write can reject before it asks ClipboardItem for data.
          // Observe each branch without converting its rejection to success.
          void blob.catch(() => {});
          return [type, blob];
        })), { presentationStyle: item.presentationStyle }));
      } catch {
        // Do not leave rejected preparation/getType promises unobserved.
        void preparation.catch(() => {});
        return Reflect.apply(originalWrite, clipboard, [items]);
      }
      const native = Reflect.apply(originalWrite, clipboard, [wrapped]);
      // Observe preparation even if native rejects before requesting its data.
      void preparation.catch(() => {});
      return native.then(async () => { report((await preparation).result); });
    });
    state.uninstall = restore;
    state.installed = wrappers.size > 0;
    window.__markmindDiagramCapture = state;
    try { notify(state.installed ? 'Diagram copy helper enabled in this tab. Use ChatGPT’s Copy response button.' : 'This browser cannot enable the diagram copy helper.'); } catch {}
  } catch {
    try { restore(); } catch {}
    report({ count: 0, reason: 'This browser does not allow the clipboard methods to be wrapped.' });
  }
  return state;
};
