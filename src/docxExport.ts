import {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink, ImageRun,
  Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel, AlignmentType,
  Footer, PageNumber,
} from 'docx';
import { AppTheme } from './types';

// Academic Report preset enforces strict formatting rules (Times New Roman,
// 12pt justified body, 1.5 spacing, set heading sizes, specific margins, page numbers).
const isAcademic = (t: AppTheme) => t.name === 'Academic Report';

// Max content width on an A4 page (~6.5in @ 96dpi) so wide images/diagrams don't overflow.
const MAX_W = 620;

const hex = (c: string) => (c || '').replace('#', '').slice(0, 6) || '000000';

// Normalize any CSS color ("#abc", "rgb(1,2,3)") to a 6-digit hex for docx.
function colorHex(c?: string): string | undefined {
  if (!c) return undefined;
  if (c.startsWith('#')) return hex(c);
  const m = c.match(/\d+/g);
  return m ? m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join('') : undefined;
}

// Mix a hex color toward white by `amt` (0..1) — used for soft table-header fill.
function tint(c: string, amt: number): string {
  const n = parseInt(hex(c), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map(v => Math.round(v + (255 - v) * amt));
  return ch.map(v => v.toString(16).padStart(2, '0')).join('');
}

// Rasterize an <svg> to a PNG Uint8Array (used as the fallback for the vector SVG).
async function svgToPng(svg: SVGSVGElement, w: number, h: number, scale = 4): Promise<Uint8Array> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const xml = new XMLSerializer().serializeToString(clone);
  const dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
  const img = await loadImage(dataUri);
  const canvas = document.createElement('canvas');
  canvas.width = w * scale; canvas.height = h * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : new Uint8Array();
}

// Word's SVG renderer can't draw <foreignObject> (mermaid's HTML labels), so the
// text vanishes. Replace each foreignObject with a real SVG <text> placed at its box,
// copying the computed color/size from the live element.
// Fill of the shape behind a label (the node rect/circle/path), so we can choose
// a contrasting text color instead of trusting the theme's single text color —
// saturated node fills (e.g. blue journey/flowchart boxes) need white text.
function nodeFill(fo: Element): string | null {
  let el: Element | null = fo;
  for (let i = 0; i < 4 && el; i++) {
    const shape = el.parentElement?.querySelector(
      ':scope > rect, :scope > circle, :scope > ellipse, :scope > polygon, :scope > path',
    ) as SVGElement | null;
    if (shape) {
      const f = shape.getAttribute('fill') || getComputedStyle(shape).fill;
      if (f && f !== 'none' && f !== 'transparent') return f;
    }
    el = el.parentElement;
  }
  return null;
}

// Black or white, whichever contrasts the given fill (perceived luminance).
function contrastText(fill: string, fallback: string): string {
  const h = colorHex(fill);
  if (!h) return fallback;
  const n = parseInt(h, 16);
  const L = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return L < 140 ? '#ffffff' : '#1f2937';
}

function flattenLabels(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const origFOs = svg.querySelectorAll('foreignObject');
  const cloneFOs = clone.querySelectorAll('foreignObject');
  cloneFOs.forEach((fo, i) => {
    const orig = origFOs[i] as HTMLElement | undefined;
    const labelEl = orig?.querySelector('div,span,p') as HTMLElement | null;
    const lines = Array.from(fo.querySelectorAll('span,div,p'))
      .map(n => (n.textContent || '').trim())
      .filter(Boolean);
    const text = (lines.length ? Array.from(new Set(lines)).pop()! : (fo.textContent || '')).trim();
    if (!text) { fo.remove(); return; }
    const cs = labelEl ? getComputedStyle(labelEl) : null;
    // Local box coords; the <text> is inserted in the FO's own parent so it
    // inherits that group's transform — correct for flowchart/state/mindmap/etc.
    const x = parseFloat(fo.getAttribute('x') || '0');
    const y = parseFloat(fo.getAttribute('y') || '0');
    const w = parseFloat(fo.getAttribute('width') || '0');
    const h = parseFloat(fo.getAttribute('height') || '0');
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', String(x + w / 2));
    t.setAttribute('y', String(y + h / 2));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    // Contrast against the node's own fill; fall back to the live computed color.
    const fill = orig ? nodeFill(orig) : null;
    t.setAttribute('fill', fill ? contrastText(fill, cs?.color || '#1f2937') : (cs?.color || '#1f2937'));
    t.setAttribute('font-size', cs?.fontSize || '14px');
    t.setAttribute('font-family', 'sans-serif');
    t.textContent = text;
    fo.parentNode?.replaceChild(t, fo);
  });
  return clone;
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image();
  i.crossOrigin = 'anonymous';
  i.onload = () => res(i);
  i.onerror = rej;
  i.src = src;
});

