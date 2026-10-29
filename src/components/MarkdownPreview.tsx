
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

    const splitLabels = labelsText
      .replace(/([a-z0-9])([A-Z])/g, '$1\n$2')
      .split(/\r?\n/)
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

    // Guard against redundant rebuilds: repagination triggered by the scrollbar
    // appearing/disappearing (not by a content change) produces the identical
    // layout signature, so we skip the rebuild entirely. This breaks the
    // paginate → height-change → scrollbar-toggle → resize → repaginate loop
    // that made the preview "dance".
    let lastSignature: string | null = null;

    const paginate = () => {
      // Constants for A4 @ 96 DPI
      const PPI = 96;
      const MM_TO_PX = PPI / 25.4;
      const PAGE_HEIGHT_PX = 297 * MM_TO_PX;

      // Calculate margins in pixels
      const parseMm = (val: string) => parseFloat(val.replace('mm', ''));
      const marginVertMm = parseMm(getVerticalPadding());
      const marginVertPx = marginVertMm * MM_TO_PX;

      // Content Height
      // Leave a small safety buffer so rounding/font-metric differences
      // do not clip the final line at the bottom of a page.
      const PAGE_SAFETY_PX = 24;
      const MAX_CONTENT_HEIGHT = PAGE_HEIGHT_PX - (marginVertPx * 2) - PAGE_SAFETY_PX;

      // Measure each rendered line's offset (relative to the element's top) and
      // the line height, using the Range API. Text nodes only — inline elements
      // (<strong>, <a>, …) share their parent's line box, so walking text nodes
      // and grouping by rounded y-offset reconstructs every line. Returns null
      // for empty elements so callers fall back to treating the block as atomic.
      const measureLines = (el: HTMLElement): { lines: number[]; lineHeight: number } | null => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const offsets = new Set<number>();
        const range = document.createRange();
        let node = walker.nextNode();
        let maxBottom = 0;
        while (node) {
          if (node.textContent && node.textContent.trim().length > 0) {
            range.selectNodeContents(node);
            const rects = range.getClientRects();
            const elTop = el.getBoundingClientRect().top;
            for (let i = 0; i < rects.length; i++) {
              const r = rects[i];
              if (r.height === 0) continue;
              offsets.add(Math.round(r.top - elTop));
              if (r.bottom - elTop > maxBottom) maxBottom = r.bottom - elTop;
            }
          }
          node = walker.nextNode();
        }
        const lines = Array.from(offsets).sort((a, b) => a - b);
        if (lines.length === 0) return null;
        const lineHeight = lines.length > 1 ? lines[1] - lines[0] : maxBottom;
        return { lines, lineHeight };
      };

      const children = Array.from(source.children) as HTMLElement[];
      if (children.length === 0) return;

      // Single pass reading of elements' layout in source
      const sourceRect = source.getBoundingClientRect();
      const layouts = children.map(child => {
        const isHeader = /^H[1-6]$/.test(child.tagName);
        const isDiagram = child.classList.contains('mermaid-container') ||
          child.classList.contains('diagram-container') ||
          child.querySelector('.mermaid-container, .diagram-container') !== null;
        const isCodeBlock = child.tagName === 'PRE' ||
          child.classList.contains('code-block-wrapper') ||
          child.querySelector('.code-block-wrapper') !== null;
        const isMathBlock = child.matches('.katex-display') ||
          child.querySelector('.katex-display') !== null;
        const isList = child.tagName === 'OL' || child.tagName === 'UL';

        const childRect = child.getBoundingClientRect();
        const childStyle = window.getComputedStyle(child);
        const marginTop = parseFloat(childStyle.marginTop || '0') || 0;
        const marginBottom = parseFloat(childStyle.marginBottom || '0') || 0;
        const extraVerticalSpace = marginTop + marginBottom;
        const absTop = childRect.top - sourceRect.top;

        let listItems: any[] = [];
        if (isList) {
          listItems = Array.from(child.children).map(li => {
            const liHtml = li as HTMLElement;
            const liRect = liHtml.getBoundingClientRect();
            const liStyle = window.getComputedStyle(liHtml);
            const liMarginTop = parseFloat(liStyle.marginTop || '0') || 0;
            const liMarginBottom = parseFloat(liStyle.marginBottom || '0') || 0;
            const liAbsTop = liRect.top - sourceRect.top;
            return {
              element: liHtml,
              top: liAbsTop,
              // Content bottom (no margin) used for fit checks — a li's
              // trailing margin should not evict it from space where a
              // plain text line of the same height would fit.
              contentBottom: liAbsTop + liRect.height,
              bottom: liAbsTop + liRect.height + liMarginTop + liMarginBottom,
              height: liRect.height + liMarginTop + liMarginBottom
            };
          });
        }

        return {
          element: child,
          top: absTop,
          bottom: absTop + childRect.height + extraVerticalSpace,
          height: childRect.height + extraVerticalSpace,
          tagName: child.tagName,
          className: child.className,
          isHeader,
          isDiagram,
          isCodeBlock,
          isMathBlock,
          isList,
          listItems
        };
      });

      interface PageItem {
        type: 'full' | 'list-split' | 'split-chunk';
        element: HTMLElement;
        tagName?: string;
        className?: string;
        start?: number;
        items?: HTMLElement[];
        chunkHeight?: number;
        offset?: number;
        isFirst?: boolean;
        isLast?: boolean;
        marginTop?: string;
        marginBottom?: string;
        /** scale factor for shrink-to-fit visual blocks (diagrams, code) */
        fitScale?: number;
      }

      interface PageData {
        pageNum: number;
        items: PageItem[];
      }

      const pagesData: PageData[] = [];
      let currentPageNum = 1;
      let currentPageStartY = 0;
      let currentPageItems: PageItem[] = [];

      pagesData.push({ pageNum: currentPageNum, items: currentPageItems });

      const createNewPage = (newStartY: number) => {
        currentPageNum++;
        currentPageStartY = newStartY;
        currentPageItems = [];
        pagesData.push({ pageNum: currentPageNum, items: currentPageItems });
      };

      // ---- Line-stream pagination ----
      // Build a flat stream of lines: each line object carries a reference to
      // its source block. Headers / code / diagrams become ONE multi-line
      // "group" (unbreakable); lists and text blocks contribute one entry per
      // rendered line (Range-measured). Pages are then packed greedily at
      // line boundaries — no paragraph is ever left whole when only part of
      // it fits, which is what produced the page-bottom gaps.

      interface LineEntry {
        block: any;           // layout record
        kind: 'full' | 'line' | 'list-item';
        offsetTop: number;    // px from the block's own top to this line's top
        offsetBottom: number; // px from the block's top to this line's bottom
        absTop: number;       // absolute top in the source document
        absBottom: number;
        listIndex?: number;   // for list items
        liElement?: HTMLElement; // for list items
      }

      const lineStream: LineEntry[] = [];

      for (const layout of layouts) {
        if (layout.height === 0) continue;
        const contentH = layout.element.getBoundingClientRect().height;

        if (layout.isList && layout.listItems.length > 0) {
          // Each list item is its own unbreakable group, rendered as a
          // list-split so the <ol>/<ul> wrapper + numbering are preserved.
          for (let li = 0; li < layout.listItems.length; li++) {
            const item = layout.listItems[li];
            lineStream.push({
              block: layout, kind: 'list-item',
              offsetTop: 0, offsetBottom: item.height,
              absTop: item.top, absBottom: item.contentBottom,
              listIndex: li, liElement: item.element
            });
          }
        } else {
          const atomic = layout.isHeader || layout.isDiagram || layout.isCodeBlock || layout.isMathBlock ||
            !(layout.tagName === 'P' || layout.tagName === 'BLOCKQUOTE' ||
              layout.tagName === 'DIV' || layout.tagName === 'SECTION');
          const m = measureLines(layout.element);
          // Blocks that contain non-text media (images, iframes, raw HTML
          // render blocks) must never be sliced, even if their tag is P/DIV.
          const hasMedia = layout.element.querySelector('img, iframe, video, .html-render-block, svg') !== null;
          if (atomic || hasMedia || !m || m.lines.length === 0) {
            lineStream.push({
              block: layout, kind: 'full',
              offsetTop: 0, offsetBottom: contentH,
              absTop: layout.top, absBottom: layout.top + contentH
            });
          } else {
            const offs = m.lines;
            for (let k = 0; k < offs.length; k++) {
              const oTop = offs[k];
              const oBottom = (k + 1 < offs.length) ? offs[k + 1] : contentH;
              lineStream.push({
                block: layout, kind: 'line',
                offsetTop: oTop, offsetBottom: oBottom,
                absTop: layout.top + oTop, absBottom: layout.top + oBottom
              });
            }
          }
        }
      }

      // Order everything by position (lists interleave their items)
      lineStream.sort((a, b) => a.absTop - b.absTop);

      // Pack entries into pages. Entry kinds:
      //  'list-item' → grouped into list-split runs (preserves <ol>/<ul> + numbering)
      //  'full'      → atomic block (header / code / diagram / media / short text)
      //  'line'      → one measured line of a splittable text block
      let lineIdx = 0;
      const total = lineStream.length;

      while (lineIdx < total) {
        const first = lineStream[lineIdx];
        if (currentPageItems.length === 0) {
          // Adopt the first entry's absolute top as this page's content start.
          currentPageStartY = first.absTop;
          currentPageItems = pagesData[pagesData.length - 1].items;
        }
        const avail = MAX_CONTENT_HEIGHT - (first.absTop - currentPageStartY);

        // ---- list item run ----
        if (first.kind === 'list-item') {
          const block = first.block;
          const fit: LineEntry[] = [];
          let k = lineIdx;
          while (k < total && lineStream[k].kind === 'list-item' && lineStream[k].block === block &&
                 (lineStream[k].absBottom - currentPageStartY) <= MAX_CONTENT_HEIGHT + 0.5) {
            fit.push(lineStream[k]);
            k++;
          }
          if (fit.length > 0) {
            currentPageItems.push({
              type: 'list-split',
              element: block.element,
              tagName: block.tagName,
              className: block.className,
              start: fit[0].listIndex + 1,
              items: fit.map(f => f.liElement as HTMLElement)
            });
            lineIdx = k;
            // More items of the same list remain → next page
            if (lineIdx < total && lineStream[lineIdx].kind === 'list-item' && lineStream[lineIdx].block === block) {
              createNewPage(lineStream[lineIdx].absTop);
            }
            continue;
          }
          // none fit → next page (force-place one if page is empty)
          if (currentPageItems.length === 0) {
            currentPageItems.push({
              type: 'list-split',
              element: block.element,
              tagName: block.tagName,
              className: block.className,
              start: first.listIndex + 1,
              items: [first.liElement as HTMLElement]
            });
            lineIdx++;
            createNewPage(lineIdx < total ? lineStream[lineIdx].absTop : first.absTop);
            continue;
          }
          createNewPage(first.absTop);
          continue;
        }

        // ---- atomic block ----
        if (first.kind === 'full') {
          const groupH = first.absBottom - first.absTop;
          // Keep-with-next: a heading may not stand alone at the bottom of a
          // page — it must have at least one line of what follows on the same
          // page, otherwise the heading moves to the next page too.
          if (first.block.isHeader && currentPageItems.length > 0) {
            const next = lineStream[lineIdx + 1];
            if (next) {
              const headerBottom = first.absTop + (first.offsetBottom - first.offsetTop);
              const headerFits = (headerBottom - currentPageStartY) <= MAX_CONTENT_HEIGHT + 0.5;
              const nextLineFits = (next.absBottom - currentPageStartY) <= MAX_CONTENT_HEIGHT + 0.5;
              if (headerFits && !nextLineFits) {
                createNewPage(first.absTop);
                continue;
              }
            }
          }
          if (groupH <= avail + 0.5) {
            if (first.block.isDiagram || first.block.isCodeBlock) {
              const fitRatio = avail / groupH;
              if (fitRatio >= 0.55 && fitRatio < 1 && currentPageItems.length > 0) {
                currentPageItems.push({ type: 'full', element: first.block.element, fitScale: fitRatio });
                lineIdx++;
                continue;
              }
            }
            currentPageItems.push({ type: 'full', element: first.block.element });
            lineIdx++;
            continue;
          }
          // Doesn't fit → push to next page (unless page empty → force-place)
          if (currentPageItems.length > 0) { createNewPage(first.absTop); continue; }
          currentPageItems.push({ type: 'full', element: first.block.element });
          lineIdx++;
          continue;
        }

        // ---- text lines ----
        const block = first.block;
        let endIdx = lineIdx;
        let chunkBottomAbs = first.absTop;
        while (endIdx < total) {
          const le = lineStream[endIdx];
          if (le.block !== block || le.kind !== 'line') break;
          if ((le.absBottom - currentPageStartY) <= MAX_CONTENT_HEIGHT + 0.5) {
            chunkBottomAbs = le.absBottom;
            endIdx++;
          } else {
            break;
          }
        }

        if (endIdx > lineIdx) {
          const offset = first.offsetTop;
          const chunkHeight = chunkBottomAbs - first.absTop;
          const isLastLine = endIdx >= total || lineStream[endIdx].block !== block || lineStream[endIdx].kind !== 'line';
          currentPageItems.push({
            type: 'split-chunk',
            element: block.element,
            chunkHeight,
            offset,
            isFirst: offset === 0,
            isLast: isLastLine,
            marginTop: block.element.style.marginTop,
            marginBottom: block.element.style.marginBottom
          });
          lineIdx = endIdx;
          if (lineIdx < total && lineStream[lineIdx].block === block && lineStream[lineIdx].kind === 'line') {
            createNewPage(lineStream[lineIdx].absTop);
          }
          continue;
        }
        // Not even one line fits → new page (force-place one line if page empty)
        if (currentPageItems.length === 0) {
          currentPageItems.push({
            type: 'split-chunk',
            element: block.element,
            chunkHeight: first.offsetBottom - first.offsetTop,
            offset: first.offsetTop,
            isFirst: first.offsetTop === 0,
            isLast: false,
            marginTop: block.element.style.marginTop,
            marginBottom: block.element.style.marginBottom
          });
          lineIdx++;
        }
        createNewPage(lineIdx < total ? lineStream[lineIdx].absTop : first.absTop);
      }

      // Write Phase: Construct HTML in one go
      // Signature covers the inputs that determine the page layout: each
      // block's identity + geometry. Excluded: everything caused BY writing
      // pages (scrollbar, container height). If the signature matches the last
      // run, the rebuild is redundant → skip.
      const signature = layouts
        .map(l => `${l.tagName}:${l.top.toFixed(1)}:${l.bottom.toFixed(1)}:${l.height.toFixed(1)}`)
        .join('|');
      if (signature === lastSignature) {
        return;
      }
      lastSignature = signature;

      // Build the new page stack off-DOM, then swap it in once. Clearing and
      // appending pages one at a time briefly collapses scrollHeight, making
      // the preview scrollbar flash and resetting the user's scroll position.
      const pageStack = document.createDocumentFragment();
      const previousScrollTop = containerRef.current?.scrollTop ?? 0;

      pagesData.forEach(pageData => {
        if (pageData.items.length === 0) return;

        const page = document.createElement('div');
        page.className = theme.name === 'Pixelize' ? 'page theme-pixelize' : 'page';
        const wrapper = document.createElement('div');
        // Match the hidden measurement container's typography context so the
        // measured heights and the rendered heights stay in sync.
        wrapper.className = 'page-content';
        wrapper.style.height = '100%';
        wrapper.style.position = 'relative';
        wrapper.style.overflow = 'hidden';
        page.appendChild(wrapper);

        // Theme signature marks (absolute + pointer-events:none ⇒ no effect
        // on measurement or pagination). A signature is structural — a page
        // frame or corner mark — not scattered decoration.
        const addSignature = () => {
          if (theme.name === 'Night Sky') {
            // Refined constellation: a thin hairline down each margin with a
            // few subtle junction points — reads as a deliberate frame, not
            // scattered stickers.
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
            // Pixel-burst corners: stepped squares in each corner
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
            (['tl', 'tr', 'bl', 'br'] as const).forEach(c => page.appendChild(burst(c)));
          }
        };
        addSignature();

        if (showPageNumbers && pageData.pageNum > 1) {
          const pageNumDiv = document.createElement('div');
          pageNumDiv.className = 'page-number';
          pageNumDiv.innerText = `${pageData.pageNum}`;
          pageNumDiv.style.position = 'absolute';
          pageNumDiv.style.bottom = '10mm';
          pageNumDiv.style.right = '20mm';
          pageNumDiv.style.fontSize = '12px';
          pageNumDiv.style.opacity = '0.5';
          pageNumDiv.style.pointerEvents = 'none';
          pageNumDiv.style.color = theme.colors.text;
          page.appendChild(pageNumDiv);
        }

        pageData.items.forEach(item => {
          if (item.type === 'full') {
            if (item.fitScale && item.fitScale < 1) {
              // Shrink-to-fit: transform scales the block visually; the wrapper
              // reserves the scaled height (and margin compensation) so the
              // page box geometry stays truthful.
              const scaleBox = document.createElement('div');
              const fullH = item.element.getBoundingClientRect().height;
              const scaledH = fullH * item.fitScale;
              scaleBox.className = 'fit-scale-box';
              scaleBox.style.height = `${scaledH}px`;
              scaleBox.style.width = '100%';
              scaleBox.style.overflow = 'hidden';
              scaleBox.style.margin = '0 auto 1em auto';
              scaleBox.style.position = 'relative';
              const inner = item.element.cloneNode(true) as HTMLElement;
              inner.style.transform = `scale(${item.fitScale})`;
              inner.style.transformOrigin = 'top left';
              inner.style.width = `${100 / item.fitScale}%`;
              inner.style.margin = '0';
              scaleBox.appendChild(inner);
              wrapper.appendChild(scaleBox);
            } else {
              wrapper.appendChild(item.element.cloneNode(true));
            }
          } else if (item.type === 'list-split') {
            const list = document.createElement(item.tagName || 'ul');
            if (item.tagName === 'OL') {
              list.setAttribute('start', String(item.start));
            }
            list.className = item.className || '';
            item.items?.forEach(li => {
              list.appendChild(li.cloneNode(true));
            });
            wrapper.appendChild(list);
          } else if (item.type === 'split-chunk') {
            const chunkWrapper = document.createElement('div');
            chunkWrapper.style.height = `${item.chunkHeight}px`;
            chunkWrapper.style.overflow = 'hidden';
            chunkWrapper.style.margin = '0';
            chunkWrapper.style.width = '100%';
            chunkWrapper.className = 'split-chunk-wrapper';

            if (item.isFirst) {
              chunkWrapper.style.marginTop = item.marginTop || '0';
            }
            const chunkContent = item.element.cloneNode(true) as HTMLElement;
            // Inline styles beat the stylesheet's margin rules (incl. the
            // `!important` heading margins and `:first-child` margin-top:0), so
            // the negative top margin reliably shifts the slice into view.
            chunkContent.style.margin = '0';
            chunkContent.style.marginTop = `-${item.offset}px`;
            chunkContent.style.marginBottom = '0';

            chunkWrapper.appendChild(chunkContent);
            wrapper.appendChild(chunkWrapper);

            if (item.isLast) {
              chunkWrapper.style.marginBottom = item.marginBottom || '0';
            }
          }
        });

        pageStack.appendChild(page);
      });

      target.replaceChildren(pageStack);
      if (containerRef.current) containerRef.current.scrollTop = previousScrollTop;
    };

    let debounceTimeout: any = null;

    const runPagination = () => {
      paginate();
    };

    const debouncedPaginate = (delay = 200) => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      debounceTimeout = setTimeout(runPagination, delay);
    };

    // Initial run immediately
    runPagination();

    const observer = new MutationObserver((mutations) => {
      // Throttle/debounce observer updates
      debouncedPaginate(150);
    });

    const resizeObserver = new ResizeObserver(() => {
      debouncedPaginate(150);
    });

    if (source.children.length > 0) {
      observer.observe(source, { childList: true, subtree: true, characterData: true });
      resizeObserver.observe(source);
    }

    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      observer.disconnect();
      resizeObserver.disconnect();
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
            padding: ${getVerticalPadding()} ${getHorizontalPadding()};
            background-color: ${theme.colors.background};
            color: ${theme.colors.text} !important;
            font-family: ${theme.fonts.body};
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
         
         /* STRICT text styling to match split logic — applied to BOTH the hidden
            measurement source and the rendered pages so measured heights match
            rendered heights exactly (otherwise lines get clipped at page bottom). */
         :is(.page, .markdown-source) :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, table, a, strong, em):not(.html-render-block *) {
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
         }

         .markdown-source {
           position: absolute;
           top: 0;
           left: -9999px;
           width: calc(210mm - (${getHorizontalPadding()} * 2));
           visibility: hidden;
           /* Must match .page typography exactly or measured heights drift */
           font-family: ${theme.fonts.body};
           line-height: 1.5;
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
            padding: 25.4mm 25.4mm 25.4mm 38.1mm !important; /* top/right/bottom 1in, left 1.5in */
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
             box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
             border: 1px solid ${theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
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
           .markdown-source {
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
             padding: ${getVerticalPadding()} ${getHorizontalPadding()} !important;
             width: 210mm !important;
             height: 297mm !important;
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
        <div ref={sourceRef} id="markdown-source" className="markdown-source">
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
