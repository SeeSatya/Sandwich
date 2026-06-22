import { DiagramDefinition, DiagramNodeKind } from './types';

export type DiagramDirection = 'DOWN' | 'RIGHT';
export type DiagramShape = 'pill' | 'rect' | 'diamond' | 'cylinder' | 'cloud' | 'actor' | 'chip' | 'pin';

export interface DiagramTypeDefaults {
  direction: DiagramDirection;
  nodeWidth: number;
  nodeHeight: number;
  nodeSpacing: number;
  layerSpacing: number;
}

export interface DiagramKindStyle {
  shape: DiagramShape;
  accent: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'neutral';
}

export const DIAGRAM_TYPE_DEFAULTS: Record<DiagramDefinition['type'], DiagramTypeDefaults> = {
  flowchart: {
    direction: 'DOWN',
    nodeWidth: 154,
    nodeHeight: 62,
    nodeSpacing: 52,
    layerSpacing: 82,
  },
  network: {
    direction: 'RIGHT',
    nodeWidth: 154,
    nodeHeight: 62,
    nodeSpacing: 58,
    layerSpacing: 96,
  },
  architecture: {
    direction: 'RIGHT',
    nodeWidth: 166,
    nodeHeight: 64,
    nodeSpacing: 64,
    layerSpacing: 104,
  },
  database: {
    direction: 'RIGHT',
    nodeWidth: 158,
    nodeHeight: 66,
    nodeSpacing: 58,
    layerSpacing: 96,
  },
  uml: {
    direction: 'RIGHT',
    nodeWidth: 170,
    nodeHeight: 68,
    nodeSpacing: 60,
    layerSpacing: 96,
  },
  mindmap: {
    direction: 'DOWN',
    nodeWidth: 160,
    nodeHeight: 58,
    nodeSpacing: 48,
    layerSpacing: 86,
  },
};

export const DIAGRAM_KIND_STYLES: Record<DiagramNodeKind, DiagramKindStyle> = {
  start: { shape: 'pill', accent: 'success' },
  end: { shape: 'pill', accent: 'danger' },
  process: { shape: 'rect', accent: 'primary' },
  decision: { shape: 'diamond', accent: 'warning' },
  database: { shape: 'cylinder', accent: 'secondary' },
  server: { shape: 'rect', accent: 'neutral' },
  client: { shape: 'rect', accent: 'primary' },
  actor: { shape: 'actor', accent: 'primary' },
  component: { shape: 'rect', accent: 'secondary' },
  chip: { shape: 'chip', accent: 'primary' },
  pin: { shape: 'pin', accent: 'warning' },
  memory: { shape: 'chip', accent: 'secondary' },
  storage: { shape: 'cylinder', accent: 'neutral' },
  cloud: { shape: 'cloud', accent: 'secondary' },
};

export const getDiagramTypeDefaults = (type: DiagramDefinition['type']) => {
  return DIAGRAM_TYPE_DEFAULTS[type];
};

export const getDiagramKindStyle = (kind?: DiagramNodeKind): DiagramKindStyle => {
  return kind ? DIAGRAM_KIND_STYLES[kind] : DIAGRAM_KIND_STYLES.process;
};
