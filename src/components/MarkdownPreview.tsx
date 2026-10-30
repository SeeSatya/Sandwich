
import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  oneLight,
  oneDark,
  vscDarkPlus,
  ghcolors,
  dracula,
  atomDark,
  vs
} from 'react-syntax-highlighter/dist/esm/styles/prism';
import { AppTheme } from '../types';
import MermaidDiagram from './MermaidDiagram';
import RadModelDiagram from './RadModelDiagram';
import DiagramBlock from './DiagramBlock';
import { getDiagramEdgeColor } from '../diagrams/colors';

interface MarkdownPreviewProps {
  content: string;
  theme: AppTheme;
  ignoreHr: boolean;
  fontSize: number;
  wordWrap: boolean;
  paddingSize: 'small' | 'medium' | 'large';
  headerText: string;
  showPageNumbers: boolean;
  codeFont: string;
  showLineNumbers: boolean;
  codeWindowStyle: boolean;
  codeBlockBorder: boolean;
  codeBlockDark: boolean;
  highlightStyle: string;
}

export const preprocessMarkdown = (text: string, theme?: AppTheme): string => {
  if (!text) return '';
  const diagramEdgeColor = getDiagramEdgeColor(theme?.isDark ?? true);

  // remark-math uses `$` / `$$` delimiters. Accept the common LaTeX
  // `\(...\)` and `\[...\]` forms too. Use inline delimiters for `\[...\]`
  // because equations often appear inside list paragraphs; `$$` is a block
  // delimiter and would otherwise be treated as literal text there.
  text = text.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2 === 1) return part;
    return part
      // Some pasted/generated Markdown contains JSON-style escaped slashes
      // (for example `\\[ ... \\]` and `\\frac`). Restore TeX commands first.
      .replace(/\\\\/g, '\\')
      // A standalone `\[...\]` is a display equation. Convert it to a real
      // block so pagination treats the complete equation as one unit.
      .replace(/^([ \t]*)\\\[([^\r\n]*?)\\\][ \t]*$/gm, (_match, indent: string, formula: string) =>
        `${indent}$$\n${indent}${formula.trim()}\n${indent}$$`)
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, formula: string) => `$${formula}$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_match, formula: string) => `$${formula}$`);
  }).join('');

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

  return text.replace(regex, (match, optionsStr) => {
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
};

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  theme,
  ignoreHr,
  fontSize,
  wordWrap,
  paddingSize,
  headerText,
  showPageNumbers,
  codeFont,
  showLineNumbers,
  codeWindowStyle,
  codeBlockBorder,
  codeBlockDark,
  highlightStyle
}) => {

  // MS Word-like margins: Top/Bottom slightly larger than Left/Right
  const getVerticalPadding = () => {
    switch (paddingSize) {
      case 'small': return '12.7mm';   // Narrow
      case 'medium': return '25.4mm';  // Normal/Moderate
      case 'large': return '35mm';     // Wide
      default: return '25.4mm';
    }
  };

  const getHorizontalPadding = () => {
    switch (paddingSize) {
      case 'small': return '12.7mm';   // Narrow
      case 'medium': return '19.1mm';  // Moderate
      case 'large': return '25mm';     // Wide
      default: return '19.1mm';
    }
  };

  // Academic Report has asymmetric, fixed margins. Keep these values in one
  // place so the source page, measured pages, rendered pages and print pages
  // all have exactly the same usable content box.
  const pagePaddingTop = theme.name === 'Academic Report' ? '25.4mm' : getVerticalPadding();
  const pagePaddingRight = theme.name === 'Academic Report' ? '25.4mm' : getHorizontalPadding();
  const pagePaddingBottom = theme.name === 'Academic Report' ? '25.4mm' : getVerticalPadding();
  const pagePaddingLeft = theme.name === 'Academic Report' ? '38.1mm' : getHorizontalPadding();
  const paginationThemeClass = theme.name === 'Pixelize'
    ? 'theme-pixelize theme-pixelize-print'
    : theme.name === 'Academic Report'
      ? 'theme-academic'
      : '';

  // Resolve highlighter style object
  // A "light" style (light bg, dark tokens) on a dark background = invisible text.
  // Override to a dark style whenever the effective background will be dark.
  const effectivelyDark = codeBlockDark || theme.isDark;

  const getHighlightStyle = () => {
    switch (highlightStyle) {
      case 'dracula': return dracula;
      case 'atomDark': return atomDark;
      case 'vscDarkPlus': return vscDarkPlus;
      case 'oneDark': return oneDark;
      // Light styles — auto-swap to dark equivalent when on a dark background
      case 'oneLight': return effectivelyDark ? vscDarkPlus : oneLight;
      case 'github':   return effectivelyDark ? vscDarkPlus : ghcolors;
      case 'vs':       return effectivelyDark ? vscDarkPlus : vs;
      default: return effectivelyDark ? vscDarkPlus : ghcolors;
    }
  };

  const activeHighlightStyle = getHighlightStyle();
  const darkBlockBg = theme.colors.codeBlockDark || '#1e1e1e';

  const sourceRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(1);

  const preprocessedContent = React.useMemo(() => {
    return preprocessMarkdown(content, theme);
  }, [content, theme]);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current || !containerRef.current.parentElement) return;
      // Measure parent element width to avoid scrollbar layout loop!
      const parentWidth = containerRef.current.parentElement.clientWidth - 32;
      const pageWidthPx = 210 * (96 / 25.4);
      const nextScale = Math.min(1, Math.max(0.1, parentWidth / pageWidthPx));
      const roundedScale = Math.round(nextScale * 1000) / 1000;
      setScale(current => current === roundedScale ? current : roundedScale);
    };

    updateScale();
    const resizeObserver = new ResizeObserver(() => {
      updateScale();
    });
    if (containerRef.current && containerRef.current.parentElement) {
      resizeObserver.observe(containerRef.current.parentElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    if (!sourceRef.current || !targetRef.current) return;

    const source = sourceRef.current;
    const target = targetRef.current;
    let cancelled = false;
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    let runVersion = 0;
    let lastSignature: string | null = null;

    interface MeasuredPage {
      page: HTMLDivElement;
      content: HTMLDivElement;
      pageNum: number;
    }

    let svgCloneId = 0;
    const svgNamespace = `pagination-${Math.random().toString(36).slice(2)}`;
    const stripIds = (root: HTMLElement) => {
      // HTML anchors must not repeat across fragments. SVG IDs, however,
      // also connect scoped styles, gradients and arrow markers: remap these
      // together instead of stripping the IDs and breaking the drawing.
      if (!root.closest('svg')) root.removeAttribute('id');
      root.querySelectorAll('[id]').forEach(node => {
        if (!node.closest('svg')) node.removeAttribute('id');
      });
      const diagrams: Element[] = root.matches('svg')
        ? [root]
        : Array.from(root.querySelectorAll('svg')).filter(svg => !svg.parentElement?.closest('svg'));
      diagrams.forEach(svg => {
        const prefix = `${svgNamespace}-${++svgCloneId}-`;
        const ids = new Map<string, string>();
        const nodes: Element[] = [svg, ...Array.from(svg.querySelectorAll('*'))];
        nodes.forEach(node => {
          if (node.id) {
            const original = node.id;
            const replacement = prefix + original;
            ids.set(original, replacement);
            node.id = replacement;
          }
        });
        const rewriteReferences = (value: string) => value.replace(/#([\w-]+)/g,
          (reference, id: string) => ids.has(id) ? `#${ids.get(id)}` : reference);
        const rewriteUrls = (value: string) => value.replace(/url\(\s*(['"]?)#([^\s()'"]+)\1\s*\)/g,
          (reference, quote: string, id: string) => ids.has(id) ? `url(${quote}#${ids.get(id)}${quote})` : reference);
        nodes.forEach(node => {
          Array.from(node.attributes).forEach(attribute => {
            if (attribute.name === 'id') return;
            let value = attribute.name === 'aria-labelledby' || attribute.name === 'aria-describedby'
              ? attribute.value.split(/\s+/).map(id => ids.get(id) ?? id).join(' ')
              : rewriteUrls(attribute.value);
            if (attribute.localName === 'href' && attribute.value.startsWith('#')) {
              value = `#${ids.get(attribute.value.slice(1)) ?? attribute.value.slice(1)}`;
            }
            if (value !== attribute.value) node.setAttributeNS(attribute.namespaceURI, attribute.name, value);
          });
          if (node.tagName.toLowerCase() === 'style') {
            // Only selectors and url() references contain IDs. Hexadecimal
            // colors in declarations must retain their original values.
            node.textContent = rewriteUrls((node.textContent ?? '').replace(/([^{}]+)\{/g,
              (_match, selector: string) => `${rewriteReferences(selector)}{`));
          }
        });
      });
    };

    const setMargin = (node: HTMLElement, side: 'top' | 'bottom', value: string) => {
      node.style.setProperty(`margin-${side}`, value, 'important');
    };

    const textNodes = (root: HTMLElement): Text[] => {
      const result: Text[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        result.push(node as Text);
        node = walker.nextNode();
      }
      return result;
    };

    const cloneTextRange = (element: HTMLElement, start: number, end: number): HTMLElement => {
      const clone = element.cloneNode(false) as HTMLElement;
      const nodes = textNodes(element);
      if (nodes.length === 0) return element.cloneNode(true) as HTMLElement;

      const locate = (offset: number): { node: Text; offset: number } => {
        let traversed = 0;
        for (const node of nodes) {
          const next = traversed + node.data.length;
          if (offset <= next) return { node, offset: Math.max(0, offset - traversed) };
          traversed = next;
        }
        const last = nodes[nodes.length - 1];
        return { node: last, offset: last.data.length };
      };

      const startPoint = locate(start);
      const endPoint = locate(end);
      const range = document.createRange();
      range.setStart(startPoint.node, startPoint.offset);
      range.setEnd(endPoint.node, endPoint.offset);
      clone.appendChild(range.cloneContents());
      stripIds(clone);
      return clone;
    };

    const splitBoundaries = (element: HTMLElement): number[] => {
      const text = element.textContent || '';
      const boundaries = new Set<number>();
      const wordBoundary = /(?:\s+|[.,!?;:\u2026](?=\s|$))/gu;
      let match: RegExpExecArray | null;
      while ((match = wordBoundary.exec(text)) !== null) {
        boundaries.add(match.index + match[0].length);
      }
      let offset = 0;
      textNodes(element).forEach(node => {
        offset += node.data.length;
        boundaries.add(offset);
      });
      boundaries.add(text.length);
      return Array.from(boundaries).filter(value => value > 0).sort((a, b) => a - b);
    };

    const graphemeBoundaries = (element: HTMLElement): number[] => {
      const text = element.textContent || '';
      const boundaries: number[] = [];
      const Segmenter = (Intl as any).Segmenter;
      if (Segmenter) {
        const segmenter = new Segmenter(undefined, { granularity: 'grapheme' });
        for (const part of segmenter.segment(text)) {
          boundaries.push(part.index + part.segment.length);
        }
        return boundaries;
      }
      let offset = 0;
      // Array.from advances by Unicode code point, so the compatibility path
      // still never cuts a surrogate pair in half.
      Array.from(text).forEach(character => {
        offset += character.length;
        boundaries.push(offset);
      });
      return boundaries;
    };

    const addPageDecoration = (page: HTMLElement, pageNum: number) => {
      if (theme.name === 'Night Sky') {
        const track = (side: 'left' | 'right') => {
          const host = document.createElement('div');
          host.innerHTML = `<svg class="page-star-track ${side}" viewBox="0 0 40 1000" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="20" y1="40" x2="20" y2="960" stroke="#818CF8" stroke-width="0.6" opacity="0.35"/>
            <circle cx="20" cy="120" r="2.2" fill="#E2E8F0" opacity="0.5"/>
            <circle cx="20" cy="360" r="1.4" fill="#818CF8" opacity="0.5"/>
            <circle cx="20" cy="640" r="2.2" fill="#E2E8F0" opacity="0.45"/>
            <circle cx="20" cy="880" r="1.4" fill="#818CF8" opacity="0.5"/>
            <line x1="20" y1="120" x2="20" y2="360" stroke="#818CF8" stroke-width="0.5" opacity="0.25"/>
            <line x1="20" y1="360" x2="20" y2="640" stroke="#818CF8" stroke-width="0.5" opacity="0.25"/>
          </svg>`;
          return host.firstElementChild as HTMLElement;
        };
        page.appendChild(track('left'));
        page.appendChild(track('right'));
      } else if (theme.name === 'Pixelize') {
        const burst = (corner: 'tl' | 'tr' | 'bl' | 'br') => {
          const host = document.createElement('div');
          host.innerHTML = `<svg class="pixel-corner ${corner}" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="4" height="4" fill="${theme.colors.primary}" opacity="0.9"/>
            <rect x="4" y="0" width="2" height="2" fill="${theme.colors.secondary}" opacity="0.7"/>
            <rect x="0" y="4" width="2" height="2" fill="${theme.colors.secondary}" opacity="0.7"/>
            <rect x="4" y="4" width="1.4" height="1.4" fill="${theme.colors.primary}" opacity="0.5"/>
            <rect x="6" y="0" width="1.2" height="1.2" fill="${theme.colors.primary}" opacity="0.4"/>
            <rect x="0" y="6" width="1.2" height="1.2" fill="${theme.colors.primary}" opacity="0.4"/>
          </svg>`;
          return host.firstElementChild as HTMLElement;
        };
        (['tl', 'tr', 'bl', 'br'] as const).forEach(corner => page.appendChild(burst(corner)));
      }

      if (showPageNumbers && pageNum > 1) {
        const pageNumber = document.createElement('div');
        pageNumber.className = 'page-number';
        pageNumber.textContent = String(pageNum);
        pageNumber.style.cssText = `position:absolute;bottom:10mm;right:20mm;font-size:12px;opacity:.5;pointer-events:none;color:${theme.colors.text}`;
        page.appendChild(pageNumber);
      }
    };

    const waitForStableLayout = async () => {
      const fontReady = document.fonts?.ready ?? Promise.resolve();
      const images = Array.from(source.querySelectorAll('img'));
      const imageReady = images.map(image => {
        if (image.complete) return image.decode?.().catch(() => undefined) ?? Promise.resolve();
        return new Promise<void>(resolve => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        });
      });
      // Do not let a broken remote image block the whole document. Its later
      // load/error or resize still schedules a fresh pagination pass.
      await Promise.race([
        Promise.all([fontReady, ...imageReady]),
        new Promise<void>(resolve => setTimeout(resolve, 1500))
      ]);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    };

    const paginate = () => {
      const children = Array.from(source.children) as HTMLElement[];
      if (children.length === 0) {
        target.replaceChildren();
        return;
      }

      const sourceRect = source.getBoundingClientRect();
      const signature = [
        source.innerHTML,
        sourceRect.width.toFixed(2),
        sourceRect.height.toFixed(2),
        document.fonts?.status || '',
        ...children.map(child => {
          const rect = child.getBoundingClientRect();
          return `${child.tagName}:${rect.width.toFixed(2)}:${rect.height.toFixed(2)}:${child.scrollWidth}:${child.scrollHeight}`;
        }),
        ...Array.from(source.querySelectorAll('img')).map(image => `${image.currentSrc}:${image.naturalWidth}x${image.naturalHeight}`),
      ].join('|');
      if (signature === lastSignature) return;

      const measureHost = document.createElement('div');
      measureHost.className = 'pagination-measure-host';
      document.body.appendChild(measureHost);

      const pages: MeasuredPage[] = [];
      const createPage = (): MeasuredPage => {
        const page = document.createElement('div');
        page.className = `page pagination-page ${paginationThemeClass}`.trim();
        const pageContent = document.createElement('div');
        pageContent.className = 'page-content';
        page.appendChild(pageContent);
        const result = { page, content: pageContent, pageNum: pages.length + 1 };
        pages.push(result);
        measureHost.appendChild(page);
        return result;
      };

      let currentPage = createPage();
      const hasContent = () => currentPage.content.childElementCount > 0;
      const newPage = () => { currentPage = createPage(); };
      const fits = () => currentPage.content.scrollHeight <= currentPage.content.clientHeight;
      const tryAppend = (node: HTMLElement): boolean => {
        currentPage.content.appendChild(node);
        if (fits()) return true;
        node.remove();
        return false;
      };

      const findFittingBoundary = (
        start: number,
        boundaries: number[],
        testBoundary: (end: number) => boolean
      ): number => {
        const candidates = boundaries.filter(value => value > start);
        if (candidates.length === 0 || !testBoundary(candidates[0])) return start;
        // Bound the search from the current page forwards. Starting halfway
        // through a huge code block needlessly lays out dozens of pages on
        // every probe, even though only a few rendered lines can fit here.
        let bestIndex = 0;
        let probe = 1;
        while (probe < candidates.length && testBoundary(candidates[probe])) {
          bestIndex = probe;
          probe = probe * 2 + 1;
        }
        let low = bestIndex + 1;
        let high = Math.min(probe, candidates.length - 1);
        let best = candidates[bestIndex];
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const end = candidates[mid];
          if (testBoundary(end)) {
            best = end;
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
        return best;
      };

      const largestFittingBoundary = (
        start: number,
        boundaries: number[],
        createFragment: (start: number, end: number) => HTMLElement
      ): number => findFittingBoundary(start, boundaries, end => {
        const candidate = createFragment(start, end);
        currentPage.content.appendChild(candidate);
        const candidateFits = fits();
        candidate.remove();
        return candidateFits;
      });

      const paginateFragments = (
        total: number,
        boundaries: number[],
        createFragment: (start: number, end: number) => HTMLElement,
        fallbackBoundaries: number[] = boundaries,
        tryWholeRemainder = true
      ) => {
        let start = 0;
        while (start < total) {
          if (tryWholeRemainder && tryAppend(createFragment(start, total))) break;

          let end = largestFittingBoundary(start, boundaries, createFragment);
          if (end === start) {
            // A long token may still have rendered lines that fit in the
            // remaining space. Test graphemes before abandoning this page.
            end = largestFittingBoundary(start, fallbackBoundaries, createFragment);
          }
          if (end === start && hasContent()) {
            newPage();
            continue;
          }
          if (end === start) {
            throw new Error('A minimum text fragment exceeds the usable page height');
          }
          currentPage.content.appendChild(createFragment(start, end));
          start = end;
          if (start < total) newPage();
        }
      };

      const createTextFragment = (element: HTMLElement, start: number, end: number): HTMLElement => {
        const total = element.textContent?.length ?? 0;
        const fragment = cloneTextRange(element, start, end);
        fragment.classList.add('pagination-text-fragment');
        if (start > 0) {
          fragment.classList.add('pagination-fragment-continuation');
          setMargin(fragment, 'top', '0');
        }
        if (end < total) setMargin(fragment, 'bottom', '0');
        return fragment;
      };

      const paginateText = (element: HTMLElement) => {
        const total = element.textContent?.length ?? 0;
        if (total === 0) {
          appendAtomic(element, false);
          return;
        }
        paginateFragments(
          total,
          splitBoundaries(element),
          (start, end) => createTextFragment(element, start, end),
          graphemeBoundaries(element)
        );
      };

      const paginateList = (list: HTMLElement) => {
        const items = Array.from(list.children).filter(child => child.tagName === 'LI') as HTMLElement[];
        const ordered = list.tagName === 'OL';
        const listStart = ordered ? Number(list.getAttribute('start') || 1) : 1;

        items.forEach((item, itemIndex) => {
          const total = item.textContent?.length ?? 0;
          const number = listStart + itemIndex;
          const createListFragment = (start: number, end: number) => {
            const listFragment = list.cloneNode(false) as HTMLElement;
            stripIds(listFragment);
            listFragment.classList.add('pagination-list-fragment');
            if (itemIndex > 0 || start > 0) setMargin(listFragment, 'top', '0');
            if (itemIndex < items.length - 1 || end < total) setMargin(listFragment, 'bottom', '0');
            if (ordered) listFragment.setAttribute('start', String(number));

            const itemFragment = total > 0 ? cloneTextRange(item, start, end) : item.cloneNode(true) as HTMLElement;
            stripIds(itemFragment);
            if (ordered) itemFragment.setAttribute('value', String(number));
            if (start > 0) {
              itemFragment.classList.add('pagination-list-item-continuation');
              setMargin(itemFragment, 'top', '0');
            }
            if (end < total) setMargin(itemFragment, 'bottom', '0');
            listFragment.appendChild(itemFragment);
            return listFragment;
          };

          if (total === 0 || item.querySelector('img, svg, iframe, video, table, .html-render-block, .mermaid-container, .diagram-container, .katex-display')) {
            appendAtomic(createListFragment(0, total), true);
          } else {
            paginateFragments(total, splitBoundaries(item), createListFragment, graphemeBoundaries(item));
          }
        });
      };

      const paginateTable = (table: HTMLTableElement) => {
        const rows = Array.from(table.querySelectorAll(':scope > tbody > tr')) as HTMLTableRowElement[];
        if (rows.length === 0) {
          appendAtomic(table, false);
          return;
        }

        // An auto-layout table would choose different column widths for each
        // subset of rows. Freeze the source widths so continued cells reflow
        // with exactly the same geometry as the measured table.
        const width = table.getBoundingClientRect().width;
        const columnCells = Array.from((table.tHead?.rows[0] ?? rows[0]).cells);
        const columnWidths = columnCells.flatMap(cell =>
          Array.from({ length: cell.colSpan }, () => cell.getBoundingClientRect().width / cell.colSpan)
        );
        let tableFragment: HTMLTableElement | null = null;
        let bodyFragment: HTMLTableSectionElement | null = null;
        const createTableFragment = (continuation: boolean) => {
          const fragment = table.cloneNode(false) as HTMLTableElement;
          fragment.classList.add('pagination-table-fragment');
          fragment.dataset.paginationSource = String(children.indexOf(table));
          fragment.style.width = `${width}px`;
          fragment.style.tableLayout = 'fixed';
          if (continuation) setMargin(fragment, 'top', '0');
          setMargin(fragment, 'bottom', '0');
          const columns = document.createElement('colgroup');
          columnWidths.forEach(columnWidth => {
            const column = document.createElement('col');
            column.style.width = `${columnWidth}px`;
            columns.appendChild(column);
          });
          fragment.appendChild(columns);
          Array.from(table.children).forEach(child => {
            if (child.tagName === 'THEAD' || (child.tagName === 'CAPTION' && !continuation)) {
              fragment.appendChild(child.cloneNode(true));
            }
          });
          const sourceBody = table.tBodies[0];
          const tbody = sourceBody ? sourceBody.cloneNode(false) as HTMLTableSectionElement : document.createElement('tbody');
          fragment.appendChild(tbody);
          stripIds(fragment);
          return { fragment, tbody };
        };

        const ensureTable = (continuation: boolean) => {
          if (!tableFragment || !bodyFragment) {
            const created = createTableFragment(continuation);
            tableFragment = created.fragment;
            bodyFragment = created.tbody;
            currentPage.content.appendChild(tableFragment);
          }
          return bodyFragment;
        };
        const discardEmptyTable = () => {
          if (bodyFragment?.rows.length === 0) {
            tableFragment?.remove();
            tableFragment = null;
            bodyFragment = null;
          }
        };
        const continueTable = () => {
          discardEmptyTable();
          newPage();
          tableFragment = null;
          bodyFragment = null;
        };
        const rowClone = (row: HTMLTableRowElement, rowIndex: number) => {
          const clone = row.cloneNode(true) as HTMLTableRowElement;
          clone.dataset.paginationRow = String(rowIndex);
          Array.from(clone.cells).forEach((cell, index) => {
            cell.dataset.paginationColumn = String(index);
          });
          clone.style.backgroundColor = getComputedStyle(row).backgroundColor;
          stripIds(clone);
          return clone;
        };

        rows.forEach((row, rowIndex) => {
          const wholeRow = rowClone(row, rowIndex);
          ensureTable(rowIndex > 0).appendChild(wholeRow);
          if (fits()) return;
          wholeRow.remove();

          // Keep ordinary rows intact when they fit on a fresh page. A row
          // taller than a page must instead continue its individual cells.
          const probePage = document.createElement('div');
          probePage.className = currentPage.page.className;
          const probeContent = document.createElement('div');
          probeContent.className = 'page-content';
          const probeTable = createTableFragment(true);
          probeTable.tbody.appendChild(rowClone(row, rowIndex));
          probeContent.appendChild(probeTable.fragment);
          probePage.appendChild(probeContent);
          measureHost.appendChild(probePage);
          const rowFitsFreshPage = probeContent.scrollHeight <= probeContent.clientHeight;
          probePage.remove();
          if (rowFitsFreshPage) {
            continueTable();
            ensureTable(true).appendChild(wholeRow);
            return;
          }

          const cells = Array.from(row.cells);
          const totals = cells.map(cell => cell.textContent?.length ?? 0);
          const boundaries = cells.map(splitBoundaries);
          const fallback = cells.map(graphemeBoundaries);
          let offsets = cells.map(() => 0);
          while (offsets.some((offset, index) => offset < totals[index])) {
            const partialRow = rowClone(row, rowIndex);
            partialRow.classList.add('pagination-row-fragment');
            Array.from(partialRow.cells).forEach(cell => cell.replaceChildren());
            ensureTable(rowIndex > 0 || offsets.some(offset => offset > 0)).appendChild(partialRow);
            const nextOffsets = [...offsets];
            cells.forEach((cell, index) => {
              const start = offsets[index];
              if (start === totals[index]) return;
              const test = (end: number) => {
                const candidate = cloneTextRange(cell, start, end) as HTMLTableCellElement;
                candidate.dataset.paginationColumn = String(index);
                const previous = partialRow.cells[index];
                previous.replaceWith(candidate);
                const candidateFits = fits();
                candidate.replaceWith(previous);
                return candidateFits;
              };
              let end = findFittingBoundary(start, boundaries[index], test);
              if (end === start) end = findFittingBoundary(start, fallback[index], test);
              const fragment = cloneTextRange(cell, start, end) as HTMLTableCellElement;
              fragment.dataset.paginationColumn = String(index);
              partialRow.cells[index].replaceWith(fragment);
              nextOffsets[index] = end;
            });
            if (nextOffsets.every((offset, index) => offset === offsets[index])) {
              partialRow.remove();
              discardEmptyTable();
              if (!hasContent()) throw new Error('A minimum table-cell fragment exceeds the usable page height');
              continueTable();
              continue;
            }
            offsets = nextOffsets;
            if (offsets.some((offset, index) => offset < totals[index])) continueTable();
          }
        });
      };

      const prepareCodeFragments = (element: HTMLElement) => {
        const lines = Array.from(element.querySelectorAll('.pagination-code-line')) as HTMLElement[];
        if (lines.length === 0) return null;

        const template = element.cloneNode(true) as HTMLElement;
        const templateLines = Array.from(template.querySelectorAll('.pagination-code-line'));
        templateLines[0].parentElement!.setAttribute('data-pagination-code-body', '');
        templateLines.forEach(line => line.remove());
        let total = 0;
        const boundaries: number[] = [];
        const fallback: number[] = [];
        const sourceLines = lines.map(line => {
          const source = line.cloneNode(true) as HTMLElement;
          const number = source.querySelector('.react-syntax-highlighter-line-number');
          const lineNumber = number?.cloneNode(true) as HTMLElement | undefined;
          number?.remove();
          const start = total;
          const length = Math.max(1, source.textContent?.length ?? 0);
          splitBoundaries(source).forEach(offset => boundaries.push(start + offset));
          graphemeBoundaries(source).forEach(offset => fallback.push(start + offset));
          total += length;
          boundaries.push(total);
          fallback.push(total);
          return { source, start, end: total, lineNumber };
        });

        const createCodeFragment = (start: number, end: number) => {
          const fragment = template.cloneNode(true) as HTMLElement;
          stripIds(fragment);
          fragment.classList.add('pagination-code-fragment');
          const body = fragment.querySelector('[data-pagination-code-body]')!;
          body.removeAttribute('data-pagination-code-body');
          sourceLines.forEach(line => {
            if (line.end <= start || line.start >= end) return;
            const localStart = Math.max(0, start - line.start);
            const localEnd = Math.min(line.end, end) - line.start;
            const lineFragment = cloneTextRange(line.source, localStart, localEnd);
            if (localStart > 0) lineFragment.classList.add('pagination-code-line-continuation');
            if (line.lineNumber) {
              const number = line.lineNumber.cloneNode(true) as HTMLElement;
              if (localStart > 0) {
                number.replaceChildren();
                number.setAttribute('aria-hidden', 'true');
              }
              lineFragment.prepend(number);
            }
            body.appendChild(lineFragment);
          });
          if (start > 0) setMargin(fragment, 'top', '0');
          if (end < total) setMargin(fragment, 'bottom', '0');
          return fragment;
        };

        return { total, boundaries, fallback, createCodeFragment };
      };

      const paginateCode = (element: HTMLElement): boolean => {
        const code = prepareCodeFragments(element);
        if (!code) return false;
        paginateFragments(code.total, code.boundaries, code.createCodeFragment, code.fallback, false);
        return true;
      };

      const createKeepWithNextProbe = (element: HTMLElement): HTMLElement => {
        if (element.tagName === 'OL' || element.tagName === 'UL') {
          const list = element.cloneNode(false) as HTMLElement;
          const firstItem = element.querySelector(':scope > li') as HTMLElement | null;
          if (firstItem) {
            const boundary = splitBoundaries(firstItem)[0];
            const isVisual = firstItem.querySelector('img, svg, iframe, video, table, .katex-display');
            list.appendChild(boundary && !isVisual
              ? cloneTextRange(firstItem, 0, boundary)
              : firstItem.cloneNode(true));
          }
          stripIds(list);
          return list;
        }

        if (element.tagName === 'TABLE') {
          const table = element.cloneNode(true) as HTMLTableElement;
          Array.from(table.querySelectorAll(':scope > tbody > tr')).slice(1).forEach(row => row.remove());
          const firstRow = table.tBodies[0]?.rows[0];
          const originalTable = element as HTMLTableElement;
          const originalRow = originalTable.tBodies[0]?.rows[0];
          const rowHeight = originalRow?.getBoundingClientRect().height ?? 0;
          const headerHeight = originalTable.tHead?.getBoundingClientRect().height ?? 0;
          if (firstRow && rowHeight + headerHeight > currentPage.content.clientHeight) Array.from(firstRow.cells).forEach(cell => {
            const boundary = splitBoundaries(cell)[0];
            if (boundary) cell.replaceWith(cloneTextRange(cell, 0, boundary));
          });
          stripIds(table);
          return table;
        }

        const code = prepareCodeFragments(element);
        if (code) return code.createCodeFragment(0, code.boundaries[0] ?? code.total);

        const isVisual = element.matches('img, svg, iframe, video, .html-render-block, .mermaid-container, .diagram-container, .katex-display') ||
          element.querySelector('img, svg, iframe, video, .html-render-block, .mermaid-container, .diagram-container, .katex-display') !== null;
        if (element.matches('p, blockquote, div, section') && !isVisual) {
          const firstBoundary = splitBoundaries(element)[0] ?? (element.textContent?.length ?? 0);
          return createTextFragment(element, 0, firstBoundary);
        }

        const clone = element.cloneNode(true) as HTMLElement;
        stripIds(clone);
        return clone;
      };

      function appendAtomic(element: HTMLElement, scalableVisual: boolean) {
        const clone = element.cloneNode(true) as HTMLElement;
        stripIds(clone);
        if (tryAppend(clone)) return;
        if (hasContent()) newPage();

        const freshClone = element.cloneNode(true) as HTMLElement;
        stripIds(freshClone);
        currentPage.content.appendChild(freshClone);
        if (fits() || !scalableVisual) return;

        // Page-edge margins are optional whitespace, not part of the visual.
        // Drop them before deciding that the object itself needs scaling.
        freshClone.style.setProperty('margin-top', '0', 'important');
        freshClone.style.setProperty('margin-bottom', '0', 'important');
        if (fits()) return;

        // Visuals stay atomic. Only an object taller than a completely fresh
        // usable page is scaled; an object that merely misses the remaining
        // space has already been moved intact to this fresh page.
        const naturalHeight = Math.max(freshClone.getBoundingClientRect().height, freshClone.scrollHeight);
        const availableHeight = currentPage.content.clientHeight;
        freshClone.remove();
        const fitScale = Math.min(1, availableHeight / Math.max(1, naturalHeight));
        const scaleBox = document.createElement('div');
        scaleBox.className = 'fit-scale-box';
        scaleBox.style.height = `${naturalHeight * fitScale}px`;
        const scaled = element.cloneNode(true) as HTMLElement;
        stripIds(scaled);
        scaled.style.setProperty('margin', '0', 'important');
        scaled.style.transform = `scale(${fitScale})`;
        scaled.style.transformOrigin = 'top left';
        scaled.style.width = `${100 / fitScale}%`;
        scaleBox.appendChild(scaled);
        currentPage.content.appendChild(scaleBox);
      }

      children.forEach((element, elementIndex) => {
        const isList = element.tagName === 'OL' || element.tagName === 'UL';
        const isTable = element.tagName === 'TABLE';
        const isHeading = /^H[1-6]$/.test(element.tagName);
        const isCode = element.matches('pre, .code-block-wrapper') || element.querySelector('.code-block-wrapper') !== null;
        const isVisual = element.matches('img, svg, iframe, video, .html-render-block, .mermaid-container, .diagram-container, .katex-display') ||
          element.querySelector('img, svg, iframe, video, .html-render-block, .mermaid-container, .diagram-container, .katex-display') !== null;
        const isTextBlock = element.matches('p, blockquote, div, section') && !isVisual;

        // Preserve the existing keep-with-next behavior without relying on
        // source-document offsets: test the heading and the first semantic unit
        // of its successor directly in the current page's DOM.
        const nextElement = children[elementIndex + 1];
        if (isHeading && nextElement && hasContent()) {
          const headingProbe = element.cloneNode(true) as HTMLElement;
          stripIds(headingProbe);
          currentPage.content.appendChild(headingProbe);
          if (fits()) {
            const nextProbe = createKeepWithNextProbe(nextElement);
            currentPage.content.appendChild(nextProbe);
            const keepFits = fits();
            nextProbe.remove();
            headingProbe.remove();
            if (!keepFits) newPage();
          } else {
            headingProbe.remove();
          }
        }

        if (isList) paginateList(element);
        else if (isTable) paginateTable(element as HTMLTableElement);
        else if (isCode && paginateCode(element)) return;
        else if (isTextBlock) paginateText(element);
        else appendAtomic(element, isVisual);
      });

      if (pages.length > 1 && pages[pages.length - 1].content.childElementCount === 0) {
        pages.pop()?.page.remove();
      }

      const previousScrollTop = containerRef.current?.scrollTop ?? 0;
      const pageStack = document.createDocumentFragment();
      pages.forEach(({ page, pageNum }) => {
        addPageDecoration(page, pageNum);
        pageStack.appendChild(page);
      });
      target.replaceChildren(pageStack);
      measureHost.remove();
      lastSignature = signature;
      if (containerRef.current) containerRef.current.scrollTop = previousScrollTop;
    };

    const runPagination = async (version: number) => {
      await waitForStableLayout();
      if (cancelled || version !== runVersion) return;
      paginate();
    };

    const schedulePagination = (delay = 0) => {
      if (cancelled) return;
      runVersion++;
      const version = runVersion;
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => void runPagination(version), delay);
    };

    const observedLayoutNodes = new WeakSet<Element>();
    const resizeObserver = new ResizeObserver(() => schedulePagination(120));
    const observeLayoutNodes = (root: ParentNode) => {
      const nodes = root.querySelectorAll(':scope > *, img, svg, iframe, video, .mermaid-container, .diagram-container, .katex-display');
      nodes.forEach(node => {
        if (!observedLayoutNodes.has(node)) {
          observedLayoutNodes.add(node);
          resizeObserver.observe(node);
        }
      });
    };
    const mutationObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node instanceof Element) observeLayoutNodes(node);
        });
      });
      observeLayoutNodes(source);
      schedulePagination(120);
    });
    mutationObserver.observe(source, { childList: true, subtree: true, characterData: true, attributes: true });
    resizeObserver.observe(source);
    observeLayoutNodes(source);
    const onFontsChanged = () => schedulePagination(0);
    document.fonts?.addEventListener?.('loadingdone', onFontsChanged);
    schedulePagination();

    return () => {
      cancelled = true;
      runVersion++;
      if (debounceTimeout) clearTimeout(debounceTimeout);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', onFontsChanged);
      document.querySelectorAll('.pagination-measure-host').forEach(host => host.remove());
    };
  }, [
    content,
    theme,
    fontSize,
    paddingSize,
    ignoreHr,
    wordWrap,
    headerText,
    showPageNumbers,
    codeFont,
    showLineNumbers,
    codeWindowStyle,
    codeBlockBorder,
    codeBlockDark,
    highlightStyle
  ]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex flex-col items-center overflow-x-auto overflow-y-scroll custom-scrollbar print:min-h-screen print:overflow-visible print:block"
      style={{
        backgroundColor: theme.isDark ? '#262626' : '#f3f4f6',
        /* Always reserve the scrollbar gutter: in Edge/Chromium the scrollbar
           appearing/disappearing changes the content width, which re-triggers
           pagination and makes the preview oscillate ("dancing"). A stable
           gutter removes the width change entirely. */
        scrollbarGutter: 'stable',
      }}
    >
      <style>{`
         /* Custom Scrollbar to match the theme and prevent shaking */
         .custom-scrollbar::-webkit-scrollbar {
           width: 8px;
           height: 8px;
         }
         .custom-scrollbar::-webkit-scrollbar-track {
           background: transparent;
         }
         .custom-scrollbar::-webkit-scrollbar-thumb {
           background: ${theme.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'};
           border-radius: 4px;
         }
         .custom-scrollbar::-webkit-scrollbar-thumb:hover {
           background: ${theme.isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
         }
         .custom-scrollbar {
           scrollbar-width: thin;
           scrollbar-color: ${theme.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'} transparent;
         }

         /* Pagination Styles */
         /* Pagination Styles */
          .page {
            width: 210mm;
            height: 297mm;
            padding: ${pagePaddingTop} ${pagePaddingRight} ${pagePaddingBottom} ${pagePaddingLeft};
            background-color: ${theme.colors.background};
            color: ${theme.colors.text} !important;
            font-family: ${theme.fonts.body};
            font-size: ${fontSize}px;
            box-sizing: border-box;
            overflow: hidden;
            position: relative;
            line-height: 1.5 !important; 
            
            /* Dynamic scaling on mobile */
            transform: scale(${scale});
            transform-origin: top center;
            margin-bottom: calc(2rem - (297mm * (1 - ${scale}))) !important;
            flex-shrink: 0;
          }
         
         /* The hidden source, measured pages and visible pages are all real
            .page trees, so one selector owns their typography. */
         .page :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, table, a, strong, em):not(.html-render-block *) {
             line-height: 1.5 !important;
         }
         .page :is(p, li, blockquote, td, a, strong, em):not(.html-render-block *) {
             color: ${theme.colors.text} !important;
         }
         /* html-render blocks style themselves — theme must not repaint them */
         
         /* Keep display equations compact and prevent long formulas from
            being clipped at the page edge. */
         :is(.markdown-source, .page) .katex-display {
            margin: 0.45em 0;
            max-width: 100%;
            overflow-x: auto;
            overflow-y: hidden;
         }

         /* Floated elements clear for main blocks */
         .page h1, .page h2, .page h3, .page h4, .page h5, .page h6, 
         .page hr, .page table, .page .code-block-wrapper, .page blockquote, 
         .page ul, .page ol, .page .diagram-container {
             clear: both;
         }

         .diagram-container {
            max-width: 100%;
            box-sizing: border-box;
            break-inside: avoid;
            page-break-inside: avoid;
         }
         .diagram-container svg {
            max-width: 100%;
            height: auto;
            overflow: visible;
         }
         .diagram-svg-renderer {
            max-width: 100%;
            break-inside: avoid;
            page-break-inside: avoid;
         }
         
         /* Side-by-side columns (::: columns / ||| / :::) */
         .md-columns {
            display: flex;
            gap: 1.5em;
            align-items: flex-start;
            margin: 1.2em 0;
         }
         .md-column {
            flex: 1 1 0;
            min-width: 0; /* let tables/diagrams shrink instead of overflowing */
         }
         .md-column > :first-child { margin-top: 0; }

         /* Night Sky decorative star tracks in the page margins.
            position:absolute + pointer-events:none ⇒ zero pagination impact. */
         .page-star-track {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 12mm;
            pointer-events: none;
            z-index: 1;
            overflow: hidden;
         }
         .page-star-track.left { left: 2mm; }
         .page-star-track.right { right: 2mm; }

         /* ---- Pixelize theme ---- */
         /* Pixel-grid paper: fine square lattice over the page background,
            with a sprinkle of "pixel particles" (single cells of accent
            colour) scattered across the sheet. Pure background layers, so
            nothing touches layout or text measurement. */
         .page.theme-pixelize {
            background-color: ${theme.colors.background};
            background-image:
              /* accent particles, deterministic positions */
              radial-gradient(circle at 14% 18%, ${theme.colors.primary}55 0 2px, transparent 2px),
              radial-gradient(circle at 82% 12%, ${theme.colors.secondary}66 0 2px, transparent 2px),
              radial-gradient(circle at 91% 44%, ${theme.colors.primary}44 0 2px, transparent 2px),
              radial-gradient(circle at 7% 62%, ${theme.colors.secondary}55 0 2px, transparent 2px),
              radial-gradient(circle at 24% 88%, ${theme.colors.primary}44 0 2px, transparent 2px),
              radial-gradient(circle at 76% 78%, ${theme.colors.secondary}55 0 2px, transparent 2px),
              /* the pixel grid */
              linear-gradient(to right, ${theme.colors.border} 1px, transparent 1px),
              linear-gradient(to bottom, ${theme.colors.border} 1px, transparent 1px);
            background-size:
              100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%,
              8px 8px, 8px 8px;
            background-position: 0 0;
         }
         .page.theme-pixelize.theme-pixelize-print {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
         }

         /* Pixel-burst corners: a stepped block of squares in each corner */
         .pixel-corner { position: absolute; width: 14mm; height: 14mm; pointer-events: none; z-index: 1; }
         .pixel-corner.tl { top: 0; left: 0; }
         .pixel-corner.tr { top: 0; right: 0; transform: scaleX(-1); }
         .pixel-corner.bl { bottom: 0; left: 0; transform: scaleY(-1); }
         .pixel-corner.br { bottom: 0; right: 0; transform: scale(-1, -1); }

         /* Pixel headings: blocky, with a stepped accent bar */
         .page.theme-pixelize h1:not(.html-render-block *),
         .page.theme-pixelize h2:not(.html-render-block *) {
            letter-spacing: 0 !important;
            text-transform: uppercase !important;
            border-bottom: none !important;
            padding-bottom: 0.4em;
            position: relative;
         }
         .page.theme-pixelize h1:not(.html-render-block *)::after,
         .page.theme-pixelize h2:not(.html-render-block *)::after {
            content: '';
            position: absolute; left: 0; bottom: 0;
            width: 100%; height: 6px;
            background-image:
              linear-gradient(to right, ${theme.colors.primary} 0 8px, transparent 8px 10px),
              linear-gradient(to right, ${theme.colors.secondary} 0 4px, transparent 4px 10px);
            background-size: 10px 6px, 10px 3px;
            background-repeat: repeat-x, repeat-x;
            background-position: 0 0, 0 3px;
         }
         .page.theme-pixelize h3:not(.html-render-block *) {
            letter-spacing: 0 !important;
            border-left: 6px solid ${theme.colors.primary} !important;
            padding-left: 0.5em;
         }

         /* Pixel punctuation: full stops and commas render as solid squares.
            Achieved with a monospace-adjacent pixel font, so glyphs are
            already blocky — reinforce with tighter word/letter spacing. */
         .page.theme-pixelize p:not(.html-render-block *),
         .page.theme-pixelize li:not(.html-render-block *) {
            word-spacing: -0.02em;
            text-align: left !important;
         }

         @media print {
           .page-star-track, .pixel-corner {
             -webkit-print-color-adjust: exact !important;
             print-color-adjust: exact !important;
           }
         }

         /* Limit Mermaid diagram size. No transform:scale here — a transform
            shrinks the drawing but NOT its layout box, which left large blank
            gaps around diagrams. max-height matches the usable A4 content
            height so a diagram can use the full page; the paginator's
            shrink-to-fit scales it down when it doesn't fit the space left. */
         .mermaid-container svg {
            max-width: 100%;
            max-height: 920px;
            height: auto;
            display: block;
            margin: 0 auto;
         }

         .page-content {
            height: 100%;
            width: 100%;
            position: relative;
            overflow: hidden;
            box-sizing: border-box;
         }

         .markdown-source-page,
         .pagination-measure-host {
           position: fixed !important;
           top: 0 !important;
           left: -20000px !important;
           visibility: hidden !important;
           pointer-events: none !important;
         }
         .markdown-source-page.page,
         .pagination-measure-host .page {
           transform: none !important;
           margin: 0 !important;
           border: 0 !important;
           box-shadow: none !important;
         }
         .pagination-measure-host {
           width: 210mm;
         }
         .fit-scale-box {
           width: 100%;
           overflow: hidden;
           position: relative;
           margin: 0;
         }
         .pagination-list-item-continuation::marker {
           content: '';
         }
         .pagination-code-line {
           display: block;
         }

         /* Headers logic */
         :is(h1, h2, h3, h4, h5, h6):not(.html-render-block *) {
            font-family: ${theme.fonts.heading} !important; 
            color: ${theme.colors.heading} !important; 
            line-height: 1.2;
            margin-top: 1.5em;
            margin-bottom: 0.8em;
          }
          h1:first-child, h2:first-child, p:first-child { margin-top: 0; }
          h1:not(.html-render-block *) { font-size: 2.25em !important; font-weight: 800 !important; letter-spacing: -0.025em; }
          h2:not(.html-render-block *) { font-size: 1.6em !important; font-weight: 700 !important; letter-spacing: -0.025em; border-bottom: 2px solid ${theme.colors.primary}30 !important; padding-bottom: 0.3em; }
          h3:not(.html-render-block *) {
            font-size: 1.3em !important; 
            font-weight: 700 !important; 
            letter-spacing: -0.02em;
            border-left: 4px solid ${theme.colors.primary} !important;
            padding-left: 0.75em;
            margin-top: 1.8em;
          }
          h4:not(.html-render-block *) { font-size: 1.15em !important; font-weight: 600 !important; }
          h5:not(.html-render-block *) { font-size: 1.05em !important; font-weight: 600 !important; }
          h6:not(.html-render-block *) { font-size: 1em !important; font-weight: 600 !important; text-transform: uppercase; letter-spacing: 0.05em; }
          p:not(.html-render-block *) {
            margin-bottom: 1.2em;
            line-height: 1.65;
            color: ${theme.colors.text} !important;
          }

          ${theme.name === 'Academic Report' ? `
          /* Academic Report: strict formatting rules — absolute pt sizes, not em */
          .page {
            font-size: 12pt !important;
          }
          .page :is(p, li):not(.html-render-block *) {
            text-align: justify !important;
            line-height: 1.5 !important;
            font-size: 12pt !important;
          }
          .page :is(h1, h2, h3, h4, h5, h6):not(.html-render-block *) {
            line-height: 1 !important;
            text-align: left !important;
            letter-spacing: 0 !important;
            border: none !important;
            border-bottom: none !important;
            border-left: none !important;
            padding-left: 0 !important;
          }
          .page h1:not(.html-render-block *) { font-size: 16pt !important; font-weight: 700 !important; }
          .page h2:not(.html-render-block *) { font-size: 14pt !important; font-weight: 700 !important; }
          .page h3:not(.html-render-block *) { font-size: 13pt !important; font-weight: 700 !important; }
          .page :is(h4, h5, h6):not(.html-render-block *) { font-size: 12pt !important; font-weight: 700 !important; }
          .page :is(table, td, th):not(.html-render-block *) { font-size: 10pt !important; }
          ` : ''}

          ${theme.name === 'Pixelize' ? `
          /* Pixelize — pixel type. Press Start 2P is very wide, so headings
             are scaled down hard and body copy uses VT323 (readable pixel
             face) at a larger optical size. */
          .page {
            font-size: 15pt !important;
            line-height: 1.45 !important;
          }
          .page h1:not(.html-render-block *) { font-size: 15pt !important; line-height: 1.5 !important; margin-bottom: 1em; }
          .page h2:not(.html-render-block *) { font-size: 11.5pt !important; line-height: 1.6 !important; }
          .page h3:not(.html-render-block *) { font-size: 10pt !important; line-height: 1.6 !important; }
          .page :is(h4, h5, h6):not(.html-render-block *) { font-size: 8.5pt !important; }
          .page :is(p, li):not(.html-render-block *) {
            font-size: 15pt !important;
            line-height: 1.45 !important;
          }
          .page :is(table, td, th):not(.html-render-block *) {
            font-size: 13pt !important;
          }
          .page pre:not(.html-render-block *), .page code:not(.html-render-block *) {
            font-size: 9pt !important;
          }
          ` : ''}



          table:not(.html-render-block *) {
            width: 100%;
            max-width: 100%;
            margin: 1.5em 0;
            border-collapse: collapse;
            table-layout: auto;
            font-size: 0.92em;
            overflow-wrap: anywhere;
          }
          thead:not(.html-render-block *) {
            background-color: ${theme.colors.primary}14;
          }
          :is(th, td):not(.html-render-block *) {
            padding: 0.75em 0.9em;
            border: 1px solid ${theme.colors.border || `${theme.colors.primary}33`};
            text-align: left;
            vertical-align: top;
            line-height: 1.45 !important;
          }
          th:not(.html-render-block *) {
            color: ${theme.colors.heading} !important;
            font-weight: 800;
            white-space: nowrap;
          }
          td:not(.html-render-block *) {
            color: ${theme.colors.text} !important;
          }
          tbody tr:nth-child(even):not(.html-render-block *) {
            background-color: ${theme.colors.primary}08;
          }
          .page-content > table {
            display: table;
          }

          /* List styling - FIX for missing numbers */
          ol {
            list-style-type: decimal !important;
            padding-left: 2em !important;
            margin-bottom: 1.2em;
            color: ${theme.colors.text} !important;
          }
          ul {
            list-style-type: disc !important;
            padding-left: 2em !important;
            margin-bottom: 1.2em;
            color: ${theme.colors.text} !important;
          }
          li {
            margin-bottom: 0.5em;
            line-height: 1.65;
            color: ${theme.colors.text} !important;
          }
          li > p {
            margin-bottom: 0.3em;
          }
          /* Nested lists */
          ul ul, ol ul { list-style-type: circle !important; }
          ol ol, ul ol { list-style-type: lower-roman !important; }

         @media screen {
           .page {
             margin: 0 auto 2rem auto;
             box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), 0 0 0 1px ${theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
             border: none;
             text-align: left;
           }
        }

        @media print {
           /* Page the browser prints onto must match the .page box exactly,
              otherwise a 297mm page spills a sliver onto a trailing sheet
              (the "mostly-blank last page with a colored strip" bug). */
           @page {
             size: A4 portrait;
             margin: 0;
           }
           html, body {
             background: white !important;
             margin: 0 !important;
             padding: 0 !important;
           }
           /* The hidden measurement source must not occupy layout space when
              printing — it is what created the blank first page. */
           .markdown-source-page,
           .pagination-measure-host {
             display: none !important;
           }
           /* Kill the 2rem breathing room around the page stack in print —
              it shifts every page down and adds leading/trailing blank space. */
           .markdown-pages {
             padding-top: 0 !important;
             padding-bottom: 0 !important;
           }
           .page {
             transform: none !important;
             margin: 0 !important;
             margin-bottom: 0 !important; /* beat the screen-only !important scale margin */
             box-shadow: none !important;
             border: none !important;
             page-break-after: always !important;
             padding: ${pagePaddingTop} ${pagePaddingRight} ${pagePaddingBottom} ${pagePaddingLeft} !important;
             width: 210mm !important;
             height: 297mm !important;
             box-sizing: border-box !important;
             overflow: hidden !important;
             break-inside: avoid !important;
           }
           .page:last-child {
             /* !important is required: the plain .page rule above declares
                page-break-after: always !important, which would otherwise
                force a trailing blank sheet after the last page. */
             page-break-after: auto !important;
             break-after: auto !important;
           }
           .page-number {
             display: none !important;
           }
        }
      `}</style>

      <div className="w-full h-full flex flex-col items-center print:min-h-screen print:overflow-visible">
        <div className={`page markdown-source-page ${paginationThemeClass}`.trim()} aria-hidden="true">
          <div ref={sourceRef} id="markdown-source" className="page-content markdown-source">
            <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeRaw, rehypeKatex]}
            components={{
              pre: ({ children }) => <div>{children}</div>,
              code: ({ inline, className, children, ...props }: any) => {
                const match = /language-([\w-]+)/.exec(className || '');
                const language = match ? match[1] : '';
                const codeContent = String(children).replace(/\n$/, '');

                if (language === 'chatgpt-rad') {
                  return <RadModelDiagram theme={theme} />;
                }

                // ```html-render``` or ```html-render:16:9``` — render raw HTML
                // as a block (like an image), optional aspect ratio after colon.
                const htmlRender = /language-html-render(?::(\d+)[:x/](\d+))?/.exec(className || '');
                if (htmlRender) {
                  const ratio = htmlRender[1] ? `${htmlRender[1]} / ${htmlRender[2]}` : undefined;
                  return (
                    <div
                      className="html-render-block"
                      style={{
                        width: '100%',
                        aspectRatio: ratio,
                        overflow: 'hidden',
                        margin: '1.5em auto',
                        display: 'block',
                        clear: 'both',
                      }}
                      dangerouslySetInnerHTML={{ __html: codeContent }}
                    />
                  );
                }

                // react-markdown v9+ no longer passes `inline` — infer it.
                // Fenced blocks without a language must still render as blocks,
                // otherwise multi-line code collapses into one nowrap line.
                const isInline = inline ?? (!className && !codeContent.includes('\n'));

                if (isInline) {
                  return (
                    <code
                      className="px-1.5 py-0.5 rounded text-[0.9em]"
                      style={{
                        backgroundColor: theme.colors.codeBackground,
                        color: theme.colors.text,
                        fontFamily: codeFont,
                        overflowWrap: 'anywhere'
                      }}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }

                if (language === 'mermaid') {
                  return <MermaidDiagram chart={codeContent} theme={theme} />;
                }

                // ChatGPT can copy the Mermaid source under this language name.
                // The rendered SVG form is handled by the `svg` renderer below.
                if (language === 'chatgpt-mermaid') {
                  return <MermaidDiagram chart={codeContent} theme={theme} />;
                }

                if (language === 'chatgpt-svg') {
                  const svgBase64 = codeContent.trim();
                  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(svgBase64)) {
                    return <div className="my-4 text-sm" style={{ color: theme.colors.secondary }}>Invalid ChatGPT diagram clipboard data.</div>;
                  }
                  return (
                    <div className="mermaid-container my-6 w-full overflow-hidden p-4 rounded-3xl" style={{ backgroundColor: theme.colors.codeBackground, border: `1px solid ${theme.colors.border}` }}>
                      <img
                        src={`data:image/svg+xml;base64,${svgBase64}`}
                        alt="ChatGPT diagram"
                        className="block w-full max-w-full h-auto max-h-[680px] object-contain mx-auto"
                      />
                    </div>
                  );
                }

                if (language === 'diagram') {
                  return <DiagramBlock source={codeContent} theme={theme} />;
                }

                const activeBg = codeBlockDark ? darkBlockBg : theme.colors.codeBackground;
                const headerBg = activeBg;
                const headerBorder = codeBlockDark ? 'rgba(255,255,255,0.1)' : (theme.colors.border || '#e5e7eb');
                const headerText = codeBlockDark ? 'rgba(255,255,255,0.6)' : theme.colors.secondary;
                const codeTextColor = effectivelyDark ? '#e2e8f0' : theme.colors.text;

                return (
                  <div className="code-block-wrapper shadow-sm print:shadow-none">
                    {codeWindowStyle ? (
                      <div className="flex items-center justify-between px-4 py-2 select-none" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${headerBorder}` }}>
                        <div className="flex space-x-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: headerText }}>{language}</span>
                      </div>
                    ) : (
                      <div className="flex items-center px-4 py-1.5" style={{ backgroundColor: headerBg, borderBottom: `1px solid ${headerBorder}` }}>
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: headerText }}>{language}</span>
                      </div>
                    )}

                    <SyntaxHighlighter
                      style={activeHighlightStyle}
                      language={language || 'text'}
                      PreTag="div"
                      wrapLongLines={wordWrap}
                      wrapLines
                      lineProps={(lineNumber: number) => ({
                        className: 'pagination-code-line',
                        'data-line-number': lineNumber,
                      })}
                      showLineNumbers={showLineNumbers}
                      lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1em', color: codeBlockDark ? '#6e7681' : theme.colors.secondary, opacity: 0.5, textAlign: 'right', userSelect: 'none' }}
                      customStyle={{
                        backgroundColor: activeBg,
                        margin: 0,
                        padding: '1.25em',
                        fontSize: '0.85em',
                        fontFamily: codeFont,
                        border: 'none',
                        fontWeight: '400',
                      }}
                      codeTagProps={{ style: { fontFamily: codeFont } }}
                      {...props}
                    >
                      {codeContent}
                    </SyntaxHighlighter>
                  </div>
                );
              },
              // ChatGPT's rendered diagrams are SVGs with styles scoped to an
              // id such as `chatgpt-mermaid-_r_km_`. Keep the whole diagram as
              // an atomic pagination/export block and let its embedded CSS work.
              svg: ({ children, ...props }: any) => {
                const isChatGptMermaid = String(props.id || '').startsWith('chatgpt-mermaid-');
                const svgElement = <svg {...props}>{children}</svg>;
                return isChatGptMermaid ? (
                  <div className="mermaid-container chatgpt-mermaid-container">
                    {svgElement}
                    <style>{`
                      .chatgpt-mermaid-container .edgePath .path,
                      .chatgpt-mermaid-container .flowchart-link,
                      .chatgpt-mermaid-container .messageLine0,
                      .chatgpt-mermaid-container .messageLine1 {
                        stroke: ${getDiagramEdgeColor(theme.isDark)} !important;
                      }
                      .chatgpt-mermaid-container .marker,
                      .chatgpt-mermaid-container .arrowheadPath {
                        fill: ${getDiagramEdgeColor(theme.isDark)} !important;
                        stroke: ${getDiagramEdgeColor(theme.isDark)} !important;
                      }
                    `}</style>
                  </div>
                ) : svgElement;
              },
              hr: () => !ignoreHr ? <hr className="my-10 border-gray-200" style={{ borderColor: theme.colors.border }} /> : null
            }}
          >
            {preprocessedContent}
            </ReactMarkdown>
          </div>
        </div>

        <div
          ref={targetRef}
          className="markdown-pages w-full min-w-fit flex flex-col items-center"
          style={{ paddingTop: '2rem', paddingBottom: '2rem' }}
        />
      </div>
    </div>
  );
};

export default MarkdownPreview;
