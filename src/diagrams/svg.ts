import DOMPurify from 'dompurify';

export const encodeSvg = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

export const decodeSvg = (value: string): string =>
  new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(value.trim()), (char) => char.charCodeAt(0)));

let svgId = 0;
const isEmbeddedImage = (value: string): boolean => /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/\s]+={0,2}$/i.test(value);
const cssUnescape = (value: string): string => value.replace(/\\([\da-f]{1,6})\s?|\\([^\r\n])/gi,
  (_match, hex: string, char: string) => hex ? String.fromCodePoint(parseInt(hex, 16) || 0xfffd) : char);
const hasExternalReference = (value: string): boolean => {
  const decoded = cssUnescape(value).replace(/\/\*[^]*?\*\//g, '');
  return /(?:@import|expression\s*\(|javascript:|https?:|\/\/)/i.test(decoded)
    || Array.from(decoded.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)).some((match) => !match[2].trim().startsWith('#'));
};

/** A single import boundary for source-generated, encoded, and raw SVG diagrams. */
export const sanitizeDiagramSvg = (markup: string): string => {
  const clean = DOMPurify.sanitize(markup, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    // Mermaid measures labels as XHTML inside SVG foreignObject. DOMPurify
    // otherwise rejects that namespace transition and leaves empty boxes.
    HTML_INTEGRATION_POINTS: { foreignobject: true, 'annotation-xml': true },
    ADD_TAGS: ['foreignObject', 'style'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'audio', 'video', 'animate', 'animateMotion', 'animateTransform', 'set'],
    FORBID_ATTR: ['srcset', 'formaction', 'action'],
  });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  const svg = doc.querySelector('svg');
  if (!svg) throw new Error('Missing SVG diagram.');
  const prefix = `diagram-${++svgId}`;
  const ids = new Map<string, string>();
  const nodes = [svg, ...Array.from(svg.querySelectorAll('*'))];
  nodes.forEach((node, index) => {
    if (node.id) ids.set(node.id, `${prefix}-${index}`);
  });
  const originalRoot = svg.id;
  nodes.forEach((node) => { if (node.id) node.id = ids.get(node.id)!; });
  if (!originalRoot) svg.id = prefix;
  const rootSelector = `#${svg.id}`;
  const rewriteUrls = (value: string): string => value.replace(/url\(\s*(['"]?)#([^\s()'"]+)\1\s*\)/g,
    (_match, quote: string, id: string) => `url(${quote}#${ids.get(id) ?? id}${quote})`);
  const rewriteSelector = (selector: string): string => {
    let rewritten = selector;
    ids.forEach((newId, oldId) => {
      rewritten = rewritten.replace(new RegExp(`#${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g'), `#${newId}`);
    });
    return rewritten.split(',').map((part) => {
      const trimmed = part.trim().replace(/:root\b/g, rootSelector);
      return trimmed.startsWith(rootSelector) ? trimmed : `${rootSelector} ${trimmed}`;
    }).join(',');
  };
  const cleanDeclarations = (style: CSSStyleDeclaration): string => {
    Array.from(style).forEach((property) => {
      const value = style.getPropertyValue(property);
      if (hasExternalReference(value) || /^(?:position|z-index|behavior|-moz-binding)$/i.test(property)) style.removeProperty(property);
      else if (/^animation(?:-name)?$/.test(property)) style.removeProperty(property);
      else style.setProperty(property, rewriteUrls(cssUnescape(value)), style.getPropertyPriority(property));
    });
    return style.cssText;
  };
  nodes.forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name === 'id') return;
      if (name === 'style') {
        const declaration = doc.createElement('span').style;
        declaration.cssText = attribute.value;
        node.setAttribute('style', cleanDeclarations(declaration));
      } else if (name.startsWith('on') || (name === 'src' && !isEmbeddedImage(attribute.value)) ||
        (name.endsWith('href') && !attribute.value.trim().startsWith('#') && !isEmbeddedImage(attribute.value)) ||
        (!isEmbeddedImage(attribute.value) && hasExternalReference(attribute.value))) {
        node.removeAttribute(attribute.name);
      } else if (name.endsWith('href') && attribute.value.startsWith('#')) {
        node.setAttribute(attribute.name, `#${ids.get(attribute.value.slice(1)) ?? attribute.value.slice(1)}`);
      } else if (name === 'aria-labelledby' || name === 'aria-describedby') {
        node.setAttribute(attribute.name, attribute.value.split(/\s+/).map((id) => ids.get(id) ?? id).join(' '));
      } else node.setAttribute(attribute.name, rewriteUrls(attribute.value));
    });
  });
  svg.querySelectorAll('image, img').forEach((node) => {
    if (!Array.from(node.attributes).some((attribute) => /^(?:src|href|xlink:href)$/.test(attribute.name) && isEmbeddedImage(attribute.value))) node.remove();
  });
  if (!svg.querySelector('path, line, polygon, polyline, rect, circle, ellipse, text, image')) throw new Error('Missing SVG diagram geometry.');
  svg.querySelectorAll('style').forEach((style) => {
    const sheet = new CSSStyleSheet();
    try { sheet.replaceSync(style.textContent || ''); } catch { style.remove(); return; }
    style.textContent = Array.from(sheet.cssRules).flatMap((rule) => {
      if (rule.type !== CSSRule.STYLE_RULE) return [];
      const cssRule = rule as CSSStyleRule;
      const declarations = cleanDeclarations(cssRule.style);
      return declarations ? [`${rewriteSelector(cssRule.selectorText)} {${declarations}}`] : [];
    }).join('\n');
  });
  if (!svg.hasAttribute('viewBox')) {
    const width = parseFloat(svg.getAttribute('width') || '');
    const height = parseFloat(svg.getAttribute('height') || '');
    if (width > 0 && height > 0 && !svg.getAttribute('width')?.includes('%') && !svg.getAttribute('height')?.includes('%')) {
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
  }
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  if (!svg.hasAttribute('aria-label') && !svg.hasAttribute('aria-labelledby')) svg.setAttribute('aria-label', svg.querySelector('title')?.textContent || 'Imported diagram');
  // Root dimensions belong to the responsive wrapper, not the copied viewport.
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  const rootStyle = (svg as SVGSVGElement).style;
  ['width', 'height', 'max-width', 'max-height', 'min-width', 'min-height'].forEach((property) => rootStyle.removeProperty(property));
  // Keep narrow charts at their measured size; enlarging them to page width
  // creates unnecessarily tall drawings and forces pagination to shrink them.
  const naturalWidth = Number(svg.getAttribute('viewBox')?.split(/[\s,]+/)[2]);
  if (naturalWidth > 0) rootStyle.maxWidth = `${naturalWidth}px`;
  if (!rootStyle.cssText) svg.removeAttribute('style');
  return new XMLSerializer().serializeToString(svg);
};
