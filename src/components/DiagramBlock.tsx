import React from 'react';
import { AppTheme } from '../types';
import { parseAndValidateDiagram } from '../diagrams';
import DiagramRenderer from './DiagramRenderer';

interface DiagramBlockProps {
  source: string;
  theme: AppTheme;
}

const DiagramBlock: React.FC<DiagramBlockProps> = ({ source, theme }) => {
  const { diagram, errors } = parseAndValidateDiagram(source);

  if (!diagram) {
    return (
      <div
        className="diagram-container diagram-error my-8 rounded-2xl p-5"
        style={{
          backgroundColor: theme.isDark ? 'rgba(127, 29, 29, 0.28)' : '#fef2f2',
          border: `1px solid ${theme.isDark ? 'rgba(248, 113, 113, 0.38)' : '#fecaca'}`,
          color: theme.isDark ? '#fecaca' : '#991b1b',
        }}
      >
        <div className="text-[10px] font-black uppercase tracking-widest mb-2">
          Diagram JSON Error
        </div>
        <ul className="text-xs font-semibold mb-4 pl-4 list-disc">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
        <pre
          className="max-h-48 overflow-auto rounded-xl p-3 text-[11px]"
          style={{
            backgroundColor: theme.isDark ? 'rgba(0, 0, 0, 0.25)' : '#fff',
            color: 'inherit',
            border: `1px solid ${theme.isDark ? 'rgba(248, 113, 113, 0.24)' : '#fee2e2'}`,
          }}
        >
          {source}
        </pre>
      </div>
    );
  }

  return (
    <div
      className="diagram-container my-8 rounded-2xl p-6"
      style={{
        backgroundColor: theme.isDark ? `${theme.colors.codeBackground}80` : `${theme.colors.codeBackground}`,
        border: `1px solid ${theme.colors.border || theme.colors.primary}`,
        color: theme.colors.text,
      }}
    >
      <div
        className="text-[10px] font-black uppercase tracking-widest mb-3"
        style={{ color: theme.colors.secondary }}
      >
        Diagram
      </div>
      <DiagramRenderer data={diagram} theme={theme} />
    </div>
  );
};

export default DiagramBlock;
