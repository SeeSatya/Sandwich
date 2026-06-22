import {
  DIAGRAM_NODE_KINDS,
  DIAGRAM_TYPES,
  DiagramDefinition,
  DiagramValidationResult,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const hasNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

export const parseDiagramJson = (source: string): { data?: unknown; error?: string } => {
  try {
    return { data: JSON.parse(source) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Invalid JSON',
    };
  }
};

export const validateDiagramDefinition = (value: unknown): DiagramValidationResult => {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      errors: ['Diagram must be a JSON object.'],
    };
  }

  if (!hasNonEmptyString(value.type)) {
    errors.push('Diagram type is required.');
  } else if (!DIAGRAM_TYPES.includes(value.type as DiagramDefinition['type'])) {
    errors.push(`Unsupported diagram type: ${value.type}.`);
  }

  if (value.title !== undefined && typeof value.title !== 'string') {
    errors.push('Diagram title must be a string when provided.');
  }

  if (!Array.isArray(value.nodes)) {
    errors.push('Diagram nodes must be an array.');
  }

  if (!Array.isArray(value.edges)) {
    errors.push('Diagram edges must be an array.');
  }

  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return { valid: errors.length === 0, errors };
  }

  const nodeIds = new Set<string>();

  value.nodes.forEach((node, index) => {
    if (!isRecord(node)) {
      errors.push(`Node ${index + 1} must be an object.`);
      return;
    }

    if (!hasNonEmptyString(node.id)) {
      errors.push(`Node ${index + 1} must have a non-empty id.`);
    } else if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node id: ${node.id}.`);
    } else {
      nodeIds.add(node.id);
    }

    if (!hasNonEmptyString(node.label)) {
      errors.push(`Node ${index + 1} must have a non-empty label.`);
    }

    if (
      node.kind !== undefined &&
      (!hasNonEmptyString(node.kind) || !DIAGRAM_NODE_KINDS.includes(node.kind as DiagramDefinition['nodes'][number]['kind']))
    ) {
      errors.push(`Unsupported node kind on node ${hasNonEmptyString(node.id) ? node.id : index + 1}: ${node.kind}.`);
    }

    if ('x' in node || 'y' in node) {
      errors.push(`Node ${hasNonEmptyString(node.id) ? node.id : index + 1} must not define coordinates.`);
    }
  });

  value.edges.forEach((edge, index) => {
    if (!isRecord(edge)) {
      errors.push(`Edge ${index + 1} must be an object.`);
      return;
    }

    if (!hasNonEmptyString(edge.source)) {
      errors.push(`Edge ${index + 1} must have a non-empty source.`);
    } else if (!nodeIds.has(edge.source)) {
      errors.push(`Edge ${index + 1} references missing source node: ${edge.source}.`);
    }

    if (!hasNonEmptyString(edge.target)) {
      errors.push(`Edge ${index + 1} must have a non-empty target.`);
    } else if (!nodeIds.has(edge.target)) {
      errors.push(`Edge ${index + 1} references missing target node: ${edge.target}.`);
    }

    if (edge.label !== undefined && typeof edge.label !== 'string') {
      errors.push(`Edge ${index + 1} label must be a string when provided.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const parseAndValidateDiagram = (
  source: string
): { diagram?: DiagramDefinition; errors: string[] } => {
  const parsed = parseDiagramJson(source);

  if (parsed.error) {
    return { errors: [parsed.error] };
  }

  const result = validateDiagramDefinition(parsed.data);

  if (!result.valid) {
    return { errors: result.errors };
  }

  return {
    diagram: parsed.data as DiagramDefinition,
    errors: [],
  };
};