// Convert any <img> (data URI or remote) to PNG bytes + dimensions for ImageRun.
async function imgToPng(el: HTMLImageElement): Promise<{ data: Uint8Array; w: number; h: number } | null> {
  try {
    const img = await loadImage(el.currentSrc || el.src);
    let w = el.getBoundingClientRect().width || img.naturalWidth || 400;
    let h = el.getBoundingClientRect().height || img.naturalHeight || 300;
    if (w > MAX_W) { h = h * (MAX_W / w); w = MAX_W; }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
    if (!blob) return null;
    return { data: new Uint8Array(await blob.arrayBuffer()), w: Math.round(w), h: Math.round(h) };
  } catch {
    return null; // ponytail: skip CORS-blocked remote images rather than failing the whole export
  }
}

// --- inline runs ------------------------------------------------------------
// `base` (font/color/bold) is applied to every run produced — set per block so
// we never have to reconstruct runs afterward (docx doesn't expose run.options).
interface RunBase { font?: string; color?: string; bold?: boolean; size?: number }
function inlineRuns(node: Node, theme: AppTheme, base: RunBase = {}, fmt: { b?: boolean; i?: boolean; code?: boolean } = {}): (TextRun | ExternalHyperlink)[] {
  const out: (TextRun | ExternalHyperlink)[] = [];
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text) out.push(new TextRun({
        text,
        bold: fmt.b || base.bold,
        italics: fmt.i,
        size: base.size,
        font: fmt.code ? theme.fonts.code.replace(/['"]/g, '').split(',')[0].trim() : base.font,
        color: fmt.code ? hex(theme.colors.primary) : base.color,
      }));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toUpperCase();
    if (tag === 'BR') { out.push(new TextRun({ break: 1 })); return; }
    if (tag === 'STRONG' || tag === 'B') { out.push(...inlineRuns(el, theme, base, { ...fmt, b: true })); return; }
    if (tag === 'EM' || tag === 'I') { out.push(...inlineRuns(el, theme, base, { ...fmt, i: true })); return; }
    if (tag === 'CODE') { out.push(...inlineRuns(el, theme, base, { ...fmt, code: true })); return; }
    if (tag === 'A') {
      out.push(new ExternalHyperlink({
        link: el.getAttribute('href') || '#',
        children: [new TextRun({ text: el.textContent || '', style: 'Hyperlink' })],
      }));
      return;
    }
    out.push(...inlineRuns(el, theme, base, fmt));
  });
  return out;
}

const HSIZE: Record<string, number> = { H1: 36, H2: 28, H3: 24, H4: 20, H5: 18, H6: 16 }; // half-points

// Preserve syntax highlighting: walk the highlighter's token <span>s keeping each
// token's color, split into lines, skip the line-number gutter + header label.
function codeToDocx(wrapper: HTMLElement, theme: AppTheme): Paragraph[] {
  const codeFont = theme.fonts.code.replace(/['"]/g, '').split(',')[0].trim();
  const bg = hex(theme.colors.codeBackground);
  const root = (wrapper.querySelector('code') || wrapper.querySelector('pre') || wrapper) as HTMLElement;
  const lines: TextRun[][] = [[]];
  const push = (text: string, color?: string) => {
    text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push(new TextRun({ text: part, font: codeFont, size: 18, color }));
    });
  };
  const walk = (node: Node) => {
    node.childNodes.forEach(ch => {
      if (ch.nodeType === Node.TEXT_NODE) {
        const p = ch.parentElement;
        if (p && /linenumber/i.test(p.className)) return;
        const col = p ? (p.style.color || getComputedStyle(p).color) : '';
        push(ch.textContent || '', colorHex(col) || hex(theme.colors.text));
      } else if (ch.nodeType === Node.ELEMENT_NODE) {
        const e = ch as HTMLElement;
        if (/linenumber/i.test(e.className)) return;
        walk(e);
      }
    });
  };
  walk(root);
  while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return lines.map((runs, i) => new Paragraph({
    spacing: { after: i === lines.length - 1 ? 160 : 0, line: 240 },
    shading: { fill: bg },
    children: runs.length ? runs : [new TextRun({ text: ' ', font: codeFont, size: 18 })],
  }));
}

