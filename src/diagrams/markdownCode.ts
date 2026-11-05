import { fromMarkdown } from 'mdast-util-from-markdown';

interface CodeRange { start: number; end: number; language?: string }
interface MarkdownNode {
  type: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: MarkdownNode[];
}

/** Fenced blocks close with the same marker and at least the opening length. */
export const fencedCodeRanges = (text: string): CodeRange[] => {
  const ranges: CodeRange[] = [];
  const lines = Array.from(text.matchAll(/[^\n]*(?:\n|$)/g)).filter(match => match[0]);
  let opening: { start: number; marker: string; length: number; language: string } | undefined;
  for (const line of lines) {
    // Include common quote/list containers; the original bytes are preserved.
    const candidate = line[0].replace(/^(?:[ \t]*>[ \t]?)+/, '').replace(/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/, '');
    const fence = /^[ \t]*(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(candidate);
    if (!fence) continue;
    if (!opening) {
      if (fence[1][0] === '`' && fence[2].includes('`')) continue;
      opening = { start: line.index!, marker: fence[1][0], length: fence[1].length, language: fence[2].trim().split(/\s+/)[0].toLowerCase() };
    } else if (fence[1][0] === opening.marker && fence[1].length >= opening.length && !fence[2].trim()) {
      ranges.push({ start: opening.start, end: line.index! + line[0].length, language: opening.language });
      opening = undefined;
    }
  }
  if (opening) ranges.push({ start: opening.start, end: text.length, language: opening.language });
  return ranges;
};

export const hasMermaidSource = (text: string): boolean =>
  fencedCodeRanges(text).some(range => range.language === 'mermaid' || range.language === 'chatgpt-mermaid');

/** Hide code while prose extensions run, then restore it byte for byte. */
export const protectMarkdownCode = (text: string) => {
  const ranges = fencedCodeRanges(text);
  // Use CommonMark's positions for inline and indented code. A backtick
  // regex also matches escaped delimiters and misses indented blocks.
  const visit = (node: MarkdownNode) => {
    if (node.type === 'code' || node.type === 'inlineCode') {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined && !ranges.some(range => start < range.end && end > range.start)) {
        ranges.push({ start, end });
      }
    }
    node.children?.forEach(visit);
  };
  // Plain prose has no inline/indented code to discover. Avoid a second
  // complete CommonMark parse before react-markdown parses that document.
  if (/`| {4}|\t/.test(text)) visit(fromMarkdown(text));
  ranges.sort((first, second) => first.start - second.start);
  let prefix = '\uE000MARKDOWN_CODE_';
  while (text.includes(prefix)) prefix += '_';
  const values: string[] = [];
  let cursor = 0;
  let masked = '';
  ranges.forEach(range => {
    masked += text.slice(cursor, range.start) + `${prefix}${values.length}\uE001`;
    values.push(text.slice(range.start, range.end));
    cursor = range.end;
    // Keep a block boundary so following prose is still at line start.
    if (values[values.length - 1].endsWith('\n')) masked += '\n';
  });
  masked += text.slice(cursor);
  return {
    text: masked,
    restore: (value: string) => value.replace(new RegExp(`${prefix}(\\d+)\uE001\\n?`, 'g'), (_match, index: string) => {
      const original = values[Number(index)];
      // Inline spans must not consume a following prose newline.
      return original + (_match.endsWith('\n') && !original.endsWith('\n') ? '\n' : '');
    }),
  };
};
