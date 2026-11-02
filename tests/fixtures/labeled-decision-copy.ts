// An unrelated decision flowchart whose SVG text starts with edge labels.
// The graph below is verification data and is never supplied to inference.
export const labeledDecisionCopy = {
  labels: 'ApprovedDeniedRequestReviewAcceptedRejected',
  markdown: '## Access approval\n\nA request is reviewed. Approved requests are accepted; denied requests are rejected.\n\n#chatgpt-mermaid-decision .node rect{fill:blue;}#chatgpt-mermaid-decision .flowchart-link{stroke:gray;}#chatgpt-mermaid-decision .edgeLabel{font-size:13px;}ApprovedDeniedRequestReviewAcceptedRejected',
  graph: {
    direction: 'TB',
    nodes: [
      { id: 'request', label: 'Request' },
      { id: 'review', label: 'Review' },
      { id: 'accepted', label: 'Accepted' },
      { id: 'rejected', label: 'Rejected' },
    ],
    edges: [
      { source: 'request', target: 'review' },
      { source: 'review', target: 'accepted', label: 'Approved' },
      { source: 'review', target: 'rejected', label: 'Denied' },
    ],
    textOrder: [
      { kind: 'edge', index: 1 }, { kind: 'edge', index: 2 },
      { kind: 'node', index: 0 }, { kind: 'node', index: 1 },
      { kind: 'node', index: 2 }, { kind: 'node', index: 3 },
    ],
  },
};