// --- block elements ---------------------------------------------------------
async function blockToDocx(el: HTMLElement, theme: AppTheme): Promise<any[]> {
  const tag = el.tagName.toUpperCase();
  const headFont = theme.fonts.heading.replace(/['"]/g, '').split(',')[0].trim();
  const bodyFont = theme.fonts.body.replace(/['"]/g, '').split(',')[0].trim();

  // Mermaid / generated diagram → vector SVG (+ PNG fallback)
  const svg = el.classList.contains('mermaid-container')
    ? el.querySelector('svg')
    : el.querySelector('.mermaid-container svg');
  if (svg) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.getAttribute('viewBox')?.split(/\s+/).map(Number);
    let w = rect.width || (vb ? vb[2] : 0) || 600;
    let h = rect.height || (vb ? vb[3] : 0) || 400;
    if (w > MAX_W) { h = h * (MAX_W / w); w = MAX_W; }
    const flat = flattenLabels(svg as SVGSVGElement);
    const svgStr = new XMLSerializer().serializeToString(flat);
    const png = await svgToPng(flat, w, h);
    return [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({
        type: 'svg',
        // ponytail: docx base64-decodes string data — pass SVG as bytes to avoid atob
        data: new TextEncoder().encode(svgStr),
        transformation: { width: Math.round(w), height: Math.round(h) },
        fallback: { type: 'png', data: png },
      } as any)],
    })];
  }

  const academic = isAcademic(theme);

  if (/^H[1-6]$/.test(tag)) {
    // Academic: 16pt (H1) / 14pt (H2) / 12pt (H3+) bold, left-aligned, single spacing.
    const acSize: Record<string, number> = { H1: 32, H2: 28, H3: 24, H4: 24, H5: 24, H6: 24 };
    return [new Paragraph({
      heading: academic ? undefined : HeadingLevel[`HEADING_${tag[1]}` as keyof typeof HeadingLevel],
      alignment: academic ? AlignmentType.LEFT : undefined,
      spacing: academic ? { before: 240, after: 120, line: 240 } : { before: 240, after: 120 },
      children: inlineRuns(el, theme, {
        font: headFont, color: hex(theme.colors.heading), bold: true,
        size: academic ? acSize[tag] : undefined,
      }),
    })];
  }

  if (tag === 'P' || tag === 'BLOCKQUOTE') {
    const imgs = Array.from(el.querySelectorAll('img'));
    if (imgs.length && el.textContent?.trim() === '') {
      const out: any[] = [];
      for (const im of imgs) {
        const p = await imgToPng(im);
        if (p) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: p.data, transformation: { width: p.w, height: p.h } } as any)] }));
      }
      return out;
    }
    return [new Paragraph({
      // Academic: 12pt justified, 1.5 line spacing.
      alignment: academic && tag === 'P' ? AlignmentType.JUSTIFIED : undefined,
      spacing: academic ? { after: 160, line: 360 } : { after: 160, line: 276 },
      indent: tag === 'BLOCKQUOTE' ? { left: 480 } : undefined,
      border: tag === 'BLOCKQUOTE' ? { left: { style: BorderStyle.SINGLE, size: 18, color: hex(theme.colors.primary), space: 12 } } : undefined,
      children: inlineRuns(el, theme, { font: bodyFont, color: hex(theme.colors.text), size: academic ? 24 : undefined }),
    })];
  }

  if (tag === 'UL' || tag === 'OL') return listToDocx(el, theme, tag === 'OL', 0);

  if (tag === 'PRE' || el.querySelector('pre') || el.classList.contains('code-block-wrapper')) {
    return codeToDocx(el, theme);
  }

  if (tag === 'TABLE') return [tableToDocx(el, theme)];

  if (tag === 'HR') return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: hex(theme.colors.border || theme.colors.secondary) } }, spacing: { after: 200 } })];

  // image directly
  if (tag === 'IMG') {
    const p = await imgToPng(el as HTMLImageElement);
    return p ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: p.data, transformation: { width: p.w, height: p.h } } as any)] })] : [];
  }

  // wrapper div etc — recurse into children
  const out: any[] = [];
  for (const c of Array.from(el.children)) out.push(...await blockToDocx(c as HTMLElement, theme));
  return out;
}

