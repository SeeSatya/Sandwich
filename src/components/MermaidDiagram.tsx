
import React, { useEffect, useState } from 'react';
import mermaid, { type MermaidConfig } from 'mermaid';
import { AppTheme } from '../types';
import { getDiagramEdgeColor } from '../diagrams/colors';
import { sanitizeDiagramSvg } from '../diagrams/svg';

// Mermaid uses global configuration; initialization and drawing form one job.
let renderQueue: Promise<void> = Promise.resolve();
let nextRenderId = 0;

interface MermaidDiagramProps {
  chart: string;
  theme: AppTheme;
}

const diagramConfig = (theme: AppTheme) => {
  const edgeColor = getDiagramEdgeColor(theme.isDark);
    // Generate a colorful mermaid theme configuration with proper text contrast
    // Use theme-aware text colors
    const textColor = theme.isDark ? '#f8fafc' : '#1f2937';
    const bgColor = theme.isDark ? theme.colors.codeBackground : '#f8fafc';

    // Distinct categorical palette so pie/multi-series slices don't collapse into
    // near-white tints (mermaid only auto-derives from a single primaryColor).
    const palette = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#eab308'];
    const pieVars = Object.fromEntries(palette.map((c, i) => [`pie${i + 1}`, c]));
    // Journey/timeline sections use the cScale* fills + cScaleLabel* text. Defaults
    // give light-on-light (invisible section titles), so set distinct fills with a
    // contrasting label color per section.
    const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
    const scaleVars = Object.fromEntries(palette.flatMap((c, i) => [
      [`cScale${i}`, c],
      [`cScaleLabel${i}`, lum(c) < 140 ? '#ffffff' : '#1f2937'],
    ]));

    const config: MermaidConfig = {
      startOnLoad: false,
      theme: 'base' as const,
      themeCSS: '.nodeLabel { font-weight: 500; } .flowchart-link { stroke-linecap: round; stroke-linejoin: round; }',
      themeVariables: {
        darkMode: theme.isDark,
        ...pieVars,
        ...scaleVars,
        pieStrokeColor: theme.isDark ? '#0f172a' : '#ffffff',
        pieOuterStrokeColor: theme.isDark ? '#0f172a' : '#334155',
        // Primary node styling
        primaryColor: theme.colors.codeBackground || bgColor,
        primaryTextColor: textColor,
        primaryBorderColor: theme.colors.primary,

        // Secondary elements
        secondaryColor: theme.colors.codeBackground,
        secondaryTextColor: textColor,
        secondaryBorderColor: theme.colors.secondary,

        // Tertiary elements
        tertiaryColor: bgColor,
        tertiaryTextColor: textColor,
        tertiaryBorderColor: theme.colors.border || '#e5e7eb',

        // Line and edge styling
        lineColor: edgeColor,
        edgeLabelBackground: theme.isDark ? theme.colors.background : '#ffffff',

        // Node backgrounds
        mainBkg: theme.colors.codeBackground || bgColor,
        nodeBkg: theme.colors.codeBackground || bgColor,
        nodeBorder: theme.colors.primary,
        rowOdd: theme.colors.codeBackground || bgColor,
        rowEven: bgColor,

        // Cluster styling
        clusterBkg: theme.colors.codeBackground || bgColor,
        clusterBorder: theme.colors.border || '#e5e7eb',

        // Text colors
        titleColor: theme.colors.heading,
        nodeTextColor: textColor,
        textColor: textColor,

        // Font
        fontFamily: theme.fonts.body,
        fontSize: '16px',

        // xychart-beta: needs its own namespace, otherwise lines/axes fall
        // back to defaults that can be invisible on dark/custom themes
        xyChart: {
          backgroundColor: 'transparent',
          titleColor: theme.colors.heading,
          xAxisLabelColor: textColor,
          xAxisTitleColor: textColor,
          xAxisTickColor: textColor,
          xAxisLineColor: edgeColor,
          yAxisLabelColor: textColor,
          yAxisTitleColor: textColor,
          yAxisTickColor: textColor,
          yAxisLineColor: edgeColor,
          plotColorPalette: palette.join(','),
        },

        // Note styling
        noteBkgColor: theme.isDark ? theme.colors.codeBackground : '#fefce8',
        noteTextColor: textColor,
        noteBorderColor: theme.isDark ? theme.colors.border : '#fcd34d',

        // Default node color
        default: {
          fill: theme.colors.codeBackground || bgColor,
          stroke: theme.colors.primary,
          textColor: textColor
        }
      },
      securityLevel: 'strict' as const,
      flowchart: {
        htmlLabels: true,
        useMaxWidth: true,
        nodeSpacing: 10,
        rankSpacing: 36,
        padding: 6,
        wrappingWidth: 100,
        curve: 'basis' as const
      },
      sequence: {
        useMaxWidth: true,
        mirrorActors: false
      },
      class: {
        useMaxWidth: true
      },
      state: {
        useMaxWidth: true
      },
      er: {
        useMaxWidth: true
      },
      pie: {
        useMaxWidth: true
      },
      xyChart: {
        useMaxWidth: true
      }
    };
  return config;
};

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart, theme }) => {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [renderedInput, setRenderedInput] = useState<{ chart: string; theme: AppTheme } | null>(null);
  const pending = loading || renderedInput?.chart !== chart || renderedInput?.theme !== theme;

  useEffect(() => {
    let active = true;
    setSvg('');
    setError(null);
    setLoading(true);
    const renderChart = async () => {
      if (!active) return;
      if (!chart.trim()) {
        setRenderedInput({ chart, theme });
        setLoading(false);
        return;
      }
      const id = `mermaid-${++nextRenderId}`;
      const host = document.createElement('div');
      host.className = 'mermaid-container mermaid-measurement-host';
      Object.assign(host.style, { position: 'fixed', left: '0', top: '0', opacity: '0', pointerEvents: 'none', zIndex: '-1', width: '800px', margin: '0', padding: '0' });
      document.body.appendChild(host);
      try {
        await Promise.race([
          document.fonts?.ready ?? Promise.resolve(),
          new Promise<void>(resolve => setTimeout(resolve, 1500)),
        ]);
        if (!active) return;
        mermaid.initialize(diagramConfig(theme));
        // Render the original first so labels, shapes and edges keep their
        // meaning. Retain the existing wrapped-edge leniency only as a retry.
        const original = chart.trim();
        let result;
        try { result = await mermaid.render(id, original, host); }
        catch (originalError) {
          const wrapped = /^(flowchart|graph)\b/.test(original)
            ? original.replace(/\n[ \t]*((?:--+|==+|-\.|<--|<==|--[ox])[^\n]*)/g, ' $1')
            : original;
          if (wrapped === original) throw originalError;
          host.replaceChildren();
          result = await mermaid.render(`${id}-retry`, wrapped, host);
        }
        const clean = sanitizeDiagramSvg(result.svg);
        if (active) setSvg(clean);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to render this diagram.');
      } finally {
        host.remove();
        if (active) {
          setRenderedInput({ chart, theme });
          setLoading(false);
        }
      }
    };
    renderQueue = renderQueue.then(renderChart, renderChart);
    // Mermaid may still be measuring an in-flight job. Only that job's finally
    // removes its host; cancellation discards its result without removing DOM.
    return () => { active = false; };
  }, [chart, theme]);

  return <div className="mermaid-container my-6 w-full overflow-hidden p-4 rounded-2xl"
    data-diagram-state={pending ? 'rendering' : error ? 'error' : 'ready'}
    style={{ backgroundColor: theme.colors.codeBackground, border: `1px solid ${theme.colors.border || theme.colors.secondary}`, color: theme.colors.text }}>
    {pending ? <p role="status">Rendering diagram…</p> : error ? <div role="alert">
      <p>Unable to render this Mermaid diagram. Check its source syntax.</p>
      <details><summary>Diagram source and error</summary><pre className="whitespace-pre-wrap">{chart}</pre><pre className="whitespace-pre-wrap">{error}</pre></details>
    </div> : <div className="diagram-svg-surface" dangerouslySetInnerHTML={{ __html: svg }} />}
  </div>;
};

export default MermaidDiagram;
