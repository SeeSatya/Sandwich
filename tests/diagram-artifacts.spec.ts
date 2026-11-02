import { test, expect } from '@playwright/test';
import { copiedDiagrams } from './fixtures/chatgpt-copies';

const ruleBasedMarkdown = copiedDiagrams[0].markdown;
const ruleBasedLabels = copiedDiagrams[0].labels;
const ruleBasedCss = ruleBasedMarkdown.slice(ruleBasedMarkdown.indexOf('\\#chatgpt-mermaid-'), -ruleBasedLabels.length);

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit', timeout: 60000 });
  await page.locator('textarea').waitFor({ state: 'visible', timeout: 60000 });
});

test('actual rule-based-system copy exposes intact CSS, labels, and original ranges', async ({ page }) => {
  const result = await page.evaluate(async (markdown) => {
    const { extractChatGptArtifacts, replaceChatGptArtifacts } = await import('/src/diagrams/' + 'artifacts.ts');
    const artifacts = extractChatGptArtifacts(markdown);
    return {
      artifacts,
      sourceRanges: artifacts.map((artifact) => markdown.slice(artifact.start, artifact.end)),
      cssRanges: artifacts.map((artifact) => markdown.slice(artifact.cssStart, artifact.cssEnd)),
      replaced: replaceChatGptArtifacts(markdown, (labels, index, artifact) => `[${index}: ${artifact.heading}]\n${labels}`).text,
    };
  }, ruleBasedMarkdown);
  expect(result.artifacts).toHaveLength(1);
  expect(result.artifacts[0]).toMatchObject({
    index: 0,
    start: ruleBasedMarkdown.indexOf(ruleBasedCss),
    end: ruleBasedMarkdown.length,
    cssStart: ruleBasedMarkdown.indexOf(ruleBasedCss),
    cssEnd: ruleBasedMarkdown.indexOf(ruleBasedCss) + ruleBasedCss.length,
    css: ruleBasedCss,
    labels: ruleBasedLabels,
    heading: '3. Diagram of Rule-Based System',
    contextBefore: '### 3. Diagram of Rule-Based System',
    contextAfter: '',
  });
  expect(result.sourceRanges).toEqual([ruleBasedCss + ruleBasedLabels]);
  expect(result.cssRanges).toEqual([ruleBasedCss]);
  expect(result.replaced).toBe(`### 3. Diagram of Rule-Based System\n\n[0: 3. Diagram of Rule-Based System]\n${ruleBasedLabels}`);
});

test('all three reported copies preserve labels and section context without guessing topology', async ({ page }) => {
  const result = await page.evaluate(async (inputs) => {
    const { extractChatGptArtifacts } = await import('/src/diagrams/' + 'artifacts.ts');
    return inputs.map((input) => extractChatGptArtifacts(input));
  }, copiedDiagrams.map((fixture) => fixture.markdown));
  result.forEach((artifacts, index) => {
    const fixture = copiedDiagrams[index];
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].heading).toBe(fixture.heading);
    expect(artifacts[0].labels).toBe(fixture.labels);
    expect(artifacts[0].contextBefore).toContain(fixture.prose);
    expect(artifacts[0].css).toContain('.flowchart-link');
    expect(artifacts[0].css).not.toContain(fixture.labels);
    expect(fixture.markdown.slice(artifacts[0].cssStart, artifacts[0].cssEnd)).toBe(artifacts[0].css);
  });
});

test('offsets stay tied to original Unicode Markdown across code fences and CRLF', async ({ page }) => {
  const first = '#chatgpt-mermaid-first{font-family:Arial;}AlphaBeta';
  const second = '\\#chatgpt-mermaid-\\_second\\_{font-size:16px;}GammaDelta';
  const input = `## 学习\r\n\r\nBefore \`inline code\` 😀.\r\n\r\n${first}\r\n\r\n\`\`\`\`markdown\r\n## False heading\r\n\`\`\`text\r\n${first}\r\n\`\`\`\r\n\`\`\`\`\r\n\r\n## Second\r\n\r\n  ${second}\r\nAfter second.\r\n`;
  const result = await page.evaluate(async (input) => {
    const { extractChatGptArtifacts, replaceChatGptArtifacts } = await import('/src/diagrams/' + 'artifacts.ts');
    const artifacts = extractChatGptArtifacts(input);
    return {
      artifacts,
      slices: artifacts.map((artifact) => input.slice(artifact.start, artifact.end)),
      replaced: replaceChatGptArtifacts(input, (_labels, index) => `Diagram ${index}\nSecond line`).text,
    };
  }, input);
  expect(result.artifacts).toHaveLength(2);
  expect(result.artifacts.map((artifact) => artifact.start)).toEqual([input.indexOf(first), input.indexOf(`  ${second}`)]);
  expect(result.artifacts.map((artifact) => artifact.heading)).toEqual(['学习', 'Second']);
  expect(result.slices).toEqual([first, `  ${second}`]);
  expect(result.artifacts[1].cssStart).toBe(input.indexOf(second));
  expect(result.replaced).toContain('Diagram 0\nSecond line\r\n');
  expect(result.replaced).toContain('  Diagram 1\n  Second line\r\nAfter second.');
  expect(result.replaced).toContain(`\`\`\`text\r\n${first}\r\n\`\`\``);
});

