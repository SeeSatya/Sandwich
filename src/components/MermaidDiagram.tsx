
import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { AppTheme } from '../types';
import { getDiagramEdgeColor } from '../diagrams/colors';

interface MermaidDiagramProps {
  chart: string;
  theme: AppTheme;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart, theme }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const edgeColor = getDiagramEdgeColor(theme.isDark);

  useEffect(() => {
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

    const config = {
      startOnLoad: false,
      theme: 'base' as const,
      themeVariables: {
        ...pieVars,
        ...scaleVars,
        pieStrokeColor: theme.isDark ? '#0f172a' : '#ffffff',
        pieOuterStrokeColor: theme.isDark ? '#0f172a' : '#334155',
        // Primary node styling
        primaryColor: theme.colors.primary,
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

        // Cluster styling
        clusterBkg: theme.colors.codeBackground || bgColor,
        clusterBorder: theme.colors.border || '#e5e7eb',

        // Text colors
        titleColor: theme.colors.heading,
        nodeTextColor: textColor,
        textColor: textColor,

        // Font
        fontFamily: theme.fonts.body,
        fontSize: '14px',

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
      securityLevel: 'loose' as const,
      flowchart: {
        htmlLabels: true,
        useMaxWidth: true,
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
    mermaid.initialize(config);
  }, [theme]);

  useEffect(() => {
    let active = true;
    let renderId: string | null = null;

    const isolateMeasurementHost = (id: string) => {
      // Mermaid creates a temporary `d${id}` element directly under <body> to
      // measure the SVG. Leaving it in normal flow adds ~150px to document
      // height and makes the browser scrollbar repeatedly appear/disappear.
      const host = document.getElementById(`d${id}`) as HTMLElement | null;
      if (!host) return;
      host.style.setProperty('position', 'fixed', 'important');
      // Keep the host in the viewport so Mermaid can measure HTML labels in
      // its foreignObjects. `visibility:hidden` / moving it offscreen makes
      // those labels measure as 0×0 in some browsers. Opacity hides the host
      // visually while fixed positioning keeps it out of document flow.
      host.style.setProperty('left', '0', 'important');
      host.style.setProperty('top', '0', 'important');
      host.style.setProperty('opacity', '0', 'important');
      host.style.setProperty('pointer-events', 'none', 'important');
      host.style.setProperty('z-index', '-1', 'important');
    };

    const removeMeasurementHost = () => {
      if (renderId) document.getElementById(`d${renderId}`)?.remove();
    };

    const renderChart = async () => {
      if (!chart) return;

      try {
        // Preprocess chart to fix common issues
        let processedChart = chart
          .trim()
          // Fix HTML entities that might have been escaped
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"');

        // Leniency: flowcharts require each edge on one line, but users often wrap
        // a long edge (node on one line, `--> target` on the next). Join a line
        // that begins with an edge operator back onto the previous line.
        if (/^\s*(flowchart|graph)\b/.test(processedChart)) {
          processedChart = processedChart.replace(/\n[ \t]*((?:--+|==+|-\.|<--|<==|--[ox])[^\n]*)/g, ' $1');
        }

        renderId = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const renderPromise = mermaid.render(renderId, processedChart);
        isolateMeasurementHost(renderId);
        let { svg } = await renderPromise;

        // Some chart types (xychart) emit fixed width/height without a
        // viewBox, so CSS can only crop them, never scale them. Add the
        // viewBox so the svg scales like an image.
        if (!/viewBox=/.test(svg)) {
          const m = /<svg[^>]*?width="([\d.]+)(?:px)?"[^>]*?height="([\d.]+)(?:px)?"/.exec(svg);
          if (m) svg = svg.replace('<svg', `<svg viewBox="0 0 ${m[1]} ${m[2]}"`);
        }

        if (active) {
          setSvg(svg);
          setError(null);
        }
      } catch (err) {
        if (active) {
          console.error("Mermaid Render Error:", err);
          setError("Diagram Syntax Error");
        }
      } finally {
        removeMeasurementHost();
      }
    };

    renderChart();

    return () => {
      active = false;
      removeMeasurementHost();
    };
  }, [chart, theme]);

  if (error) {
    return (
      <div
        className="p-6 rounded-2xl text-xs font-mono my-6 print:hidden"
        style={{
          backgroundColor: theme.isDark ? 'rgba(127, 29, 29, 0.3)' : '#fef2f2',
          border: `1px solid ${theme.isDark ? 'rgba(239, 68, 68, 0.3)' : '#fecaca'}`,
          color: theme.isDark ? '#fca5a5' : '#dc2626'
        }}
      >
        <p className="font-black uppercase tracking-widest mb-2">Mermaid Syntax Error</p>
        <pre className="opacity-70" style={{ color: 'inherit' }}>{chart}</pre>
      </div>
    );
  }

  return (
    <div
      className="mermaid-container my-6 flex flex-col items-center w-full overflow-hidden p-4 rounded-3xl shadow-inner"
      style={{
        backgroundColor: theme.isDark ? `${theme.colors.codeBackground}80` : 'rgba(248, 250, 252, 0.5)',
        border: `1px solid ${theme.isDark ? theme.colors.border : '#f1f5f9'}`
      }}
    >
      <div
        className="w-full max-w-full"
        style={{ width: '100%' }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <style>{`
        .mermaid-container svg {
          width: 100% !important;
          max-width: 100% !important;
          max-height: 680px !important;
          height: auto !important;
        }
      `}</style>
    </div>
  );
};

export default MermaidDiagram;
