const mapInlineCode = (text: string, transform: (prose: string) => string): string => {
  const apply = (prose: string) => prose ? transform(prose) : '';
  const pattern = /((?<!`)`+)(?!`)[^]*?\1(?!`)/g;
  let result = '';
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    result += apply(text.slice(cursor, match.index)) + match[0];
    cursor = pattern.lastIndex;
  }
  return result + apply(text.slice(cursor));
};

/** Respect the opening fence character and length, including outer examples. */
export const mapMarkdownProse = (text: string, transform: (prose: string) => string): string => {
  let result = '';
  let prose = '';
  let fenced = '';
  let fenceCharacter = '';
  let fenceLength = 0;
  for (const line of text.match(/[^\n]*(?:\n|$)/g) || []) {
    if (!line) continue;
    const marker = /^[ \t]*(`{3,}|~{3,})([^\r\n]*)/.exec(line);
    if (fenceCharacter) {
      fenced += line;
      if (marker && marker[1][0] === fenceCharacter && marker[1].length >= fenceLength && !marker[2].trim()) {
        result += fenced;
        fenced = '';
        fenceCharacter = '';
      }
    } else if (marker && !(marker[1][0] === '`' && marker[2].includes('`'))) {
      result += mapInlineCode(prose, transform);
      prose = '';
      fenced = line;
      fenceCharacter = marker[1][0];
      fenceLength = marker[1].length;
    } else prose += line;
  }
  return result + (fenceCharacter ? fenced : mapInlineCode(prose, transform));
};

const endOfCssBlock = (text: string, opening: number): number => {
  let depth = 0;
  let quote = '';
  for (let index = opening; index < text.length; index++) {
    const char = text[index];
    if (char === '\\') { index++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '/' && text[index + 1] === '*') {
      const commentEnd = text.indexOf('*/', index + 2);
      if (commentEnd < 0) return -1;
      index = commentEnd + 1;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return index + 1;
  }
  return -1;
};

/** ChatGPT's text fallback contains CSS and labels, but no recoverable edges. */
export const replaceChatGptArtifacts = (
  text: string,
  replacement?: (labels: string, index: number) => string | undefined,
): { text: string; count: number } => {
  let count = 0;
  const transformed = mapMarkdownProse(text, (prose) => {
    const pattern = /^([ \t]*)(?:\\?#chatgpt-mermaid-[^\r\n{]*)\{/gm;
    let result = '';
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(prose))) {
      let cssEnd = endOfCssBlock(prose, pattern.lastIndex - 1);
      if (cssEnd < 0) continue;
      // Only consume actual consecutive scoped rules/keyframes. Braces in the
      // following prose are not CSS and must not move the artifact boundary.
      while (true) {
        const remaining = prose.slice(cssEnd);
        const rule = /^[ \t\r\n]*(?:\\?#chatgpt-mermaid-[^\r\n{]*|@(?:-webkit-)?keyframes[^\r\n{]*)\{/.exec(remaining);
        if (!rule) break;
        const nextEnd = endOfCssBlock(prose, cssEnd + rule[0].length - 1);
        if (nextEnd < 0) break;
        cssEnd = nextEnd;
      }
      const remaining = prose.slice(cssEnd);
      const boundary = /\r?\n[ \t]*(?:\r?\n|#{1,6}(?:[ \t]|$)|[-+*][ \t]|[0-9]+[.)][ \t]|>|:::|\|\|\||\\?#chatgpt-mermaid-)/.exec(remaining);
      const nextLine = prose.indexOf('\n', cssEnd);
      // The common clipboard format appends labels to the final CSS rule.
      // That line ends the diagram; the next paragraph is independent prose.
      const inlineLabels = nextLine >= 0 && prose.slice(cssEnd, nextLine).trim();
      const end = inlineLabels ? nextLine : boundary ? cssEnd + boundary.index : prose.length;
      const labels = prose.slice(cssEnd, end).trim();
      const index = count++;
      const block = replacement?.(labels, index) ?? [
        '> **Diagram data missing from this copy.**',
        '> Copy the diagram directly with rich HTML, or paste its fenced Mermaid source to preserve its layout and connections.',
        labels ? `> Available diagram text: ${labels.replace(/[\r\n]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 · $2').replace(/[<>]/g, '')}` : '',
      ].filter(Boolean).join('\n');
      result += prose.slice(cursor, match.index) + block.split('\n').map((line) => match![1] + line).join('\n');
      cursor = end;
      pattern.lastIndex = end;
    }
    return result + prose.slice(cursor);
  });
  return { text: transformed, count };
};
