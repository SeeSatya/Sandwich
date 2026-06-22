export const DIAGRAM_TYPES = [
  'flowchart',
  'network',
  'architecture',
  'database',
  'uml',
  'mindmap',
] as const;

export type DiagramType = (typeof DIAGRAM_TYPES)[number];

export const DIAGRAM_NODE_KINDS = [
  'start',
  'end',
  'process',
  'decision',
  'database',
  'server',
  'client',
  'actor',
  'component',
  'chip',
  'pin',
  'memory',
  'storage',
  'cloud',
] as const;

export type DiagramNodeKind = (typeof DIAGRAM_NODE_KINDS)[number];

export interface DiagramNode {
  id: string;
  label: string;
  kind?: DiagramNodeKind;
}

export interface DiagramEdge {
  source: string;
  target: string;
  label?: string;
}

export interface DiagramDefinition {
  type: DiagramType;
  title?: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface DiagramValidationResult {
  valid: boolean;
  errors: string[];
}
