import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = (id = '_r_sample_') => `<svg id="chatgpt-mermaid-${id}" viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg"><style>#chatgpt-mermaid-${id} .node text{fill:#99ceff;font-weight:600}.node rect{fill:#00284d}</style><defs><marker id="arrow-${id}"><path d="M0,0L4,2L0,4Z"/></marker></defs><g class="node" transform="translate(4,8)"><rect width="90" height="35"/><text x="10" y="22">学习 / Input</text></g><g class="node" transform="translate(130,70)"><rect width="90" height="35"/><text x="10" y="22">Result</text></g><path class="original-edge" d="M94 25 C100 25 120 87 130 87" marker-end="url(#arrow-${id})"/></svg>`;
const artifact = (id = '_r_sample_') => `\\#chatgpt-mermaid-${id.replaceAll('_', '\\_')}{font-family:Arial;}#chatgpt-mermaid-${id} .node{fill:blue;}学习 / InputResult`;

test.beforeEach(async ({ page }) => {
  // Pure capture/clipboard tests need a real same-origin browser document,
  // not the application's entire Mermaid bundle on every new context.
  await page.goto('/diagram-copy-check.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
});

test('capture uses live geometry and preserves Unicode, CRLF, prose, and fenced examples', async ({ page }) => {
  const result = await page.evaluate(async ({ svg, artifact }) => {
    const { snapshotLiveDiagrams, preserveCopiedDiagrams } = await import('/src/diagrams/' + 'nativeCopyCapture.ts');
    const { getCapturedClipboardMarkdown } = await import('/src/diagrams/' + 'capturedClipboard.ts');
    const { decodeSvg } = await import('/src/diagrams/' + 'svg.ts');
    const host = document.createElement('div'); host.innerHTML = svg; document.body.append(host);
    const input = `# Different heading\r\n\r\n${artifact}\r\nFollowing prose.\r\n\r\n\`\`\`\`markdown\r\n\`\`\`text\r\n${artifact}\r\n\`\`\`\r\n\`\`\`\``;
    const captured = preserveCopiedDiagrams(input, snapshotLiveDiagrams(document));
    const markdown = getCapturedClipboardMarkdown(captured.text)!;
    const encoded = /```chatgpt-svg\r?\n([^]*?)\r?\n```/.exec(markdown)![1];
    const markup = decodeSvg(encoded);
    const element = new DOMParser().parseFromString(markup, 'text/html').querySelector('svg')!;
    host.remove();
    return { captured, markdown, markup, path: element.querySelector('.original-edge')?.getAttribute('d'), transform: element.querySelector('.node')?.getAttribute('transform') };
  }, { svg: svg(), artifact: artifact() });
  expect(result.captured.count).toBe(1);
  expect(result.captured.text).toMatch(/^<!-- markmind-diagram-capture:v1 diagrams=1 -->\r\n/);
  expect(result.markdown).toContain('# Different heading\r\n\r\n```chatgpt-svg\r\n');
  expect(result.markdown).toContain('Following prose.\r\n\r\n````markdown');
  expect(result.markdown).toContain('```text\r\n' + artifact());
  expect(result.path).toBe('M94 25 C100 25 120 87 130 87');
  expect(result.transform).toBe('translate(4,8)');
  expect(result.markup).toContain('学习 / Input');
  expect(result.markup).toContain('marker-end="url(#diagram-');
});

test('missing, ambiguous, stale, or incomplete diagrams keep the entire original copy', async ({ page }) => {
  const results = await page.evaluate(async ({ svg, artifact }) => {
    const { snapshotLiveDiagrams, preserveCopiedDiagrams } = await import('/src/diagrams/' + 'nativeCopyCapture.ts');
    const host = document.createElement('div'); document.body.append(host);
    const outputs = [];
    for (const markup of [svg, svg + svg, svg.replace('Result', 'Changed'), svg.replace('viewBox="0 0 240 120"', 'viewBox="0 0 0 0"')]) {
      host.innerHTML = markup;
      const input = markup === svg ? `${artifact}\n\n#chatgpt-mermaid-missing{fill:blue;}Absent` : artifact;
      const result = preserveCopiedDiagrams(input, snapshotLiveDiagrams(document));
      outputs.push({ input, ...result });
    }
    host.remove(); return outputs;
  }, { svg: svg(), artifact: artifact() });
  for (const result of results) {
    expect(result.text).toBe(result.input);
    expect(result.count).toBe(0);
    expect(result.reason).toBeTruthy();
  }
});

test('capture supports unrelated SVG diagram families without interpreting their graphs', async ({ page }) => {
  const families = [
    '<g class="actor"><rect width="80" height="30"/><text>Reader</text></g><g><text>Service</text></g><line class="messageLine0" x1="10" y1="40" x2="180" y2="40"/>',
    '<circle class="state" cx="20" cy="20" r="10"/><text>Ready</text><text>Busy</text><path class="transition" d="M20 20L100 90"/>',
    '<path class="slice" d="M100 50L100 0A50 50 0 0 1 150 50Z"/><text>Work</text><text>Other</text>',
    '<g class="entityBox"><rect width="100" height="70"/><text>ENTITY</text><text>string id</text></g><path class="relationshipLine" d="M100 30L180 50"/>',
  ];
  const results = await page.evaluate(async families => {
    const { snapshotLiveDiagrams, preserveCopiedDiagrams } = await import('/src/diagrams/' + 'nativeCopyCapture.ts');
    const { decodeSvg } = await import('/src/diagrams/' + 'svg.ts');
    const host = document.createElement('div'); document.body.append(host);
    const results = families.map((body, index) => {
      host.innerHTML = `<svg id="chatgpt-mermaid-family${index}" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
      const labels = host.querySelector('svg')!.textContent;
      const captured = preserveCopiedDiagrams(`#chatgpt-mermaid-family${index}{font-size:16px;}${labels}`, snapshotLiveDiagrams(document));
      const encoded = /```chatgpt-svg\n([^]*?)\n```/.exec(captured.text)?.[1];
      return { count: captured.count, markup: encoded ? decodeSvg(encoded) : '', body };
    }); host.remove(); return results;
  }, families);
  expect(results.map(result => result.count)).toEqual([1, 1, 1, 1]);
  expect(results[0].markup).toContain('x2="180"');
  expect(results[1].markup).toContain('d="M20 20L100 90"');
  expect(results[2].markup).toContain('d="M100 50L100 0A50 50 0 0 1 150 50Z"');
  expect(results[3].markup).toContain('d="M100 30L180 50"');
});

test('marked plain Markdown wins over stale rich HTML and passes normal SVG rendering', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit', timeout: 60000 });
  await page.locator('textarea').waitFor({ state: 'visible', timeout: 60000 });
  const captured = await page.evaluate(async ({ svg, artifact }) => {
    const { snapshotLiveDiagrams, preserveCopiedDiagrams } = await import('/src/diagrams/' + 'nativeCopyCapture.ts');
    const host = document.createElement('div'); host.innerHTML = svg; document.body.append(host);
    const result = preserveCopiedDiagrams(`# Original prose\n\n${artifact}\n\nAfter.`, snapshotLiveDiagrams(document));
    host.remove(); return result.text;
  }, { svg: svg(), artifact: artifact() });
  await page.locator('textarea').fill('');
  await page.locator('textarea').evaluate((element, { captured, svg }) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', captured);
    clipboardData.setData('text/html', `<h2>Stale rich copy</h2>${svg}<p>Different prose.</p>`);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, { captured, svg: svg() });
  await expect(page.locator('textarea')).toHaveValue(/^# Original prose\n\n```chatgpt-svg/);
  await expect(page.locator('textarea')).not.toHaveValue(/markmind-diagram-capture|Stale rich copy/);
  await expect(page.locator('#markdown-source .imported-diagram svg')).toHaveCount(1);
  await expect(page.locator('#markdown-source .original-edge')).toHaveAttribute('d', 'M94 25 C100 25 120 87 130 87');
  await expect(page.locator('#markdown-source')).toContainText('After.');
});

test('routing marker rejects incomplete or mismatched SVG blocks without trusting its claim', async ({ page }) => {
  const result = await page.evaluate(async ({ svg, artifact }) => {
    const { getCapturedClipboardMarkdown } = await import('/src/diagrams/' + 'capturedClipboard.ts');
    const { encodeSvg } = await import('/src/diagrams/' + 'svg.ts');
    const block = `\`\`\`chatgpt-svg\n${encodeSvg(svg)}\n\`\`\``;
    return [
      `<!-- markmind-diagram-capture:v1 diagrams=2 -->\n${block}`,
      `<!-- markmind-diagram-capture:v1 diagrams=1 -->\n\`\`\`chatgpt-svg\nINVALID\n\`\`\``,
      `<!-- markmind-diagram-capture:v1 diagrams=1 -->\n${block.slice(0, -3)}`,
      `<!-- markmind-diagram-capture:v1 diagrams=1 -->\n${block}\n\n${artifact}`,
      `<!-- markmind-diagram-capture:v1 diagrams=101 -->\n${block}`,
      `Prose\n<!-- markmind-diagram-capture:v1 diagrams=1 -->\n${block}`,
    ].map(getCapturedClipboardMarkdown);
  }, { svg: svg(), artifact: artifact() });
  expect(result).toEqual([null, null, null, null, null, null]);
});

test('unparsed malformed CSS prevents partial capture and routing while code examples stay intact', async ({ page }) => {
  const result = await page.evaluate(async ({ svg, artifact }) => {
    const { snapshotLiveDiagrams, preserveCopiedDiagrams } = await import('/src/diagrams/' + 'nativeCopyCapture.ts');
    const { getCapturedClipboardMarkdown } = await import('/src/diagrams/' + 'capturedClipboard.ts');
    const host = document.createElement('div'); host.innerHTML = svg; document.body.append(host);
    const snapshots = snapshotLiveDiagrams(document);
    const malformed = '#chatgpt-mermaid-missing{broken';
    const complete = preserveCopiedDiagrams(artifact, snapshots);
    const malformedCopies = [malformed, '#chatgpt-mermaid-missing\n{broken', '#chatgpt-mermaid-truncated'].map(incomplete => {
      const original = `${artifact}\n\n${incomplete}`;
      return { original, partial: preserveCopiedDiagrams(original, snapshots), rejected: getCapturedClipboardMarkdown(`${complete.text}\n\n${incomplete}`) };
    });
    const examples = `\n\n\`${malformed}\`\n\n\`\`\`text\n${malformed}\n\`\`\``;
    const protectedCopy = preserveCopiedDiagrams(`${artifact}${examples}`, snapshots);
    const protectedMarkdown = getCapturedClipboardMarkdown(protectedCopy.text);
    const alone = preserveCopiedDiagrams(malformed, snapshots);
    host.remove();
    return { malformedCopies, examples, protectedCopy, protectedMarkdown, alone, malformed };
  }, { svg: svg(), artifact: artifact() });
  for (const copy of result.malformedCopies) {
    expect(copy.partial.text).toBe(copy.original);
    expect(copy.partial.count).toBe(0);
    expect(copy.partial.reason).toBeTruthy();
    expect(copy.rejected).toBeNull();
  }
  expect(result.protectedCopy.count).toBe(1);
  expect(result.protectedMarkdown).toContain(result.examples);
  expect(result.alone.text).toBe(result.malformed);
  expect(result.alone.reason).toContain('incomplete');
});

test('writeText transforms synchronously, ordinary copies pass through, installation is reversible', async ({ page }) => {
  const result = await page.evaluate(async ({ svg, artifact }) => {
    const { installNativeCopyCapture } = await import('/src/diagrams/' + 'nativeCopyCapture.ts');
    const host = document.createElement('div'); host.innerHTML = svg; document.body.append(host);
    const calls: string[] = [];
    const original = (value: string) => { calls.push(value); return Promise.resolve(); };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: original } });
    const state = installNativeCopyCapture(window, () => {});
    const second = installNativeCopyCapture(window, () => {});
    const promise = navigator.clipboard.writeText(artifact);
    const immediate = calls[0];
    host.remove(); await promise;
    await navigator.clipboard.writeText('ordinary copy');
    state.uninstall();
    return { immediate, calls, idempotent: state === second, restored: navigator.clipboard.writeText === original, installed: state.installed };
  }, { svg: svg(), artifact: artifact() });
  expect(result.immediate).toMatch(/^<!-- markmind-diagram-capture:v1 diagrams=1 -->/);
  expect(result.calls[1]).toBe('ordinary copy');
  expect(result.idempotent).toBe(true);
  expect(result.restored).toBe(true);
  expect(result.installed).toBe(false);
});

