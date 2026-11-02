import { mapMarkdownProse } from './artifacts';
import { decodeSvg, sanitizeDiagramSvg } from './svg';

export const MAX_CAPTURE_DIAGRAMS = 100;
const marker = /^<!-- markmind-diagram-capture:v1 diagrams=([1-9][0-9]{0,2}) -->\r?\n/;

/** Incomplete CSS must not disappear merely because artifact parsing skipped it. */
export const hasChatGptCssOutsideCode = (text: string): boolean => {
  let found = false;
  mapMarkdownProse(text, prose => {
    // A selector may be split from its brace, or truncated before the brace.
    // Treat every remaining diagram prefix as uncertain rather than partially
    // capturing a document whose missing regions cannot all be accounted for.
    if (/\\?#chatgpt-mermaid-/i.test(prose)) found = true;
    return prose;
  });
  return found;
};

/** Count real complete SVG blocks, ignoring nested examples in other fences. */
export const validateCapturedSvgBlocks = (text: string): number | null => {
  let character = '';
  let length = 0;
  let svg = false;
  let encoded = '';
  let count = 0;
  for (const line of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!line[0]) continue;
    const fence = /^[ \t]*(`{3,}|~{3,})([^\r\n]*)/.exec(line[0]);
    if (!character) {
      if (!fence || (fence[1][0] === '`' && fence[2].includes('`'))) continue;
      character = fence[1][0];
      length = fence[1].length;
      svg = fence[2].trim() === 'chatgpt-svg';
      encoded = '';
    } else if (fence && fence[1][0] === character && fence[1].length >= length && !fence[2].trim()) {
      if (svg) {
        try { sanitizeDiagramSvg(decodeSvg(encoded)); }
        catch { return null; }
        if (++count > MAX_CAPTURE_DIAGRAMS) return null;
      }
      character = '';
    } else if (svg) encoded += line[0];
  }
  return character && svg ? null : count;
};

/** A routing hint only: SVG still passes the same sanitizer as ordinary paste. */
export const getCapturedClipboardMarkdown = (text: string): string | null => {
  const match = marker.exec(text);
  if (!match || Number(match[1]) > MAX_CAPTURE_DIAGRAMS) return null;
  const document = text.slice(match[0].length);
  if (hasChatGptCssOutsideCode(document) || validateCapturedSvgBlocks(document) !== Number(match[1])) return null;
  return document;
};

export const markCapturedClipboardMarkdown = (text: string, count: number): string =>
  `<!-- markmind-diagram-capture:v1 diagrams=${count} -->${text.includes('\r\n') ? '\r\n' : '\n'}${text}`;