function listToDocx(list: HTMLElement, theme: AppTheme, ordered: boolean, level: number): Paragraph[] {
  const bodyFont = theme.fonts.body.replace(/['"]/g, '').split(',')[0].trim();
  const academic = isAcademic(theme);
  const out: Paragraph[] = [];
  Array.from(list.children).forEach(li => {
    if (li.tagName.toUpperCase() !== 'LI') return;
    const nested = Array.from(li.children).filter(c => /^(UL|OL)$/.test(c.tagName.toUpperCase())) as HTMLElement[];
    // inline content of the li, excluding nested lists
    const tmp = li.cloneNode(true) as HTMLElement;
    tmp.querySelectorAll('ul,ol').forEach(n => n.remove());
    out.push(new Paragraph({
      spacing: academic ? { after: 80, line: 360 } : { after: 80 },
      ...(ordered ? { numbering: { reference: 'num', level } } : { bullet: { level } }),
      children: inlineRuns(tmp, theme, { font: bodyFont, color: hex(theme.colors.text), size: academic ? 24 : undefined }),
    }));
    nested.forEach(n => out.push(...listToDocx(n, theme, n.tagName.toUpperCase() === 'OL', level + 1)));
  });
  return out;
}

function tableToDocx(table: HTMLElement, theme: AppTheme): Table {
  const bodyFont = theme.fonts.body.replace(/['"]/g, '').split(',')[0].trim();
  const border = hex(theme.colors.border || theme.colors.secondary);
  const academic = isAcademic(theme);
  // Soft tint of primary so header text stays readable (solid primary can be black).
  const headFill = tint(theme.colors.primary, 0.82);
  const rows = Array.from(table.querySelectorAll('tr')).map((tr, ri) => new TableRow({
    children: Array.from(tr.children).map(cell => {
      const isHead = cell.tagName.toUpperCase() === 'TH';
      return new TableCell({
        shading: isHead ? { fill: headFill } : undefined,
        children: [new Paragraph({
          children: inlineRuns(cell as HTMLElement, theme, { font: bodyFont, color: hex(isHead ? theme.colors.heading : theme.colors.text), bold: isHead, size: academic ? 21 : undefined }),
        })],
      });
    }),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: border },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: border },
      left: { style: BorderStyle.SINGLE, size: 4, color: border },
      right: { style: BorderStyle.SINGLE, size: 4, color: border },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: border },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: border },
    },
  });
}

export async function exportDocx(
  theme: AppTheme,
  onProgress?: (pct: number, label: string) => void,
): Promise<void> {
  const source = document.getElementById('markdown-source');
  if (!source) return;

  const blocks = Array.from(source.children).filter(
    el => (el as HTMLElement).textContent?.trim() !== 'Generated Diagram',
  );
  const children: any[] = [];
  for (let i = 0; i < blocks.length; i++) {
    onProgress?.(Math.round((i / blocks.length) * 90), `Converting content ${i + 1}/${blocks.length}…`);
    children.push(...await blockToDocx(blocks[i] as HTMLElement, theme));
    await new Promise(r => setTimeout(r)); // yield so the progress bar can paint
  }
  onProgress?.(95, 'Packaging document…');

  const academic = isAcademic(theme);
  // Academic margins (twips): left 1.5in=2160, right/top/bottom 1in=1440.
  const section: any = { children };
  if (academic) {
    section.properties = { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 2160 } } };
    section.footers = {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: 24 })],
        })],
      }),
    };
  }

  const doc = new Document({
    // Carry the theme background so dark themes (light text) stay readable in Word,
    // matching the on-screen preview instead of light-on-white.
    background: { color: hex(theme.colors.background) },
    numbering: {
      config: [{
        reference: 'num',
        levels: Array.from({ length: 5 }, (_, l) => ({
          level: l, format: 'decimal' as any, text: `%${l + 1}.`, alignment: AlignmentType.START,
        })),
      }],
    },
    sections: [section],
  });

  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'document.docx';
  a.click();
  URL.revokeObjectURL(a.href);
  onProgress?.(100, 'Done');
}