test('write calls native immediately while delayed MIME promises use the original DOM snapshot', async ({ page }) => {
  const result = await page.evaluate(async ({ svg, artifact }) => {
    const { installNativeCopyCapture } = await import('/src/diagrams/' + 'nativeCopyCapture.ts');
    const { decodeSvg } = await import('/src/diagrams/' + 'svg.ts');
    const host = document.createElement('div'); host.innerHTML = svg; document.body.append(host);
    const received: { [type: string]: string }[] = [];
    let calls = 0;
    let release: (blob: Blob) => void;
    const delayed = new Promise<Blob>(resolve => { release = resolve; });
    class Item {
      types: string[]; presentationStyle = 'inline';
      constructor(private data: Record<string, Blob | Promise<Blob>>, _options?: any) { this.types = Object.keys(data); }
      async getType(type: string) { return await this.data[type]; }
    }
    Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: Item });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async (items: Item[]) => {
      calls++;
      for (const item of items) {
        const payload: Record<string, string> = {};
        for (const type of item.types) payload[type] = await (await item.getType(type)).text();
        received.push(payload);
      }
    } } });
    const state = installNativeCopyCapture(window, () => {});
    const html = '<p>Native rich HTML including CSS is unchanged.</p>';
    const item = new Item({ 'text/plain': delayed, 'text/html': new Blob([html], { type: 'text/html' }), 'application/x-test': new Blob(['opaque bytes\u0000'], { type: 'application/x-test' }) });
    const copying = navigator.clipboard.write([item as unknown as ClipboardItem]);
    const immediateCalls = calls;
    host.querySelector('.original-edge')!.setAttribute('d', 'M0 0L1 1');
    host.remove(); release!(new Blob([artifact], { type: 'text/plain' }));
    await copying;
    const encoded = /```chatgpt-svg\n([^]*?)\n```/.exec(received[0]['text/plain'])![1];
    return { immediateCalls, calls, html, received, markup: decodeSvg(encoded), result: state.lastResult };
  }, { svg: svg(), artifact: artifact() });
  expect(result.immediateCalls).toBe(1);
  expect(result.calls).toBe(1);
  expect(result.received[0]['text/html']).toBe(result.html);
  expect(result.received[0]['application/x-test']).toBe('opaque bytes\u0000');
  expect(result.markup).toContain('d="M94 25 C100 25 120 87 130 87"');
  expect(result.result.count).toBe(1);
});

