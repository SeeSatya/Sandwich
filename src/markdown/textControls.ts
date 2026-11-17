import type { Root } from 'mdast';

type Alignment = 'left' | 'center' | 'right' | 'justify';
type TextFormat = 'bold' | 'italic' | 'underline' | 'strike' | 'highlight';

interface ControlNode {
  type: string;
  value?: string;
  children?: ControlNode[];
  align?: (Alignment | null)[];
  position?: { start: { offset?: number; column: number }; end: { offset?: number } };
  data?: { hName?: string; hProperties?: Record<string, unknown>; [key: string]: unknown };
}

interface TextControl {
  prefix: string;
  alignment?: Alignment;
  formats: TextFormat[];
}

const alignments = new Set(['left', 'center', 'right', 'justify']);
const formats = new Set(['bold', 'italic', 'underline', 'strike', 'highlight']);
const supportedBlocks = new Set(['paragraph', 'heading', 'list', 'blockquote', 'table']);
const phrasingBlocks = new Set(['paragraph', 'heading', 'tableCell']);

const parseControl = (raw: string): TextControl | null => {
  const match = /^\[(align|text)[ \t]+-[ \t]+([^\]\r\n]+)\]/.exec(raw);
  if (!match) return null;
  const options = match[2].split(/[ \t]+-[ \t]+/).map(option => option.trim());
  if (match[1] === 'align' && (options.length !== 1 || !alignments.has(options[0]))) return null;
  if (options.some(option => !alignments.has(option) && !formats.has(option))) return null;
  let alignment: Alignment | undefined;
  const textFormats: TextFormat[] = [];
  for (const option of options) {
    if (alignments.has(option)) alignment = option as Alignment;
    else if (!textFormats.includes(option as TextFormat)) textFormats.push(option as TextFormat);
  }
  return { prefix: match[0], alignment, formats: textFormats };
};

const annotateAlignment = (node: ControlNode, alignment: Alignment) => {
  node.data = { ...node.data, hProperties: { ...node.data?.hProperties, 'data-md-align': alignment } };
};

const formatPhrasing = (children: ControlNode[], format: TextFormat): ControlNode[] => {
  const type = format === 'bold' ? 'strong' : format === 'italic' ? 'emphasis' : format === 'strike' ? 'delete' : 'textControlFormat';
  const hName = format === 'highlight' ? 'mark' : format === 'underline' ? 'u' : undefined;
  return [{ type, ...(hName ? { data: { hName } } : {}), children }];
};

// Annotate existing semantic blocks rather than enclosing them in a div:
// pagination and Word export must still recognize lists, tables and quotes.
const applyControl = (node: ControlNode, control: TextControl, alignment = control.alignment) => {
  if (alignment && (supportedBlocks.has(node.type) || node.type === 'listItem' || node.type === 'tableCell')) {
    annotateAlignment(node, alignment);
  }
  if (phrasingBlocks.has(node.type)) {
    for (const format of control.formats) node.children = formatPhrasing(node.children ?? [], format);
    return;
  }
  if (node.type === 'table') {
    node.children?.forEach(row => row.children?.forEach((cell, index) => {
      // GFM's explicit per-column alignment takes precedence over a prefix.
      applyControl(cell, control, node.align?.[index] ?? alignment);
    }));
    return;
  }
  node.children?.forEach(child => {
    if (!['code', 'html', 'math'].includes(child.type)) applyControl(child, control, alignment);
  });
};

const voidHtml = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// Attribute values may contain both angle brackets and text such as "/>".
// Consume a complete tag before looking for another one so those characters
// cannot close a container or introduce a spurious nested tag.
function* htmlTags(html: string) {
  const starts = /<(\/?)([a-z][\w:-]*)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = starts.exec(html))) {
    let quote: string | null = null;
    let end = starts.lastIndex;
    for (; end < html.length; end++) {
      const character = html[end];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '>') break;
    }
    if (end === html.length) return;
    const raw = html.slice(match.index, end + 1);
    starts.lastIndex = end + 1;
    yield { name: match[2].toLowerCase(), closing: Boolean(match[1]), selfClosing: /\/\s*>$/.test(raw) };
  }
}

/** One-block text prefixes and explicit page breaks, only in document-root Markdown. */
export default function remarkTextControls() {
  return (tree: Root, file: { value: unknown }) => {
    const root = tree as unknown as ControlNode;
    const source = String(file.value);
    const children = root.children ?? [];
    const htmlStack: string[] = [];
    const rawNode = (node: ControlNode) => source.slice(node.position?.start.offset, node.position?.end.offset);
    const isRootParagraph = (node: ControlNode) => node.type === 'paragraph' && node.position?.start.column === 1;

    for (let index = 0; index < children.length; index++) {
      const node = children[index];
      // Columns are preprocessed into HTML divs before remark runs. Their
      // intervening Markdown still appears as root AST nodes, so track HTML
      // containers to keep nested prefixes literal there as well.
      if (node.type === 'html') {
        const html = (node.value ?? '').replace(/<!--[\s\S]*?-->/g, '');
        for (const tag of htmlTags(html)) {
          if (tag.closing) {
            const opened = htmlStack.lastIndexOf(tag.name);
            if (opened !== -1) htmlStack.splice(opened);
          } else if (!voidHtml.has(tag.name) && !tag.selfClosing) htmlStack.push(tag.name);
        }
        continue;
      }
      if (htmlStack.length || !isRootParagraph(node)) continue;
      const raw = rawNode(node);
      if (raw.trimEnd() === '[pagebreak]') {
        children[index] = { type: 'html', value: '<div data-md-pagebreak="true"></div>' };
        continue;
      }
      const control = parseControl(raw);
      if (!control) continue;
      const first = node.children?.[0];
      // Raw positions retain escapes which Markdown text nodes have decoded.
      // Requiring the same literal prefix also avoids consuming link nodes.
      if (first?.type !== 'text' || !first.value?.startsWith(control.prefix)) continue;

      if (raw.trimEnd() === control.prefix) {
        const next = children[index + 1];
        if (!next || !supportedBlocks.has(next.type) || /^\[(?:align|text|pagebreak)\b/.test(rawNode(next))) continue;
        applyControl(next, control);
        children.splice(index, 1);
        index--;
      } else if (/^[ \t]+\S/.test(raw.slice(control.prefix.length))) {
        const length = control.prefix.length + (/^[ \t]+/.exec(first.value.slice(control.prefix.length))?.[0].length ?? 0);
        first.value = first.value.slice(length);
        if (!first.value) node.children?.shift();
        applyControl(node, control);
      }
    }
  };
}
