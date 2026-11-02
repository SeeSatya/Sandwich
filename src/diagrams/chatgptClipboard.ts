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
  const ownerSelector = '.mermaid, [id^="chatgpt-mermaid-"], [data-testid*="mermaid"], [data-mermaid-source]';
  type Source = { element: Element; source: string; preserveContainer: boolean; duplicates: Source[] };
  const declarations: Source[] = [];
  const svgs: Element[] = [];
  for (const element of Array.from(doc.querySelectorAll('[data-mermaid-source], pre, svg'))) {
    if (element.localName === 'svg' && element.parentElement?.closest('svg')) continue;
    if (element.localName !== 'svg' && element.closest('svg')) continue;
    let source = element.getAttribute('data-mermaid-source')?.trim();
    if (element.localName === 'pre') {
      const code = element.querySelector('code');
      if (code && /(?:language-|lang-)(?:mermaid|chatgpt-mermaid)\b/.test(code.className)) source = code.textContent?.trim();
    }
    if (source) declarations.push({
      element,
      source,
      // A data attribute can describe a whole card. Its visible prose and
      // children are content, not a source panel to discard.
      preserveContainer: !['pre', 'svg'].includes(element.localName) && element.hasAttribute('data-mermaid-source') &&
        element.childNodes.length > 0 && element.textContent?.trim() !== source,
      duplicates: [],
    });
    const isSvg = element.localName === 'svg' && (
      /^chatgpt-mermaid-|^mermaid-/.test(element.id) ||
      element.getAttribute('aria-roledescription') ||
      element.querySelector('.node, .edgePaths, .actor, .entityBox, .classGroup, .mindmap-node') ||
      element.closest('[id^="chatgpt-mermaid-"], .mermaid')
    );
    if (isSvg) svgs.push(element);
  }

  // Metadata and a nested source panel can encode the same definition. Keep
  // one declaration without comparing labels or guessing graph relationships.
  const sources = declarations.filter((candidate) => {
    const ancestor = declarations.find((other) => other !== candidate &&
      other.element.hasAttribute('data-mermaid-source') && other.element.contains(candidate.element) && other.source === candidate.source);
    if (!ancestor) return true;
    ancestor.duplicates.push(candidate);
    return false;
  });
  type Asset = { anchor: Element; source?: Source; svg?: Element };
  const imports: Asset[] = [];
  const pairedSources = new Set<Source>();
  const pairedSvgs = new Set<Element>();
  const before = (first: Element, second: Element) => first === second ||
    !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
  const owners = Array.from(doc.querySelectorAll(ownerSelector)).reverse();
  for (const owner of owners) {
    const ownedSources = sources.filter((source) => owner.contains(source.element));
    const ownedSvgs = svgs.filter((svg) => owner.contains(svg));
    // A broad wrapper may contain several independent diagrams. Pair only
    // a single source/rendering, leaving ambiguous assets intact.
    if (ownedSources.length !== 1 || ownedSvgs.length !== 1) continue;
    const source = ownedSources[0];
    const svg = ownedSvgs[0];
    if (pairedSources.has(source) || pairedSvgs.has(svg)) continue;
    pairedSources.add(source);
    pairedSvgs.add(svg);
    const anchor = source.preserveContainer || before(svg, source.element) ? svg : source.element;
    imports.push({ anchor, source, svg });
  }
  sources.filter((source) => !pairedSources.has(source)).forEach((source) => imports.push({ anchor: source.element, source }));
  svgs.filter((svg) => !pairedSvgs.has(svg)).forEach((svg) => imports.push({ anchor: svg, svg }));
  imports.sort((first, second) => first.anchor === second.anchor ? 0 : before(first.anchor, second.anchor) ? -1 : 1);

  const discardSource = (source: Source) => {
    if (source.preserveContainer) source.element.removeAttribute('data-mermaid-source');
    else source.element.remove();
    source.duplicates.forEach(discardSource);
  };
  imports.forEach(({ anchor, source, svg }) => {
    if (!doc.body.contains(anchor)) return;
    let asset: string;
    try { asset = source ? sourceFence(source.source) : `\`\`\`chatgpt-svg\n${encodeSvg(sanitizeDiagramSvg(svg!.outerHTML))}\n\`\`\``; }
    catch { return; }
    assets.push(asset);
    const labelClone = svg?.cloneNode(true) as Element | undefined;
    labelClone?.querySelectorAll('style, script, defs').forEach((node) => node.remove());
    assetLabels.push(labelClone?.textContent || '');
    const placeholder = doc.createElement('div');
    placeholder.setAttribute('data-diagram-placeholder', String(assets.length - 1));
    // Turndown discards blank elements before consulting custom rules.
    placeholder.textContent = 'Diagram';
    if (source?.preserveContainer && anchor === source.element) {
      source.element.removeAttribute('data-mermaid-source');
      source.element.prepend(placeholder);
    } else anchor.replaceWith(placeholder);
    if (source && source.element !== anchor) discardSource(source);
    else source?.duplicates.forEach(discardSource);
    if (svg && svg !== anchor) svg.remove();
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