test('write preserves every MIME payload across all items when one diagram is missing', async ({ page }) => {
  const result = await page.evaluate(async ({ svg, artifact }) => {
    const { installNativeCopyCapture } = await import('/src/diagrams/' + 'nativeCopyCapture.ts');
    const host = document.createElement('div'); host.innerHTML = svg; document.body.append(host);
    const received: string[][] = [];
    class Item {
      types: string[]; presentationStyle = 'unspecified';
      constructor(private data: Record<string, Blob | Promise<Blob>>, _options?: any) { this.types = Object.keys(data); }
      async getType(type: string) { return await this.data[type]; }
    }
    Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: Item });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async (items: Item[]) => {
      for (const item of items) received.push(await Promise.all(item.types.map(async type => (await item.getType(type)).text())));
    } } });
    const state = installNativeCopyCapture(window, () => {});
    const missing = '#chatgpt-mermaid-missing{fill:blue;}Missing';
    await navigator.clipboard.write([
      new Item({ 'text/plain': new Blob([artifact]), 'text/html': new Blob(['first HTML']) }),
      new Item({ 'text/plain': new Blob([missing]), 'text/html': new Blob(['second HTML']) }),
    ] as unknown as ClipboardItem[]);
    host.remove(); return { received, missing, result: state.lastResult };
  }, { svg: svg(), artifact: artifact() });
  expect(result.received).toEqual([[artifact(), 'first HTML'], [result.missing, 'second HTML']]);
  expect(result.result.count).toBe(0);
  expect(result.result.reason).toContain('no longer available');
});

