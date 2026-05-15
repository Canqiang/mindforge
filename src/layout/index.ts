import type { Doc, NodeId } from '../core';

export interface MeasuredNode {
  width: number;
  height: number;
}

export interface LayoutInput {
  doc: Doc;
  measuredNodes: Record<NodeId, MeasuredNode>;
}

export interface LayoutNode {
  id: NodeId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  from: NodeId;
  to: NodeId;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LayoutResult {
  nodes: Record<NodeId, LayoutNode>;
  edges: LayoutEdge[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

const DEFAULT_SIZE: MeasuredNode = { width: 180, height: 56 };
const HORIZONTAL_GAP = 220;
const VERTICAL_GAP = 40;

export function computeSimpleMindMapLayout(input: LayoutInput): LayoutResult {
  const { doc, measuredNodes } = input;
  const layoutNodes: Record<NodeId, LayoutNode> = {};
  const rootSize = measuredNodes[doc.rootId] ?? DEFAULT_SIZE;

  layoutNodes[doc.rootId] = {
    id: doc.rootId,
    x: 480,
    y: 240,
    width: rootSize.width,
    height: rootSize.height
  };

  const root = doc.nodes[doc.rootId];
  const left: NodeId[] = [];
  const right: NodeId[] = [];

  root.childIds.forEach((childId, index) => {
    const child = doc.nodes[childId];
    const side = child?.side ?? (index % 2 === 0 ? 'right' : 'left');
    if (side === 'left') {
      left.push(childId);
    } else {
      right.push(childId);
    }
  });

  placeBranch(doc, measuredNodes, layoutNodes, left, 'left', layoutNodes[doc.rootId]);
  placeBranch(doc, measuredNodes, layoutNodes, right, 'right', layoutNodes[doc.rootId]);

  const edges: LayoutEdge[] = [];
  for (const node of Object.values(doc.nodes)) {
    for (const childId of node.childIds) {
      const from = layoutNodes[node.id];
      const to = layoutNodes[childId];
      if (!from || !to) {
        continue;
      }
      edges.push({
        from: node.id,
        to: childId,
        x1: from.x + from.width / 2,
        y1: from.y + from.height / 2,
        x2: to.x + to.width / 2,
        y2: to.y + to.height / 2
      });
    }
  }

  return {
    nodes: layoutNodes,
    edges,
    bounds: computeBounds(Object.values(layoutNodes))
  };
}

function placeBranch(
  doc: Doc,
  measuredNodes: Record<NodeId, MeasuredNode>,
  out: Record<NodeId, LayoutNode>,
  childIds: NodeId[],
  side: 'left' | 'right',
  root: LayoutNode
): void {
  const direction = side === 'left' ? -1 : 1;
  const totalHeight = childIds.reduce((sum, id) => sum + (measuredNodes[id]?.height ?? DEFAULT_SIZE.height), 0);
  const gapHeight = Math.max(0, childIds.length - 1) * VERTICAL_GAP;
  let cursorY = root.y + root.height / 2 - (totalHeight + gapHeight) / 2;

  childIds.forEach((childId) => {
    const size = measuredNodes[childId] ?? DEFAULT_SIZE;
    const x = side === 'left' ? root.x - HORIZONTAL_GAP - size.width : root.x + root.width + HORIZONTAL_GAP;
    out[childId] = { id: childId, x, y: cursorY, width: size.width, height: size.height };
    cursorY += size.height + VERTICAL_GAP;

    const child = doc.nodes[childId];
    // Collapsed nodes stay placed themselves so their parent's edge still
    // lands on something visible, but we don't lay out their subtree.
    if (child?.childIds.length && !child.collapsed) {
      placeSubtree(doc, measuredNodes, out, child.childIds, direction, out[childId], 1);
    }
  });
}

function placeSubtree(
  doc: Doc,
  measuredNodes: Record<NodeId, MeasuredNode>,
  out: Record<NodeId, LayoutNode>,
  childIds: NodeId[],
  direction: -1 | 1,
  parent: LayoutNode,
  depth: number
): void {
  const totalHeight = childIds.reduce((sum, id) => sum + (measuredNodes[id]?.height ?? DEFAULT_SIZE.height), 0);
  const gapHeight = Math.max(0, childIds.length - 1) * VERTICAL_GAP;
  let cursorY = parent.y + parent.height / 2 - (totalHeight + gapHeight) / 2;

  childIds.forEach((childId) => {
    const size = measuredNodes[childId] ?? DEFAULT_SIZE;
    const x = parent.x + direction * (HORIZONTAL_GAP + (direction === 1 ? parent.width : size.width));
    out[childId] = { id: childId, x, y: cursorY, width: size.width, height: size.height };
    cursorY += size.height + VERTICAL_GAP;

    const child = doc.nodes[childId];
    if (child?.childIds.length && !child.collapsed) {
      placeSubtree(doc, measuredNodes, out, child.childIds, direction, out[childId], depth + 1);
    }
  });
}

function computeBounds(nodes: LayoutNode[]): LayoutResult['bounds'] {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return nodes.reduce(
    (bounds, node) => ({
      minX: Math.min(bounds.minX, node.x),
      minY: Math.min(bounds.minY, node.y),
      maxX: Math.max(bounds.maxX, node.x + node.width),
      maxY: Math.max(bounds.maxY, node.y + node.height)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    }
  );
}
