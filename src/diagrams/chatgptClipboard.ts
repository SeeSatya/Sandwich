import { getDiagramEdgeColor } from './colors';

const encodeBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

/**
 * Prefer the diagram source/real SVG from rich clipboard HTML. ChatGPT's
 * text/plain clipboard representation can contain only CSS and flattened
 * labels, which cannot preserve the diagram's original connections.
 */
export const getChatGptDiagramPaste = (html: string, isDark: boolean): string | null => {
  if (!html || typeof DOMParser === 'undefined') return null;

  const document = new DOMParser().parseFromString(html, 'text/html');
  const sourceElement = Array.from(document.querySelectorAll('[data-mermaid-source]'))
    .find((element) => element.getAttribute('data-mermaid-source')?.trim());
  const source = sourceElement?.getAttribute('data-mermaid-source')?.trim();
  if (source) return `\`\`\`mermaid\n${source}\n\`\`\``;

  const svg = document.querySelector('svg[id^="chatgpt-mermaid-"]')
    || document.querySelector('[id^="chatgpt-mermaid-"] svg');
  if (!(svg instanceof SVGElement) || !svg.querySelector('path, line, polygon, polyline, rect, circle, ellipse')) {
    return null;
  }

  // Make clipboard SVG safe to embed as an image, while keeping Mermaid's
  // foreignObject labels and scoped styles intact.
  svg.querySelectorAll('script, iframe, object, embed').forEach((element) => element.remove());
  const elements = [svg, ...Array.from(svg.querySelectorAll('*'))];
  elements.forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) element.removeAttribute(attribute.name);
      else if ((name === 'href' || name.endsWith(':href')) && !value.startsWith('#')) element.removeAttribute(attribute.name);
      else if (name === 'src') element.removeAttribute(attribute.name);
      else if (name === 'style' && /url\((?!\s*['"]?#)[^)]+\)|expression\s*\(|javascript:/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  svg.querySelectorAll('style').forEach((style) => {
    style.textContent = (style.textContent || '')
      .replace(/@import[^;]+;?/gi, '')
      .replace(/url\((?!\s*['"]?#)[^)]+\)/gi, 'none')
      .replace(/expression\s*\([^)]*\)/gi, 'none')
      .replace(/javascript:/gi, '');
  });

  const edgeColor = getDiagramEdgeColor(isDark);
  const svgMarkup = new XMLSerializer().serializeToString(svg)
    .replace(/rgb\(\s*175\s*,\s*175\s*,\s*175\s*\)/gi, edgeColor);

  return `\`\`\`chatgpt-svg\n${encodeBase64(svgMarkup)}\n\`\`\``;
};
