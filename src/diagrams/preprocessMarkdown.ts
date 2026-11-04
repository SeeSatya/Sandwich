import { AppTheme } from '../types';
import { getDiagramEdgeColor } from './colors';
import { protectMarkdownCode } from './markdownCode';

export const preprocessMarkdown = (text: string, theme?: AppTheme): string => {
  if (!text) return '';
  const diagramEdgeColor = getDiagramEdgeColor(theme?.isDark ?? true);

  // remark-math uses `$` / `$$` delimiters. Accept the common LaTeX
  // `\(...\)` and `\[...\]` forms too. Use inline delimiters for `\[...\]`
  // because equations often appear inside list paragraphs; `$$` is a block
  // delimiter and would otherwise be treated as literal text there.
  const code = protectMarkdownCode(text);
  text = code.text
      // Some pasted/generated Markdown contains JSON-style escaped slashes
      // (for example `\\[ ... \\]` and `\\frac`). Restore TeX commands first.
      .replace(/\\\\/g, '\\')
      // A standalone `\[...\]` is a display equation. Convert it to a real
      // block so pagination treats the complete equation as one unit.
      .replace(/^([ \t]*)\\\[([^\r\n]*?)\\\][ \t]*$/gm, (_match, indent: string, formula: string) =>
        `${indent}$$\n${indent}${formula.trim()}\n${indent}$$`)
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, formula: string) => `$${formula}$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_match, formula: string) => `$${formula}$`);

  // ChatGPT sometimes copies a rendered Mermaid graphic as its scoped CSS
  // followed by the SVG's visible labels, while dropping the actual SVG paths.
  // The copied style blob omits original edges and node positions, so recover
  // known diagram structures from their heading and visible labels. Split labels
  // that were concatenated when HTML was copied.
  text = text.replace(/^([ \t]*)(?:\\?#chatgpt-mermaid-[^\r\n]*)$/gm, (artifactLine, indent: string) => {
    const cssEnd = artifactLine.lastIndexOf('}');
    if (cssEnd < 0) return artifactLine;

    const labelsText = artifactLine.slice(cssEnd + 1).trim();
    if (!labelsText) return artifactLine;

    const numberedLabels = labelsText
      .split(/(?=[0-9]+[.)][ \t]*)/)
      .map((label: string) => label.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean);
    const hasNumberedLabels = numberedLabels.length > 1 && /^\s*\d+[.)]\s*/.test(labelsText);
    const splitLabels = (hasNumberedLabels
      ? numberedLabels
      : labelsText.replace(/([a-z0-9])([A-Z])/g, '$1\n$2').split(/\r?\n/)
    )
      .map((label: string) => label.trim())
      .filter(Boolean);
    const labels: string[] = [];
    for (const label of splitLabels) {
      if (label === '/' && labels.length) labels[labels.length - 1] += ' /';
      else if (labels.length && labels[labels.length - 1].endsWith('/')) labels[labels.length - 1] += ` ${label}`;
      else labels.push(label);
    }

    const precedingText = text.slice(0, text.indexOf(artifactLine));
    if (!labels.length) {
      return `${indent}> ChatGPT copied this diagram without its node labels. Paste it directly from ChatGPT or provide Mermaid source to preserve the diagram.`;
    }

    const radStages = ['Requirements Planning', 'User Design', 'Construction', 'Cutover', 'User Feedback', 'Improvements'];
    const isRadDiagram = /RAD Model/i.test(precedingText) && radStages.every(stage =>
      labels.some(label => label.toLowerCase() === stage.toLowerCase())
    );
    const agileStages = ['Planning', 'Design', 'Development', 'Testing', 'Release', 'Customer Feedback'];
    const isAgileDiagram = /Agile Process/i.test(precedingText) && agileStages.every(stage =>
      labels.some(label => label.toLowerCase() === stage.toLowerCase())
    );
    const isSpiralDiagram = /Spiral Model/i.test(precedingText);

    let chart: string;
    if (isRadDiagram) {
      // Recover the RAD feedback loop and iteration path omitted by the copied text.
      chart = [
        'flowchart TB',
        '  subgraph constructionRow[" "]',
        '    direction LR',
        '    C["Construction"]',
        '  end',
        '  subgraph designRow[" "]',
        '    direction LR',
        '    RP["Requirements Planning"]',
        '    CUT["Cutover"]',
        '    IMP(["Improvements"])',
        '    RP ~~~ CUT',
        '    CUT ~~~ IMP',
        '  end',
        '  subgraph feedbackRow[" "]',
        '    direction LR',
        '    UF(["User Feedback"])',
        '    UD["User Design"]',
        '    UF ~~~ UD',
        '  end',
        '  C --> CUT',
        '  C -.-> IMP',
        '  IMP -.-> UD',
        '  RP --> UD',
        '  UF -.-> UD',
        '  UD --> C',
        '  classDef phase fill:#00284d,stroke:#1f4e94,color:#99ceff,stroke-width:1px,rx:16px,ry:16px',
        '  classDef feedback fill:#000e1a,stroke:#1a3e5f,color:#99ceff,stroke-width:1px',
        '  class C,CUT,RP,UD phase',
        '  class IMP,UF feedback',
        `  linkStyle default stroke:${diagramEdgeColor},stroke-width:1px`,
      ].join('\n');
    } else if (isAgileDiagram) {
      // The copied ChatGPT artifact retains labels and styling, but not its
      // SVG edge paths. Reconstruct this known Agile cycle from the heading
      // and labels: work proceeds through release, then customer feedback
      // returns to planning for the next iteration.
      const ids = ['PLAN', 'DESIGN', 'DEV', 'TEST', 'RELEASE', 'FEEDBACK'];
      const nodeLines = agileStages.map((label, i) => {
        const escaped = label.replace(/"/g, '\\"');
        const shape = i === agileStages.length - 1 ? `(["${escaped}"])` : `["${escaped}"]`;
        return `  ${ids[i]}${shape}`;
      });
      const flowLines = ids.slice(1).map((id, i) => `  ${ids[i]} --> ${id}`);
      chart = [
        'flowchart LR',
        ...nodeLines,
        ...flowLines,
        '  FEEDBACK -.-> PLAN',
        '  classDef agilePhase fill:#00284d,stroke:#1f4e94,color:#99ceff,stroke-width:1px,rx:16px,ry:16px',
        '  classDef agileFeedback fill:#000e1a,stroke:#1a3e5f,color:#99ceff,stroke-width:1px',
        '  class PLAN,DESIGN,DEV,TEST,RELEASE agilePhase',
        '  class FEEDBACK agileFeedback',
        `  linkStyle default stroke:${diagramEdgeColor},stroke-width:1px`,
      ].join('\n');
    } else {
      // Plain-text copies of ChatGPT diagrams often retain CSS and visible
      // node labels but omit the SVG edge paths. Don't leave that CSS as prose
      // for every unrecognized model: render the available labels as a useful
      // Mermaid flow. Spiral models are iterative, so close their phases into
      // a feedback loop; waterfall phases flow top to bottom.
      const ids = labels.map((_label, index) => `PHASE${index + 1}`);
      const safeLabel = (label: string) => label.replace(/["\\]/g, '\\$&').replace(/[\r\n]+/g, ' ');
      const direction = /waterfall/i.test(precedingText) ? 'TD' : 'LR';
      const nodes = labels.map((label, index) => `  ${ids[index]}["${safeLabel(label)}"]`);
      const edges = ids.slice(1).map((id, index) => `  ${ids[index]} --> ${id}`);
      if (isSpiralDiagram && ids.length > 1) {
        edges.push(`  ${ids[ids.length - 1]} -.-> ${ids[0]}`);
      }
      chart = `flowchart ${direction}\n${[...nodes, ...edges].join('\n')}`;
    }

    const language = isRadDiagram ? 'chatgpt-rad' : 'mermaid';
    return `${indent}\`\`\`${language}\n${chart}\n\`\`\``;
  });

  // Side-by-side columns: `::: columns` ... `|||` (separator) ... `:::`.
  // Emit flex divs with blank lines around each cell so the inner markdown
  // (including ```mermaid blocks) is still parsed by react-markdown.
  text = text.replace(/^:::[ \t]*columns[ \t]*\r?\n([\s\S]*?)\r?\n:::[ \t]*$/gm, (_m, body) => {
    const cells = body.split(/\r?\n[ \t]*\|\|\|[ \t]*\r?\n/);
    const cols = cells.map((c: string) => `<div class="md-column">\n\n${c.trim()}\n\n</div>`).join('\n');
    return `<div class="md-columns">\n${cols}\n</div>`;
  });

  // Match: [img - option1 - option2 - ... - url] or [img - option1 - ... - [text](url)]
  const regex = /\[img\s*-\s*((?:[^\[\]}]|\[[^\]]*\]\([^)]*\))+)[\]}]/g;

  text = text.replace(regex, (match, optionsStr) => {
    const parts = optionsStr.split(/\s+-\s+/).map((s: string) => s.trim());
    if (parts.length === 0) return match;

    let url = parts[parts.length - 1];

    // Extract actual URL if wrapped in markdown link syntax [text](href)
    const linkMatch = url.match(/\[.*?\]\((.*?)\)/);
    if (linkMatch) {
      url = linkMatch[1].trim();
    }

    const options = parts.slice(0, parts.length - 1);

    // Style variables
    let width = '100%';
    let height = 'auto';
    let objectFit = 'contain';
    let aspectRatio = '';
    let display = 'block';
    let margin = '1.5em 0';
    let float = 'none';
    let borderRadius = '0';
    let boxShadow = 'none';
    let border = 'none';
    let filter = 'none';
    let maxWidth = '100%';
    let align = 'center';

    options.forEach((opt: string) => {
      const option = opt.toLowerCase();

      // 1. Aspect Ratio (e.g. 16:9)
      if (/^\d+:\d+$/.test(option)) {
        aspectRatio = option.replace(':', '/');
        height = 'auto';
      }
      // 2. Custom pixel dimensions (e.g. 800x600)
      else if (/^\d+x\d+$/.test(option)) {
        const [w, h] = option.split('x');
        width = `${w}px`;
        height = `${h}px`;
        maxWidth = '100%';
      }
      // 3. Built-in presets
      else if (option === 'cover') {
        width = '100%';
        height = '320px';
        objectFit = 'cover';
      } else if (option === 'fit') {
        width = '100%';
        height = 'auto';
        objectFit = 'contain';
        maxWidth = '100%';
      } else if (option === 'semi-cover') {
        width = '50%';
        height = '200px';
        objectFit = 'cover';
      } else if (option === 'half') {
        width = '50%';
      } else if (option === 'third') {
        width = '33.33%';
      } else if (option === 'quarter') {
        width = '25%';
      } else if (option === 'full') {
        width = '100%';
      }
      // 4. Alignment
      else if (option === 'left') {
        align = 'left';
        display = 'inline-block';
        float = 'left';
        margin = '0.5em 1.5em 0.5em 0';
      } else if (option === 'right') {
        align = 'right';
        display = 'inline-block';
        float = 'right';
        margin = '0.5em 0 0.5em 1.5em';
      } else if (option === 'center') {
        align = 'center';
        display = 'block';
        margin = '1.5em auto';
      }
      // 5. Stylings
      else if (option === 'rounded') {
        borderRadius = '12px';
      } else if (option === 'circle') {
        borderRadius = '50%';
        aspectRatio = '1/1';
        objectFit = 'cover';
      } else if (option === 'shadow') {
        boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
      } else if (option === 'border') {
        border = '3px solid rgba(139, 92, 246, 0.4)'; // Violet primary accent tint border
      } else if (option === 'grayscale') {
        filter = 'grayscale(100%)';
      }
      // 6. Resolutions (e.g. 1080p, 720p)
      else if (option === '1080p') {
        height = '450px';
      } else if (option === '720p') {
        height = '350px';
      } else if (option === '480p') {
        height = '240px';
      } else if (option === '4k') {
        height = '600px';
      }
    });

    const styleObj = {
      width,
      height,
      'object-fit': objectFit,
      'aspect-ratio': aspectRatio,
      'border-radius': borderRadius,
      'box-shadow': boxShadow,
      border,
      filter,
      'max-width': maxWidth,
    };

    const styleStr = Object.entries(styleObj)
      .filter(([_, v]) => v && v !== 'none')
      .map(([k, v]) => `${k}:${v}`)
      .join(';');

    if (float !== 'none') {
      return `<img src="${url}" class="custom-pdf-image" style="${styleStr};float:${float};margin:${margin};display:${display};" alt="Image" />`;
    }

    return `<div class="custom-pdf-image-wrapper" style="text-align:${align};margin:${margin};display:block;clear:both;"><img src="${url}" class="custom-pdf-image" style="${styleStr};display:${display};margin:0 ${align === 'center' ? 'auto' : '0'};" alt="Image" /></div>`;
  });
  return code.restore(text);
};