test('native rejection and payload rejection remain original errors with no second clipboard write', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { installNativeCopyCapture } = await import('/src/diagrams/' + 'nativeCopyCapture.ts');
    const permission = new DOMException('Native permission denied', 'NotAllowedError');
    let calls = 0;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => { calls++; return Promise.reject(permission); } } });
    const state = installNativeCopyCapture(window, () => {});
    let samePermission = false;
    try { await navigator.clipboard.writeText('ordinary text'); } catch (error) { samePermission = error === permission; }
    state.uninstall();
    const failure = new Error('Original lazy payload failure');
    class Item {
      types = ['text/plain']; presentationStyle = 'unspecified';
      constructor(private data?: Record<string, Promise<Blob>>, _options?: any) {}
      async getType(type: string): Promise<Blob> { if (!this.data) throw failure; return await this.data[type]; }
    }
    Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: Item });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async (items: Item[]) => { calls++; await items[0].getType('text/plain'); } } });
    installNativeCopyCapture(window, () => {});
    let samePayload = false;
    try { await navigator.clipboard.write([new Item() as unknown as ClipboardItem]); } catch (error) { samePayload = error === failure; }
    return { calls, samePermission, samePayload };
  });
  expect(result).toEqual({ calls: 2, samePermission: true, samePayload: true });
});

