import React from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import {
  DiagramDefinition,
  DiagramNode,
  DiagramShape,
  getDiagramKindStyle,
  getDiagramTypeDefaults,
} from '../diagrams';
import { AppTheme } from '../types';
import { getDiagramEdgeColor } from '../diagrams/colors';

interface DiagramRendererProps {
  data: DiagramDefinition;
  theme: AppTheme;
}

interface PositionedNode extends DiagramNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PADDING = 32;
const TITLE_HEIGHT = 44;
const FALLBACK_WIDTH = 520;
const FALLBACK_HEIGHT = 240;

const elk = new ELK();

const getNodeRadius = (shape: DiagramShape) => {
  if (shape === 'pill') return 999;
  if (shape === 'chip' || shape === 'pin') return 6;
  return 12;
};

const getNodeColors = (kind: DiagramNode['kind'] | undefined, theme: AppTheme) => {
  const background = theme.isDark ? theme.colors.codeBackground : '#ffffff';
  const softPrimary = `${theme.colors.primary}22`;
  const softSecondary = `${theme.colors.secondary}1f`;
  const style = getDiagramKindStyle(kind);

  switch (style.accent) {
    case 'success':
      return { fill: '#16a34a', stroke: '#15803d', text: '#ffffff' };
    case 'danger':
      return { fill: '#dc2626', stroke: '#b91c1c', text: '#ffffff' };
    case 'warning':
      return { fill: theme.isDark ? '#422006' : '#fef3c7', stroke: '#d97706', text: theme.isDark ? '#fde68a' : '#78350f' };
    case 'secondary':
      return { fill: softSecondary, stroke: theme.colors.secondary, text: theme.colors.text };
    case 'neutral':
      return { fill: theme.isDark ? '#1f2937' : '#f8fafc', stroke: theme.colors.border || theme.colors.secondary, text: theme.colors.text };
    case 'primary':
    default:
      return { fill: softPrimary || background, stroke: theme.colors.primary, text: theme.colors.text };
  }
};

const truncateLabel = (label: string) => {
  return label.length > 26 ? `${label.slice(0, 23)}...` : label;
};

const createFallbackLayout = (data: DiagramDefinition) => {
  const defaults = getDiagramTypeDefaults(data.type);
  const nodes = data.nodes.map((node, index) => ({
    ...node,
    width: defaults.nodeWidth,
    height: defaults.nodeHeight,
    x: PADDING,
    y: PADDING + TITLE_HEIGHT + index * (defaults.nodeHeight + defaults.nodeSpacing),
  }));

  return {
    nodes,
    width: FALLBACK_WIDTH,
    height: Math.max(FALLBACK_HEIGHT, PADDING * 2 + TITLE_HEIGHT + data.nodes.length * (defaults.nodeHeight + defaults.nodeSpacing)),
  };
};

