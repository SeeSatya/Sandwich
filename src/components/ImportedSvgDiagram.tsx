import React, { useMemo } from 'react';
import { AppTheme } from '../types';
import { decodeSvg, sanitizeDiagramSvg } from '../diagrams/svg';

const ImportedSvgDiagram: React.FC<{ encodedSvg: string; theme: AppTheme }> = ({ encodedSvg, theme }) => {
  const result = useMemo(() => {
    try { return { svg: sanitizeDiagramSvg(decodeSvg(encodedSvg)) }; }
    catch { return { error: 'Unable to read this copied diagram.' }; }
  }, [encodedSvg]);
  return <div className="mermaid-container my-6 w-full overflow-hidden p-4 rounded-2xl"
    data-diagram-state={result.error ? 'error' : 'ready'}
    style={{ backgroundColor: theme.colors.codeBackground, border: `1px solid ${theme.colors.border}`, color: theme.colors.text }}>
    {result.error ? <p role="alert">{result.error}</p> : <div className="diagram-svg-surface" dangerouslySetInnerHTML={{ __html: result.svg! }} />}
  </div>;
};

export default ImportedSvgDiagram;