test('self-contained userscript runs before native Copy response in a controlled ChatGPT page', async ({ page }) => {
  const bundle = readFileSync('public/diagram-copy-helper.user.js', 'utf8');
  await page.route('https://chatgpt.com/c/capture-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><button id="copy">Copy response</button></body></html>' }));
  await page.goto('https://chatgpt.com/c/capture-test');
  await page.evaluate(({ svg, artifact }) => {
    document.body.insertAdjacentHTML('beforeend', svg);
    const payloads: string[] = [];
    (window as any).copiedPayloads = payloads;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { payloads.push(text); } } });
    document.querySelector('#copy')!.addEventListener('click', () => { void navigator.clipboard.writeText(artifact); });
  }, { svg: svg(), artifact: artifact() });
  await page.addScriptTag({ content: bundle });
  await page.getByRole('button', { name: 'Copy response' }).click();
  await expect(page.locator('#markmind-copy-capture-status')).toContainText('Preserved 1 diagram');
  expect(await page.evaluate(() => (window as any).copiedPayloads[0])).toMatch(/^<!-- markmind-diagram-capture:v1 diagrams=1 -->/);
});

test('early native rejection observes all delayed failing MIME branches without retrying', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { installNativeCopyCapture } = await import('/src/diagrams/' + 'nativeCopyCapture.ts');
    const unhandled: string[] = [];
    window.addEventListener('unhandledrejection', event => { unhandled.push(String(event.reason)); });
    let fail: (error: Error) => void;
    const delayed = new Promise<Blob>((_resolve, reject) => { fail = reject; });
    class Item {
      types: string[]; presentationStyle = 'unspecified';
      constructor(private data: Record<string, Blob | Promise<Blob>>, _options?: any) { this.types = Object.keys(data); }
      async getType(type: string) { return await this.data[type]; }
    }
    Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: Item });
    const denied = new DOMException('Native write refused immediately', 'NotAllowedError');
    let calls = 0;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: () => { calls++; return Promise.reject(denied); } } });
    installNativeCopyCapture(window, () => {});
    let originalError = false;
    try {
      await navigator.clipboard.write([new Item({ 'text/plain': delayed, 'text/html': new Blob(['original HTML']) }) as unknown as ClipboardItem]);
    } catch (error) { originalError = error === denied; }
    fail!(new Error('Late original payload rejection'));
    await new Promise(resolve => setTimeout(resolve, 50));
    return { calls, originalError, unhandled };
  });
  expect(result).toEqual({ calls: 1, originalError: true, unhandled: [] });
});

test('real browser ClipboardItems round-trip captured plain SVG while retaining native rich HTML', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(async ({ svg, artifact }) => {
    const { installNativeCopyCapture } = await import('/src/diagrams/' + 'nativeCopyCapture.ts');
    document.body.insertAdjacentHTML('beforeend', svg + '<button id="real-capture-copy">Copy actual clipboard</button>');
    installNativeCopyCapture(window, () => {});
    document.querySelector('#real-capture-copy')!.addEventListener('click', () => {
      const plain = Promise.resolve(new Blob([artifact], { type: 'text/plain' }));
      const item = new ClipboardItem({ 'text/plain': plain, 'text/html': new Blob(['<p>Native rich content</p>'], { type: 'text/html' }) });
      (window as any).realCaptureCopy = navigator.clipboard.write([item]);
    });
  }, { svg: svg(), artifact: artifact() });
  await page.getByRole('button', { name: 'Copy actual clipboard' }).click();
  const result = await page.evaluate(async () => {
    await (window as any).realCaptureCopy;
    const items = await navigator.clipboard.read();
    return { plain: await (await items[0].getType('text/plain')).text(), html: await (await items[0].getType('text/html')).text() };
  });
  expect(result.plain).toMatch(/^<!-- markmind-diagram-capture:v1 diagrams=1 -->/);
  expect(result.plain).toContain('```chatgpt-svg');
  expect(result.html).toContain('<p>Native rich content</p>');
});
