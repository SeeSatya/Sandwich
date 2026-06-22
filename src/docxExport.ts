import {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink, ImageRun,
  Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel, AlignmentType,
} from 'docx';
import { AppTheme } from './types';

// Max content width on an A4 page (~6.5in @ 96dpi) so wide images/diagrams don't overflow.
const MAX_W = 620;

const hex = (c: string) => (c || '').replace('#', '').slice(0, 6) || '000000';

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
interface RunBase { font?: string; color?: string; bold?: boolean }
function inlineRuns(node: Node, theme: AppTheme, base: RunBase = {}, fmt: { b?: boolean; i?: boolean; code?: boolean } = {}): (TextRun | ExternalHyperlink)[] {
  const out: (TextRun | ExternalHyperlink)[] = [];
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text) out.push(new TextRun({
        text,
        bold: fmt.b || base.bold,
        italics: fmt.i,
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
    const svgStr = new XMLSerializer().serializeToString(svg);
    const png = await svgToPng(svg as SVGSVGElement, w, h);
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

  if (/^H[1-6]$/.test(tag)) {
    return [new Paragraph({
      heading: HeadingLevel[`HEADING_${tag[1]}` as keyof typeof HeadingLevel],
      spacing: { before: 240, after: 120 },
      children: inlineRuns(el, theme, { font: headFont, color: hex(theme.colors.heading), bold: true }),
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
      spacing: { after: 160, line: 276 },
      indent: tag === 'BLOCKQUOTE' ? { left: 480 } : undefined,
      border: tag === 'BLOCKQUOTE' ? { left: { style: BorderStyle.SINGLE, size: 18, color: hex(theme.colors.primary), space: 12 } } : undefined,
      children: inlineRuns(el, theme, { font: bodyFont, color: hex(theme.colors.text) }),
    })];
  }

  if (tag === 'UL' || tag === 'OL') return listToDocx(el, theme, tag === 'OL', 0);

  if (tag === 'PRE' || el.querySelector('pre') || el.classList.contains('code-block-wrapper')) {
    const codeFont = theme.fonts.code.replace(/['"]/g, '').split(',')[0].trim();
    const lines = (el.textContent || '').replace(/\s+$/, '').split('\n');
    return lines.map((ln, i) => new Paragraph({
      spacing: { after: i === lines.length - 1 ? 160 : 0, line: 240 },
      shading: { fill: hex(theme.colors.codeBackground) },
      children: [new TextRun({ text: ln || ' ', font: codeFont, size: 18, color: hex(theme.colors.text) })],
    }));
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
  const out: Paragraph[] = [];
  Array.from(list.children).forEach(li => {
    if (li.tagName.toUpperCase() !== 'LI') return;
    const nested = Array.from(li.children).filter(c => /^(UL|OL)$/.test(c.tagName.toUpperCase())) as HTMLElement[];
    // inline content of the li, excluding nested lists
    const tmp = li.cloneNode(true) as HTMLElement;
    tmp.querySelectorAll('ul,ol').forEach(n => n.remove());
    out.push(new Paragraph({
      spacing: { after: 80 },
      ...(ordered ? { numbering: { reference: 'num', level } } : { bullet: { level } }),
      children: inlineRuns(tmp, theme, { font: bodyFont, color: hex(theme.colors.text) }),
    }));
    nested.forEach(n => out.push(...listToDocx(n, theme, n.tagName.toUpperCase() === 'OL', level + 1)));
  });
  return out;
}

function tableToDocx(table: HTMLElement, theme: AppTheme): Table {
  const bodyFont = theme.fonts.body.replace(/['"]/g, '').split(',')[0].trim();
  const border = hex(theme.colors.border || theme.colors.secondary);
  const rows = Array.from(table.querySelectorAll('tr')).map((tr, ri) => new TableRow({
    children: Array.from(tr.children).map(cell => {
      const isHead = cell.tagName.toUpperCase() === 'TH';
      return new TableCell({
        shading: isHead ? { fill: hex(theme.colors.primary) + '' } : undefined,
        children: [new Paragraph({
          children: inlineRuns(cell as HTMLElement, theme, { font: bodyFont, color: hex(theme.colors.text), bold: isHead }),
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

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'num',
        levels: Array.from({ length: 5 }, (_, l) => ({
          level: l, format: 'decimal' as any, text: `%${l + 1}.`, alignment: AlignmentType.START,
        })),
      }],
    },
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'document.docx';
  a.click();
  URL.revokeObjectURL(a.href);
  onProgress?.(100, 'Done');
}