const layoutWithElk = async (data: DiagramDefinition) => {
  const defaults = getDiagramTypeDefaults(data.type);
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': defaults.direction,
      'elk.spacing.nodeNode': String(defaults.nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(defaults.layerSpacing),
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: data.nodes.map((node) => ({
      id: node.id,
      width: defaults.nodeWidth,
      height: defaults.nodeHeight,
    })),
    edges: data.edges.map((edge, index) => ({
      id: `edge-${index}`,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const result = await elk.layout(graph);
  const nodeMap = new Map(data.nodes.map((node) => [node.id, node]));
  const nodes = (result.children || []).map((node) => ({
    ...nodeMap.get(node.id)!,
    width: node.width || defaults.nodeWidth,
    height: node.height || defaults.nodeHeight,
    x: (node.x || 0) + PADDING,
    y: (node.y || 0) + PADDING + TITLE_HEIGHT,
  }));

  return {
    nodes,
    width: Math.max(FALLBACK_WIDTH, (result.width || 0) + PADDING * 2),
    height: Math.max(FALLBACK_HEIGHT, (result.height || 0) + PADDING * 2 + TITLE_HEIGHT),
  };
};

const getEdgeAnchors = (source: PositionedNode, target: PositionedNode) => {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const horizontal = Math.abs(dx) > Math.abs(dy);

  if (horizontal) {
    return {
      x1: dx >= 0 ? source.x + source.width : source.x,
      y1: source.y + source.height / 2,
      x2: dx >= 0 ? target.x : target.x + target.width,
      y2: target.y + target.height / 2,
    };
  }

  return {
    x1: source.x + source.width / 2,
    y1: dy >= 0 ? source.y + source.height : source.y,
    x2: target.x + target.width / 2,
    y2: dy >= 0 ? target.y : target.y + target.height,
  };
};

const renderNodeShape = (
  node: PositionedNode,
  shape: DiagramShape,
  colors: ReturnType<typeof getNodeColors>,
  theme: AppTheme
) => {
  const common = {
    fill: colors.fill,
    stroke: colors.stroke,
    strokeWidth: 2,
  };

  if (shape === 'diamond') {
    const points = [
      `${node.x + node.width / 2},${node.y}`,
      `${node.x + node.width},${node.y + node.height / 2}`,
      `${node.x + node.width / 2},${node.y + node.height}`,
      `${node.x},${node.y + node.height / 2}`,
    ].join(' ');
    return <polygon points={points} {...common} />;
  }

  if (shape === 'cylinder') {
    return (
      <g>
        <path
          d={`M ${node.x} ${node.y + 10}
              C ${node.x} ${node.y - 3}, ${node.x + node.width} ${node.y - 3}, ${node.x + node.width} ${node.y + 10}
              L ${node.x + node.width} ${node.y + node.height - 10}
              C ${node.x + node.width} ${node.y + node.height + 3}, ${node.x} ${node.y + node.height + 3}, ${node.x} ${node.y + node.height - 10}
              Z`}
          {...common}
        />
        <ellipse
          cx={node.x + node.width / 2}
          cy={node.y + 10}
          rx={node.width / 2}
          ry="12"
          fill="none"
          stroke={colors.stroke}
          strokeWidth="2"
          opacity="0.75"
        />
      </g>
    );
  }

  if (shape === 'cloud') {
    return (
      <path
        d={`M ${node.x + 28} ${node.y + node.height - 12}
            C ${node.x + 10} ${node.y + node.height - 12}, ${node.x + 8} ${node.y + 26}, ${node.x + 30} ${node.y + 24}
            C ${node.x + 34} ${node.y + 5}, ${node.x + 62} ${node.y + 3}, ${node.x + 74} ${node.y + 18}
            C ${node.x + 96} ${node.y + 6}, ${node.x + node.width - 20} ${node.y + 22}, ${node.x + node.width - 30} ${node.y + 40}
            C ${node.x + node.width - 12} ${node.y + 42}, ${node.x + node.width - 18} ${node.y + node.height - 12}, ${node.x + 28} ${node.y + node.height - 12}
            Z`}
        {...common}
      />
    );
  }

  if (shape === 'actor') {
    return (
      <g>
        <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="12" {...common} />
        <circle cx={node.x + 24} cy={node.y + 20} r="7" fill="none" stroke={colors.stroke} strokeWidth="2" />
        <path d={`M ${node.x + 24} ${node.y + 28} L ${node.x + 24} ${node.y + 44} M ${node.x + 14} ${node.y + 34} L ${node.x + 34} ${node.y + 34}`} stroke={colors.stroke} strokeWidth="2" fill="none" />
      </g>
    );
  }

  if (shape === 'chip') {
    const pinColor = theme.isDark ? '#94a3b8' : '#64748b';
    return (
      <g>
        <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="8" {...common} />
        {[0, 1, 2, 3].map((index) => (
          <g key={index}>
            <line x1={node.x - 7} y1={node.y + 14 + index * 10} x2={node.x} y2={node.y + 14 + index * 10} stroke={pinColor} strokeWidth="2" />
            <line x1={node.x + node.width} y1={node.y + 14 + index * 10} x2={node.x + node.width + 7} y2={node.y + 14 + index * 10} stroke={pinColor} strokeWidth="2" />
          </g>
        ))}
      </g>
    );
  }

  if (shape === 'pin') {
    return (
      <path
        d={`M ${node.x + node.width / 2} ${node.y}
            L ${node.x + node.width} ${node.y + node.height * 0.62}
            L ${node.x + node.width * 0.58} ${node.y + node.height * 0.62}
            L ${node.x + node.width / 2} ${node.y + node.height}
            L ${node.x + node.width * 0.42} ${node.y + node.height * 0.62}
            L ${node.x} ${node.y + node.height * 0.62}
            Z`}
        {...common}
      />
    );
  }

  return (
    <rect
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      rx={getNodeRadius(shape)}
      {...common}
    />
  );
};

const DiagramRenderer: React.FC<DiagramRendererProps> = ({ data, theme }) => {
  const fallbackLayout = React.useMemo(() => createFallbackLayout(data), [data]);
  const [layout, setLayout] = React.useState(fallbackLayout);
  const [layoutError, setLayoutError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setLayout(fallbackLayout);
    setLayoutError(null);

    layoutWithElk(data)
      .then((nextLayout) => {
        if (active) {
          setLayout(nextLayout);
        }
      })
      .catch((error) => {
        if (active) {
          setLayoutError(error instanceof Error ? error.message : 'Diagram layout failed.');
          setLayout(fallbackLayout);
        }
      });

    return () => {
      active = false;
    };
  }, [data, fallbackLayout]);

  const nodeMap = React.useMemo(() => {
    return new Map(layout.nodes.map((node) => [node.id, node]));
  }, [layout.nodes]);

  const markerId = React.useId().replace(/:/g, '');
  const edgeColor = getDiagramEdgeColor(theme.isDark);

  return (
    <div className="diagram-svg-renderer w-full overflow-hidden">
      <svg
        role="img"
        aria-label={data.title || `${data.type} diagram`}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width="100%"
        height="auto"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill={edgeColor} />
          </marker>
        </defs>

        <text
          x={PADDING}
          y={PADDING + 4}
          dominantBaseline="hanging"
          fill={theme.colors.heading}
          fontFamily={theme.fonts.heading}
          fontSize="20"
          fontWeight="800"
        >
          {data.title || 'Untitled Diagram'}
        </text>
        <text
          x={PADDING}
          y={PADDING + 30}
          dominantBaseline="hanging"
          fill={theme.colors.secondary}
          fontFamily={theme.fonts.body}
          fontSize="10"
          fontWeight="800"
          letterSpacing="1.4"
          textTransform="uppercase"
        >
          {data.type}
        </text>
        {layoutError && (
          <text
            x={PADDING + 92}
            y={PADDING + 30}
            dominantBaseline="hanging"
            fill={theme.colors.secondary}
            fontFamily={theme.fonts.body}
            fontSize="10"
          >
            fallback layout
          </text>
        )}

        {data.edges.map((edge, index) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) return null;

          const { x1, y1, x2, y2 } = getEdgeAnchors(source, target);
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          return (
            <g key={`${edge.source}-${edge.target}-${index}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={edgeColor}
                strokeWidth="2"
                markerEnd={`url(#${markerId})`}
                opacity="0.82"
              />
              {edge.label && (
                <g>
                  <rect
                    x={midX - 28}
                    y={midY - 10}
                    width="56"
                    height="20"
                    rx="10"
                    fill={theme.colors.background}
                    stroke={theme.colors.border || edgeColor}
                  />
                  <text
                    x={midX}
                    y={midY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={theme.colors.secondary}
                    fontFamily={theme.fonts.body}
                    fontSize="10"
                    fontWeight="700"
                  >
                    {truncateLabel(edge.label)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {layout.nodes.map((node) => {
          const colors = getNodeColors(node.kind, theme);
          const kindStyle = getDiagramKindStyle(node.kind);

          return (
            <g key={node.id}>
              {renderNodeShape(node, kindStyle.shape, colors, theme)}
              <text
                x={node.x + node.width / 2}
                y={node.y + node.height / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={colors.text}
                fontFamily={theme.fonts.body}
                fontSize="13"
                fontWeight="800"
              >
                {truncateLabel(node.label)}
              </text>
              {node.kind && (
                <text
                  x={node.x + node.width / 2}
                  y={node.y + node.height / 2 + 17}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={colors.text}
                  opacity="0.58"
                  fontFamily={theme.fonts.body}
                  fontSize="8"
                  fontWeight="800"
                  letterSpacing="1"
                >
                  {node.kind.toUpperCase()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default DiagramRenderer;
