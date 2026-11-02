import React, { useMemo } from 'react';
import { AppTheme } from '../types';
import { decodeSvg, sanitizeDiagramSvg } from '../diagrams/svg';

const ImportedDiagram: React.FC<{ source: string; encoded?: boolean; theme: AppTheme }> = ({ source, encoded = false, theme }) => {
  const result = useMemo(() => {
    try { return { svg: sanitizeDiagramSvg(encoded ? decodeSvg(source) : source), error: false }; }
    catch { return { svg: '', error: true }; }
  }, [source, encoded]);
  return <div className="mermaid-container imported-diagram my-6 w-full overflow-hidden rounded-2xl p-4"
    style={{ backgroundColor: theme.colors.codeBackground, border: `1px solid ${theme.colors.border || theme.colors.secondary}` }}>
    {result.error ? <p role="alert">This diagram could not be imported. Paste its Mermaid source or copy the original diagram again.</p>
      : <div className="diagram-svg-surface" dangerouslySetInnerHTML={{ __html: result.svg }} />}
  </div>;
};

export default ImportedDiagram;
