export const diagramViewBoxSize = (viewBox: string | null): { width: number; height: number } | null => {
  const values = viewBox?.trim().split(/[\s,]+/).map(Number);
  if (!values || values.length !== 4 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) return null;
  return { width: values[2], height: values[3] };
};

/** Fit the complete drawing, without enlarging it or changing its proportions. */
export const fitDiagramSize = (width: number, height: number, maxWidth = Infinity): { width: number; height: number } => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || Number.isNaN(maxWidth) || maxWidth <= 0) {
    return { width: 0, height: 0 };
  }
  const ratio = height / width;
  // Square and wide diagrams stay compact. Vertical flows get progressively
  // more room, up to 720px, instead of expanding to fill a whole A4 page.
  const maxHeight = Math.min(720, 400 + Math.max(0, ratio - 1) * 80);
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
};
