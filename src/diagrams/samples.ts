import { DiagramDefinition } from './types';

export const SAMPLE_FLOWCHART_DIAGRAM: DiagramDefinition = {
  type: 'flowchart',
  title: 'Authentication',
  nodes: [
    { id: 'start', label: 'Start', kind: 'start' },
    { id: 'login', label: 'Login', kind: 'process' },
    { id: 'check', label: 'Valid?', kind: 'decision' },
    { id: 'dashboard', label: 'Dashboard', kind: 'end' },
  ],
  edges: [
    { source: 'start', target: 'login' },
    { source: 'login', target: 'check' },
    { source: 'check', target: 'dashboard', label: 'yes' },
  ],
};

export const SAMPLE_ARCHITECTURE_DIAGRAM: DiagramDefinition = {
  type: 'architecture',
  title: 'Web App Architecture',
  nodes: [
    { id: 'client', label: 'Client', kind: 'client' },
    { id: 'api', label: 'API', kind: 'server' },
    { id: 'db', label: 'Database', kind: 'database' },
    { id: 'cache', label: 'Cache', kind: 'storage' },
  ],
  edges: [
    { source: 'client', target: 'api', label: 'HTTPS' },
    { source: 'api', target: 'db' },
    { source: 'api', target: 'cache' },
  ],
};

export const INVALID_DUPLICATE_NODE_DIAGRAM = {
  type: 'flowchart',
  title: 'Invalid Duplicate Nodes',
  nodes: [
    { id: 'node', label: 'First' },
    { id: 'node', label: 'Second' },
  ],
  edges: [],
};

export const INVALID_MISSING_EDGE_TARGET_DIAGRAM = {
  type: 'flowchart',
  title: 'Invalid Missing Target',
  nodes: [{ id: 'start', label: 'Start' }],
  edges: [{ source: 'start', target: 'missing' }],
};
