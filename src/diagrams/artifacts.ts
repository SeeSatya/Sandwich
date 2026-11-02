const mapInlineCode = (text: string, transform: (prose: string, start: number) => string, start: number): string => {
  const apply = (prose: string, offset: number) => prose ? transform(prose, start + offset) : '';
  const pattern = /((?<!`)`+)(?!`)[^]*?\1(?!`)/g;
  let result = '';
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    result += apply(text.slice(cursor, match.index), cursor) + match[0];
    cursor = pattern.lastIndex;
  }
  return result + apply(text.slice(cursor), cursor);
};

/** Respect the opening fence character and length, including outer examples. */
export const mapMarkdownProse = (
  text: string,
  transform: (prose: string, start: number) => string,
  options: { includeInlineCode?: boolean } = {},
): string => {
  const apply = (prose: string, start: number) => options.includeInlineCode ? transform(prose, start) : mapInlineCode(prose, transform, start);
  let result = '';
  let prose = '';
  let proseStart = 0;
  let fenced = '';
  let fenceCharacter = '';
  let fenceLength = 0;
  for (const lineMatch of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    const line = lineMatch[0];
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
      result += apply(prose, proseStart);
      prose = '';
      fenced = line;
      fenceCharacter = marker[1][0];
      fenceLength = marker[1].length;
    } else {
      if (!prose) proseStart = lineMatch.index!;
      prose += line;
    }
  }
  return result + (fenceCharacter ? fenced : apply(prose, proseStart));
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

export interface ChatGptArtifact {
  index: number;
  /** Original Markdown range, including indentation and excluding the next newline. */
  start: number;
  end: number;
  cssStart: number;
  cssEnd: number;
  /** CSS is returned exactly as copied, including Markdown escapes. */
  css: string;
  /** No semantic splitting or inferred node relationships are applied. */
  labels: string;
  indent: string;
  heading: string;
  contextBefore: string;
  contextAfter: string;
}

/** Extract structureless copies without changing source offsets or entering code. */
export const extractChatGptArtifacts = (text: string): ChatGptArtifact[] => {
  const artifacts: ChatGptArtifact[] = [];
  const proseSegments: { text: string; start: number }[] = [];
  const headings: { text: string; start: number }[] = [];
  // Inline code often names the nodes in an explanation. Keep it as context,
  // while the separate artifact scan continues to protect inline examples.
  mapMarkdownProse(text, (prose, start) => {
    proseSegments.push({ text: prose, start });
    return prose;
  }, { includeInlineCode: true });
  mapMarkdownProse(text, (prose, proseStart) => {
    for (const heading of prose.matchAll(/^ {0,3}#{1,6}[ \t]+([^\r\n]*)/gm)) {
      const start = proseStart + heading.index!;
      if (start > 0 && text[start - 1] !== '\n') continue;
      const lineEnd = text.indexOf('\n', start);
      // Use the original line so inline code in a heading remains available.
      const line = text.slice(start, lineEnd < 0 ? text.length : lineEnd);
      headings.push({ start, text: line.replace(/^ {0,3}#{1,6}[ \t]+/, '').replace(/[ \t]+#+[ \t]*$/, '').trim() });
    }
    const pattern = /^([ \t]*)(?:\\?#chatgpt-mermaid-[^\r\n{]*)\{/gm;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(prose))) {
      if (proseStart + match.index > 0 && text[proseStart + match.index - 1] !== '\n') continue;
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
      const end = inlineLabels ? nextLine - (prose[nextLine - 1] === '\r' ? 1 : 0) : boundary ? cssEnd + boundary.index : prose.length;
      const labels = prose.slice(cssEnd, end).trim();
      artifacts.push({
        index: artifacts.length,
        start: proseStart + match.index,
        end: proseStart + end,
        cssStart: proseStart + match.index + match[1].length,
        cssEnd: proseStart + cssEnd,
        css: prose.slice(match.index + match[1].length, cssEnd),
        labels,
        indent: match[1],
        heading: '',
        contextBefore: '',
        contextAfter: '',
      });
      pattern.lastIndex = end;
    }
    return prose;
  });

  const context = (start: number, end: number): string => proseSegments.map((segment) => {
    const from = Math.max(start, segment.start);
    const to = Math.min(end, segment.start + segment.text.length);
    return from < to ? segment.text.slice(from - segment.start, to - segment.start) : '';
  }).join('').trim();
  artifacts.forEach((artifact, index) => {
    const precedingHeading = headings.filter((heading) => heading.start < artifact.start).at(-1);
    const followingHeading = headings.find((heading) => heading.start >= artifact.end);
    artifact.heading = precedingHeading?.text || '';
    // Keep nearby prose in the same section. Adjacent diagrams and large code
    // examples must not leak CSS or dominate the semantic context.
    artifact.contextBefore = context(Math.max(0, precedingHeading?.start || 0, artifacts[index - 1]?.end || 0, artifact.start - 2000), artifact.start);
    artifact.contextAfter = context(artifact.end, Math.min(text.length, followingHeading?.start ?? text.length, artifacts[index + 1]?.start ?? text.length, artifact.end + 2000));
  });
  return artifacts;
};

/** ChatGPT's text fallback contains CSS and labels, but no recoverable edges. */
export const replaceChatGptArtifacts = (
  text: string,
  replacement?: (labels: string, index: number, artifact: ChatGptArtifact) => string | undefined,
): { text: string; count: number } => {
  const artifacts = extractChatGptArtifacts(text);
  let cursor = 0;
  let transformed = '';
  for (const artifact of artifacts) {
    const block = replacement?.(artifact.labels, artifact.index, artifact) ?? [
        '> **Diagram data missing from this copy.**',
        '> Use Reconstruct diagrams above the editor to infer missing flowchart connections, or paste Mermaid source / rich SVG to preserve the original graph.',
        artifact.labels ? `> Available diagram text: ${artifact.labels.replace(/[\r\n]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 · $2').replace(/[<>]/g, '')}` : '',
      ].filter(Boolean).join('\n');
    transformed += text.slice(cursor, artifact.start) + block.split('\n').map((line) => artifact.indent + line).join('\n');
    cursor = artifact.end;
  }
  return { text: transformed + text.slice(cursor), count: artifacts.length };
};
