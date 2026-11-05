import { fromMarkdown } from 'mdast-util-from-markdown';
import { mathFromMarkdown } from 'mdast-util-math';
import { math } from 'micromark-extension-math';

const roots = 'boxed|frac|dfrac|tfrac|sqrt|lim|sum|prod|int|iint|iiint|begin|end|left|right|displaystyle|overline|underline|vec|hat';
const rawRoot = new RegExp(`^([ \\t]*)(\\\\{1,2})(${roots})(?![A-Za-z])`);
const copiedCommands = (value: string): boolean =>
  /(^|[^\\])\\\\(?:[A-Za-z]{2,}|[ij])\b/.test(value) && !/(^|[^\\])\\[A-Za-z]/.test(value);
const decode = (value: string, copied: boolean) => copied ? value.replace(/\\\\/g, '\\') : value;

interface MathNode {
  type: string;
  value?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: MathNode[];
}

/** Recognize math contexts before normalizing copied, escaped TeX. */
export const preprocessLatex = (text: string): string => {
  if (!/\\(?:\\?[A-Za-z]|\(|\[)/.test(text)) return text;
  let prefix = '\uE000LATEX_';
  while (text.includes(prefix)) prefix += '_';
  const values: string[] = [];
  const mask = (value: string) => {
    values.push(value);
    return `${prefix}${values.length - 1}\uE001`;
  };

  // Existing $/$$ formulas must not be reinterpreted as bare TeX. Native
  // aligned/matrix row separators stay intact; decode only copied commands.
  const ranges: { start: number; end: number; value: string }[] = [];
  const visit = (node: MathNode) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if ((node.type === 'math' || node.type === 'inlineMath') && start !== undefined && end !== undefined) {
      const original = text.slice(start, end);
      ranges.push({ start, end, value: decode(original, copiedCommands(node.value || '')) });
    }
    node.children?.forEach(visit);
  };
  visit(fromMarkdown(text, { extensions: [math()], mdastExtensions: [mathFromMarkdown()] }));
  let cursor = 0;
  const fragments: string[] = [];
  for (const range of ranges) {
    fragments.push(text.slice(cursor, range.start), mask(range.value));
    cursor = range.end;
  }
  fragments.push(text.slice(cursor));
  text = fragments.join('');

  // A standalone \[...\] is display math, including multiline payloads.
  // Inside prose/list paragraphs retain inline math rather than split blocks.
  const brackets = text;
  text = text.replace(/(?<!\\)(\\{1,2})\[([\s\S]*?)\\{1,2}\]/g,
    (whole, opener: string, body: string, offset: number) => {
      const formula = decode(body, opener.length === 2 || copiedCommands(body)).trim();
      const indent = brackets.slice(brackets.lastIndexOf('\n', offset - 1) + 1, offset);
      const standalone = /^[ \t]*$/.test(indent) && /^[ \t]*(?:\r?\n|$)/.test(brackets.slice(offset + whole.length));
      return mask(standalone
        ? `$$\n${formula.split(/\r?\n/).map(line => indent + line).join('\n')}\n${indent}$$`
        : `$${formula}$`);
    });
  text = text.replace(/(?<!\\)(\\{1,2})\(([\s\S]*?)\\{1,2}\)/g,
    (_whole, opener: string, body: string) => mask(`$${decode(body, opener.length === 2 || copiedCommands(body)).trim()}$`));

  const lines = text.split('\n');
  const output: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const root = rawRoot.exec(lines[index]);
    if (!root) { output.push(lines[index]); continue; }
    const copied = root[2].length === 2;
    const chunks: string[] = [];
    const environments: string[] = [];
    let depth = 0;
    let sawBrace = false;
    let invalid = false;
    let accepted = false;
    let end = index;
    for (; end < lines.length && lines[end].trim(); end++) {
      const line = decode(lines[end], copied);
      chunks.push(line);
      let slashes = 0;
      for (const character of line) {
        if (character === '\\') { slashes++; continue; }
        if (slashes % 2 === 0) {
          if (character === '{') { depth++; sawBrace = true; }
          if (character === '}' && --depth < 0) invalid = true;
        }
        slashes = 0;
      }
      for (const match of line.matchAll(/\\(begin|end)\{([A-Za-z*]+)\}/g)) {
        if (match[1] === 'begin') environments.push(match[2]);
        else if (environments.pop() !== match[2]) invalid = true;
      }
      if (invalid) break;
      if (depth !== 0 || environments.length || !sawBrace) continue;
      const formula = chunks.join('\n');
      // Fractions need two braced arguments, possibly on separate lines.
      if (/^(?:[ \t]*)\\(?:frac|dfrac|tfrac)\b/.test(formula) && !hasFractionArguments(formula)) continue;
      if (hasTrailingProse(formula)) break;
      // A limit/sum/integral with only its bounds is not a complete formula.
      // Keep its following operand in the same display, without consuming prose.
      if (/^(?:lim|sum|prod|int|iint|iiint)$/.test(root[3]) && !hasOperatorOperand(formula)) continue;
      output.push(`${root[1]}$$\n${formula}\n${root[1]}$$`);
      index = end;
      accepted = true;
      break;
    }
    if (!accepted) output.push(lines[index]);
  }
  return output.join('\n').replace(new RegExp(`${prefix}(\\d+)\uE001`, 'g'), (_match, index: string) => values[Number(index)]);
};

const hasOperatorOperand = (formula: string): boolean => {
  let remaining = formula.replace(/^[ \t]*\\(?:lim|sum|prod|int|iint|iiint)(?![A-Za-z])/, '').trimStart();
  remaining = remaining.replace(/^\\(?:limits|nolimits)\b/, '').trimStart();
  while (/^[_^]/.test(remaining)) {
    remaining = remaining.slice(1).trimStart();
    if (remaining[0] !== '{') { remaining = remaining.slice(1).trimStart(); continue; }
    let depth = 0;
    let end = 0;
    for (; end < remaining.length; end++) {
      if (remaining[end] === '{' && remaining[end - 1] !== '\\') depth++;
      if (remaining[end] === '}' && remaining[end - 1] !== '\\' && --depth === 0) { end++; break; }
    }
    if (depth) return false;
    remaining = remaining.slice(end).trimStart();
  }
  return remaining.length > 0;
};

const hasFractionArguments = (formula: string): boolean => {
  let cursor = formula.match(/^[ \t]*\\(?:frac|dfrac|tfrac)\b/)![0].length;
  for (let group = 0; group < 2; group++) {
    while (/\s/.test(formula[cursor] || '') && cursor < formula.length) cursor++;
    if (formula[cursor++] !== '{') return false;
    let depth = 1;
    let slashes = 0;
    while (cursor < formula.length && depth) {
      const character = formula[cursor++];
      if (character === '\\') { slashes++; continue; }
      if (slashes % 2 === 0) {
        if (character === '{') depth++;
        if (character === '}') depth--;
      }
      slashes = 0;
    }
    if (depth) return false;
  }
  return true;
};

const hasTrailingProse = (formula: string): boolean => {
  let outside = '';
  let depth = 0;
  for (const character of formula) {
    if (character === '{') depth++;
    else if (character === '}') depth--;
    else if (!depth) outside += character;
  }
  return /(?:^|\s)[A-Za-z]{2,}(?:\s|[.,;:]|$)/.test(outside);
};
