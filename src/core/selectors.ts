import type { Doc, EdgeId, FreeEdge, MindNode, NodeId } from './types';

export function selectNode(doc: Doc, nodeId: NodeId): MindNode | undefined {
  return doc.nodes[nodeId];
}

export function selectChildIds(doc: Doc, nodeId: NodeId): NodeId[] {
  return doc.nodes[nodeId]?.childIds ?? [];
}

export function selectChildren(doc: Doc, nodeId: NodeId): MindNode[] {
  return selectChildIds(doc, nodeId)
    .map((childId) => doc.nodes[childId])
    .filter((node): node is MindNode => Boolean(node));
}

export function selectSubtree(doc: Doc, nodeId: NodeId): MindNode[] {
  const root = doc.nodes[nodeId];
  if (!root) {
    return [];
  }

  const out: MindNode[] = [];
  const visit = (current: MindNode) => {
    out.push(current);
    current.childIds.forEach((childId) => {
      const child = doc.nodes[childId];
      if (child) {
        visit(child);
      }
    });
  };

  visit(root);
  return out;
}

export function selectPath(doc: Doc, nodeId: NodeId): NodeId[] {
  const path: NodeId[] = [];
  let current: MindNode | undefined = doc.nodes[nodeId];

  while (current) {
    path.unshift(current.id);
    current = current.parentId ? doc.nodes[current.parentId] : undefined;
  }

  return path;
}

export function selectEdgesForNode(doc: Doc, nodeId: NodeId): Array<[EdgeId, FreeEdge]> {
  return Object.entries(doc.edges).filter(([, edge]) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId);
}
