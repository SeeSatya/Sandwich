import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { replaceChatGptArtifacts } from './artifacts';
import { encodeSvg, sanitizeDiagramSvg } from './svg';

const sourceFence = (source: string): string => {
  const fence = '`'.repeat(Math.max(3, ...Array.from(source.matchAll(/`+/g), (match) => match[0].length + 1)));
  return `${fence}mermaid\n${source.trim()}\n${fence}`;
};

/** Keep the entire copied document and every diagram in its original position. */
export const getChatGptDiagramPaste = (html: string, plainText = ''): string | null => {
  if (!html || typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const assets: string[] = [];
  const assetLabels: string[] = [];
  const candidates = Array.from(doc.querySelectorAll('[data-mermaid-source], pre, svg'));
  candidates.forEach((element) => {
    if (!doc.body.contains(element)) return;
    let source = element.getAttribute('data-mermaid-source')?.trim();
    if (element.tagName.toLowerCase() === 'pre') {
      const code = element.querySelector('code');
      if (code && /(?:language-|lang-)(?:mermaid|chatgpt-mermaid)\b/.test(code.className)) source = code.textContent?.trim();
    }
    const isSvg = element.tagName.toLowerCase() === 'svg' && (
      /^chatgpt-mermaid-|^mermaid-/.test(element.id) ||
      element.getAttribute('aria-roledescription') ||
      element.querySelector('.node, .edgePaths, .actor, .entityBox, .classGroup, .mindmap-node') ||
      element.closest('[id^="chatgpt-mermaid-"], .mermaid')
    );
    if (!source && !isSvg) return;
    let asset: string;
    try { asset = source ? sourceFence(source) : `\`\`\`chatgpt-svg\n${encodeSvg(sanitizeDiagramSvg(element.outerHTML))}\n\`\`\``; }
    catch { return; }
    assets.push(asset);
    const labelClone = element.cloneNode(true) as Element;
    labelClone.querySelectorAll('style, script, defs').forEach((node) => node.remove());
    assetLabels.push(source ? '' : labelClone.textContent || '');
    const placeholder = doc.createElement('div');
    placeholder.setAttribute('data-diagram-placeholder', String(assets.length - 1));
    // Turndown discards blank elements before consulting custom rules.
    placeholder.textContent = 'Diagram';
    const owner = source ? element.closest('.mermaid, [id^="chatgpt-mermaid-"], [data-testid*="mermaid"]') : null;
    // A source panel and rendered SVG can be siblings in one diagram card.
    // Replace the card once, preferring source without importing its SVG twice.
    (owner && owner.querySelectorAll('svg').length === 1 ? owner : element).replaceWith(placeholder);
  });
  if (!assets.length) return null;

  // Preserve Markdown extensions and prose formatting whenever its artifact
  // regions account for every diagram carried by the rich clipboard.
  const normalizeLabels = (value: string) => value.replace(/\s+/g, '');
  let matched = true;
  const recovered = replaceChatGptArtifacts(plainText, (labels, index) => {
    if (!assetLabels[index] || normalizeLabels(labels) !== normalizeLabels(assetLabels[index])) matched = false;
    return assets[index];
  });
  if (matched && recovered.count === assets.length) return recovered.text;

  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  turndown.use(gfm);
  turndown.remove(['script', 'style', 'button', 'iframe', 'noscript']);
  turndown.addRule('diagram', {
    filter: (node) => node instanceof Element && node.hasAttribute('data-diagram-placeholder'),
    replacement: (_content, node) => `\n\n${assets[Number((node as Element).getAttribute('data-diagram-placeholder'))]}\n\n`,
  });
  turndown.addRule('diagramTable', {
    filter: (node) => node instanceof Element && node.localName === 'table' && !!node.querySelector('[data-diagram-placeholder]'),
    replacement: (_content, node) => {
      // Fenced blocks cannot live in a GFM pipe-table cell. Keep the table
      // structure as HTML, with blank-line Markdown inside each real cell.
      const serialize = (element: Element): string => {
        const tag = element.localName;
        if (tag === 'td' || tag === 'th' || tag === 'caption') {
          const attributes = ['colspan', 'rowspan'].filter((name) => /^\d+$/.test(element.getAttribute(name) || ''))
            .map((name) => ` ${name}="${element.getAttribute(name)}"`).join('');
          return `<${tag}${attributes}>\n\n${turndown.turndown(element.innerHTML)}\n\n</${tag}>`;
        }
        if (['table', 'thead', 'tbody', 'tfoot', 'tr'].includes(tag)) {
          return `<${tag}>\n${Array.from(element.children).map(serialize).join('\n')}\n</${tag}>`;
        }
        return '';
      };
      return `\n\n${serialize(node as Element)}\n\n`;
    },
  });
  return turndown.turndown(doc.body);
};