test('context stays within nearby prose and excludes adjacent artifacts and fenced headings', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { extractChatGptArtifacts } = await import('/src/diagrams/' + 'artifacts.ts');
    const artifact = '#chatgpt-mermaid-x{font-size:16px;}OneTwo';
    const input = `## A \`coded\` heading\n\nBefore diagram.\n\n\`\`\`text\n## Ignore this heading\n${artifact}\n\`\`\`\n\n${artifact}\n\nBetween diagrams.\n\n${artifact}\n\nAfter diagram.\n\n## Other section\nKeep separate.`;
    return extractChatGptArtifacts(input);
  });
  expect(result).toHaveLength(2);
  expect(result[0].heading).toBe('A `coded` heading');
  expect(result[0].contextBefore).toContain('Before diagram.');
  expect(result[0].contextBefore).not.toContain('Ignore this heading');
  expect(result[0].contextBefore).not.toContain('chatgpt-mermaid');
  expect(result[0].contextAfter).toBe('Between diagrams.');
  expect(result[1].contextBefore).toBe('Between diagrams.');
  expect(result[1].contextAfter).toBe('After diagram.');
});

test('inline fragments, unclosed fences, and malformed CSS are not extracted', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { extractChatGptArtifacts } = await import('/src/diagrams/' + 'artifacts.ts');
    const artifact = '#chatgpt-mermaid-x{font-size:16px;}OneTwo';
    return [
      `\`${artifact}\``,
      `Before \`code\`${artifact}`,
      `\`\`\`markdown\n${artifact}`,
      '#chatgpt-mermaid-x{font-family:"unterminated;OneTwo',
      `Before \`code\`## False heading\n\n${artifact}`,
    ].map((input) => extractChatGptArtifacts(input));
  });
  expect(result.slice(0, 4)).toEqual([[], [], [], []]);
  expect(result[4]).toHaveLength(1);
  expect(result[4][0].heading).toBe('');
});

test('complex CSS boundaries leave following prose and braces intact', async ({ page }) => {
  const input = '#chatgpt-mermaid-x{font-family:"Quoted { braces }";/* } */}\n@keyframes dash{from{stroke-dashoffset:10;}to{stroke-dashoffset:0;}}\n#chatgpt-mermaid-x .node{fill:blue;}\nFirst\nSecond\n\nFollowing prose uses {braces}.\n';
  const result = await page.evaluate(async (input) => {
    const { extractChatGptArtifacts } = await import('/src/diagrams/' + 'artifacts.ts');
    const artifact = extractChatGptArtifacts(input)[0];
    return { artifact, tail: input.slice(artifact.end) };
  }, input);
  expect(result.artifact.labels).toBe('First\nSecond');
  expect(result.artifact.css).toContain('to{stroke-dashoffset:0;}');
  expect(result.artifact.css.endsWith('.node{fill:blue;}')).toBeTruthy();
  expect(result.tail).toBe('\n\nFollowing prose uses {braces}.\n');
  expect(result.artifact.contextAfter).toBe('Following prose uses {braces}.');
});

test('inference context retains inline node names but excludes fenced examples', async ({ page }) => {
  const input = '## Message routing\n\n`A` sends requests to `B`; `B` forwards to `C`.\n\n```text\nIgnored explanation inside a code example.\n```\n\n#chatgpt-mermaid-x .flowchart-link{stroke:blue;}ABC\n\n`C` sends feedback to `A`.\n';
  const [artifact] = await page.evaluate(async input => {
    const { extractChatGptArtifacts } = await import('/src/diagrams/' + 'artifacts.ts');
    return extractChatGptArtifacts(input);
  }, input);
  expect(artifact.contextBefore).toContain('`A` sends requests to `B`; `B` forwards to `C`.');
  expect(artifact.contextBefore).not.toContain('Ignored explanation');
  expect(artifact.contextAfter).toBe('`C` sends feedback to `A`.');
});
