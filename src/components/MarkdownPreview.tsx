
import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
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
import DiagramBlock from './DiagramBlock';

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

export const preprocessMarkdown = (text: string): string => {
  if (!text) return '';

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
    return preprocessMarkdown(content);
  }, [content]);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current || !containerRef.current.parentElement) return;
      // Measure parent element width to avoid scrollbar layout loop!
      const parentWidth = containerRef.current.parentElement.clientWidth - 32;
      const pageWidthPx = 210 * (96 / 25.4);
      if (parentWidth < pageWidthPx) {
        setScale(parentWidth / pageWidthPx);
      } else {
        setScale(1);
      }
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

    const paginate = () => {
      // Clear target to rebuild pages
      target.innerHTML = '';

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

      const children = Array.from(source.children) as HTMLElement[];
      if (children.length === 0) return;

      // Single pass reading of elements' layout in source
      const sourceRect = source.getBoundingClientRect();
      const layouts = children.map(child => {
        const isHeader = /^H[1-6]$/.test(child.tagName);
        const isDiagram = child.classList.contains('mermaid-container') ||
          child.querySelector('.mermaid-container') !== null;
        const isCodeBlock = child.tagName === 'PRE' ||
          child.classList.contains('code-block-wrapper') ||
          child.querySelector('.code-block-wrapper') !== null;
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

      for (let i = 0; i < layouts.length; i++) {
        const layout = layouts[i];
        
        // Skip elements with 0 height (hidden or empty)
        if (layout.height === 0) continue;

        // Check if element starts after current page height or close to bottom
        const spaceLeft = MAX_CONTENT_HEIGHT - (layout.top - currentPageStartY);

        // Orphan protection for headers: push to next page earlier so the heading
        // itself does not get clipped by the page bottom.
        if (layout.isHeader && spaceLeft < 120) {
          createNewPage(layout.top);
        } else if (layout.isCodeBlock && spaceLeft < layout.height + 10) {
          // Push code blocks to next page if not enough space for full block
          if (currentPageItems.length > 0) {
            createNewPage(layout.top);
          }
        } else if (layout.top - currentPageStartY > MAX_CONTENT_HEIGHT - 10) {
          createNewPage(layout.top);
        }

        const elementBottom = layout.bottom;
        
        // 1. Fits completely
        if (elementBottom - currentPageStartY <= MAX_CONTENT_HEIGHT) {
          currentPageItems.push({ type: 'full', element: layout.element });
        } 
        // 2. Doesn't fit, need to handle split
        else {
          const isUnsplittable = !layout.isList;

          if (isUnsplittable) {
            if (currentPageItems.length > 0) {
              createNewPage(layout.top);
            }
            currentPageItems.push({ type: 'full', element: layout.element });
          } 
          // Handle Lists
          else if (layout.isList && layout.listItems.length > 0) {
            const listItems = layout.listItems;
            let currentStart = 1;
            
            // Find how many fit on the current page
            const fitItems: HTMLElement[] = [];
            let firstOverflowIdx = -1;
            
            for (let j = 0; j < listItems.length; j++) {
              const li = listItems[j];
              if (li.bottom - currentPageStartY <= MAX_CONTENT_HEIGHT) {
                fitItems.push(li.element);
              } else {
                firstOverflowIdx = j;
                break;
              }
            }

            if (fitItems.length > 0) {
              currentPageItems.push({
                type: 'list-split',
                element: layout.element,
                tagName: layout.tagName,
                className: layout.className,
                start: currentStart,
                items: fitItems
              });
              currentStart += fitItems.length;
            } else {
              // None fit, push the list to the next page
              if (currentPageItems.length > 0) {
                createNewPage(layout.top);
              }
              firstOverflowIdx = 0;
            }

            if (firstOverflowIdx !== -1) {
              let currentListItems = listItems.slice(firstOverflowIdx);
              while (currentListItems.length > 0) {
                createNewPage(currentListItems[0].top);
                
                const pageFit: HTMLElement[] = [];
                let nextOverflowIdx = -1;
                
                for (let j = 0; j < currentListItems.length; j++) {
                  const li = currentListItems[j];
                  if (li.bottom - currentPageStartY <= MAX_CONTENT_HEIGHT) {
                    pageFit.push(li.element);
                  } else {
                    nextOverflowIdx = j;
                    break;
                  }
                }

                if (pageFit.length > 0) {
                  currentPageItems.push({
                    type: 'list-split',
                    element: layout.element,
                    tagName: layout.tagName,
                    className: layout.className,
                    start: currentStart,
                    items: pageFit
                  });
                  currentStart += pageFit.length;
                } else {
                  // Even a single item is taller than a page, force it to fit
                  currentPageItems.push({
                    type: 'full',
                    element: currentListItems[0].element
                  });
                  nextOverflowIdx = 1;
                  currentStart += 1;
                }

                if (nextOverflowIdx === -1) {
                  break;
                }
                currentListItems = currentListItems.slice(nextOverflowIdx);
              }
            }
          }
        }
      }

      // Write Phase: Construct HTML in one go
      pagesData.forEach(pageData => {
        if (pageData.items.length === 0) return;

        const page = document.createElement('div');
        page.className = 'page';
        const wrapper = document.createElement('div');
        // Match the hidden measurement container's typography context so the
        // measured height and the rendered height stay in sync.
        wrapper.className = 'page-content';
        wrapper.style.height = '100%';
        wrapper.style.position = 'relative';
        wrapper.style.overflow = 'hidden';
        page.appendChild(wrapper);

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
            wrapper.appendChild(item.element.cloneNode(true));
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
            chunkContent.style.margin = '0';
            chunkContent.style.marginTop = `-${item.offset}px`;

            chunkWrapper.appendChild(chunkContent);
            wrapper.appendChild(chunkWrapper);

            if (item.isLast) {
              chunkWrapper.style.marginBottom = item.marginBottom || '0';
            }
          }
        });

        target.appendChild(page);
      });
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
         :is(.page, .markdown-source) :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, table, a, strong, em) {
             line-height: 1.5 !important;
         }
         .page :is(p, li, blockquote, td, a, strong, em) {
             color: ${theme.colors.text} !important;
         }
         
         /* Floated elements clear for main blocks */
         .page h1, .page h2, .page h3, .page h4, .page h5, .page h6, 
         .page hr, .page table, .page .code-block-wrapper, .page blockquote, 
         .page ul, .page ol, .page .diagram-container {
             clear: both;
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

         /* Limit Mermaid diagram size. No transform:scale here — a transform
            shrinks the drawing but NOT its layout box, which left large blank
            gaps around diagrams. width:auto + max-height lets the browser
            shrink the box itself while preserving the aspect ratio. */
         .mermaid-container svg {
            max-width: 100%;
            max-height: 380px;
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
         h1, h2, h3, h4, h5, h6 { 
            font-family: ${theme.fonts.heading} !important; 
            color: ${theme.colors.heading} !important; 
            line-height: 1.2;
            margin-top: 1.5em;
            margin-bottom: 0.8em;
          }
          h1:first-child, h2:first-child, p:first-child { margin-top: 0; }
          h1 { font-size: 2.25em !important; font-weight: 800 !important; letter-spacing: -0.025em; }
          h2 { font-size: 1.6em !important; font-weight: 700 !important; letter-spacing: -0.025em; border-bottom: 2px solid ${theme.colors.primary}30 !important; padding-bottom: 0.3em; }
          h3 { 
            font-size: 1.3em !important; 
            font-weight: 700 !important; 
            letter-spacing: -0.02em;
            border-left: 4px solid ${theme.colors.primary} !important;
            padding-left: 0.75em;
            margin-top: 1.8em;
          }
          h4 { font-size: 1.15em !important; font-weight: 600 !important; }
          h5 { font-size: 1.05em !important; font-weight: 600 !important; }
          h6 { font-size: 1em !important; font-weight: 600 !important; text-transform: uppercase; letter-spacing: 0.05em; }
          p {
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
          .page p, .page li {
            text-align: justify !important;
            line-height: 1.5 !important;
            font-size: 12pt !important;
          }
          .page h1, .page h2, .page h3, .page h4, .page h5, .page h6 {
            line-height: 1 !important;
            text-align: left !important;
            letter-spacing: 0 !important;
            border: none !important;
            border-bottom: none !important;
            border-left: none !important;
            padding-left: 0 !important;
          }
          .page h1 { font-size: 16pt !important; font-weight: 700 !important; }
          .page h2 { font-size: 14pt !important; font-weight: 700 !important; }
          .page h3 { font-size: 13pt !important; font-weight: 700 !important; }
          .page h4, .page h5, .page h6 { font-size: 12pt !important; font-weight: 700 !important; }
          .page table, .page td, .page th { font-size: 10pt !important; }
          ` : ''}

          table {
            width: 100%;
            max-width: 100%;
            margin: 1.5em 0;
            border-collapse: collapse;
            table-layout: auto;
            font-size: 0.92em;
            overflow-wrap: anywhere;
          }
          thead {
            background-color: ${theme.colors.primary}14;
          }
          th, td {
            padding: 0.75em 0.9em;
            border: 1px solid ${theme.colors.border || `${theme.colors.primary}33`};
            text-align: left;
            vertical-align: top;
            line-height: 1.45 !important;
          }
          th {
            color: ${theme.colors.heading} !important;
            font-weight: 800;
            white-space: nowrap;
          }
          td {
            color: ${theme.colors.text} !important;
          }
          tbody tr:nth-child(even) {
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
           html, body {
             background: white !important;
             margin: 0 !important;
             padding: 0 !important;
           }
           .page {
             transform: none !important;
             margin: 0 !important;
             box-shadow: none !important;
             border: none !important;
             page-break-after: always !important;
             padding: ${getVerticalPadding()} ${getHorizontalPadding()} !important;
             width: 210mm !important;
             height: 297mm !important;
           }
           .page:last-child {
             page-break-after: avoid !important;
           }
           .page-number {
             display: none !important;
           }
        }
      `}</style>

      <div className="w-full h-full flex flex-col items-center print:min-h-screen print:overflow-visible">
        <div ref={sourceRef} id="markdown-source" className="markdown-source">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              pre: ({ children }) => <div>{children}</div>,
              code: ({ inline, className, children, ...props }: any) => {
                const match = /language-(\w+)/.exec(className || '');
                const language = match ? match[1] : '';
                const codeContent = String(children).replace(/\n$/, '');

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
              hr: () => !ignoreHr ? <hr className="my-10 border-gray-200" style={{ borderColor: theme.colors.border }} /> : null
            }}
          >
            {preprocessedContent}
          </ReactMarkdown>
        </div>

        <div
          ref={targetRef}
          className="w-full min-w-fit flex flex-col items-center"
          style={{ paddingTop: '2rem', paddingBottom: '2rem' }}
        />
      </div>
    </div>
  );
};

export default MarkdownPreview;
