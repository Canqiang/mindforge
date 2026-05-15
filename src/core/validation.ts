import { isRichText } from './rich-text';
import type { CoreErrorCode, Doc, NodeId, ValidationIssue, ValidationResult } from './types';

export function validateDoc(doc: Doc): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (code: CoreErrorCode, path: string, message: string) => issues.push({ code, path, message });

  if (doc.version !== 1) {
    add('VALIDATION_FAILED', 'version', 'Unsupported document version');
  }

  const root = doc.nodes[doc.rootId];
  if (!root) {
    add('NODE_NOT_FOUND', 'rootId', `Root node "${doc.rootId}" does not exist`);
  } else if (root.parentId !== null) {
    add('INVALID_PARENT', `nodes.${doc.rootId}.parentId`, 'Root parentId must be null');
  }

  const parentSeen = new Set<NodeId>();
  for (const [nodeId, node] of Object.entries(doc.nodes)) {
    if (node.id !== nodeId) {
      add('VALIDATION_FAILED', `nodes.${nodeId}.id`, 'Node id must match its map key');
    }
    if (!isRichText(node.content)) {
      add('INVALID_RICH_TEXT', `nodes.${nodeId}.content`, 'Node content must be ProseMirror-like JSON');
    }
    if (node.note !== undefined && !isRichText(node.note)) {
      add('INVALID_RICH_TEXT', `nodes.${nodeId}.note`, 'Node note must be ProseMirror-like JSON');
    }
    if (node.parentId === null) {
      parentSeen.add(node.id);
    } else if (!doc.nodes[node.parentId]) {
      add('INVALID_PARENT', `nodes.${nodeId}.parentId`, `Parent "${node.parentId}" does not exist`);
    } else if (!doc.nodes[node.parentId].childIds.includes(node.id)) {
      add('INVALID_PARENT', `nodes.${node.parentId}.childIds`, `Parent does not reference child "${node.id}"`);
    }

    const uniqueChildren = new Set(node.childIds);
    if (uniqueChildren.size !== node.childIds.length) {
      add('DUPLICATE_CHILD', `nodes.${nodeId}.childIds`, 'childIds must not contain duplicates');
    }
    for (const childId of node.childIds) {
      const child = doc.nodes[childId];
      if (!child) {
        add('NODE_NOT_FOUND', `nodes.${nodeId}.childIds`, `Child "${childId}" does not exist`);
      } else if (child.parentId !== nodeId) {
        add('INVALID_PARENT', `nodes.${childId}.parentId`, `Child parentId must be "${nodeId}"`);
      }
    }
    if (node.side !== undefined) {
      if (node.side !== 'left' && node.side !== 'right') {
        add('VALIDATION_FAILED', `nodes.${nodeId}.side`, 'side must be "left" or "right"');
      } else if (node.parentId !== doc.rootId) {
        add('VALIDATION_FAILED', `nodes.${nodeId}.side`, 'side is allowed only on root direct children');
      }
    }
  }

  if (parentSeen.size !== 1) {
    add('VALIDATION_FAILED', 'nodes', 'Document must contain exactly one root node');
  }

  classifyOrphans(doc, add);

  for (const [edgeId, edge] of Object.entries(doc.edges)) {
    if (edge.id !== edgeId) {
      add('VALIDATION_FAILED', `edges.${edgeId}.id`, 'Edge id must match its map key');
    }
    if (!doc.nodes[edge.fromNodeId]) {
      add('NODE_NOT_FOUND', `edges.${edgeId}.fromNodeId`, `fromNodeId "${edge.fromNodeId}" does not exist`);
    }
    if (!doc.nodes[edge.toNodeId]) {
      add('NODE_NOT_FOUND', `edges.${edgeId}.toNodeId`, `toNodeId "${edge.toNodeId}" does not exist`);
    }
    if (edge.style !== undefined && edge.style !== 'solid' && edge.style !== 'dashed') {
      add('VALIDATION_FAILED', `edges.${edgeId}.style`, 'style must be "solid" or "dashed"');
    }
  }

  return { ok: issues.length === 0, issues };
}

export function repairDoc(doc: Doc): { doc: Doc; validation: ValidationResult; repaired: string[] } {
  const next = structuredClone(doc);
  const repaired: string[] = [];

  // Pass 1: drop childIds entries that don't agree with their target's parentId
  // (duplicates, missing nodes, or parentId pointing elsewhere).
  for (const [nodeId, node] of Object.entries(next.nodes)) {
    const unique = Array.from(new Set(node.childIds)).filter(
      (childId) => next.nodes[childId]?.parentId === nodeId
    );
    if (unique.length !== node.childIds.length) {
      node.childIds = unique;
      repaired.push(`nodes.${nodeId}.childIds`);
    }
  }

  // Pass 2: backfill orphans where parentId is set correctly but the parent's
  // childIds doesn't include the node. Append in stable id order so the result
  // is deterministic across runs.
  const missing = new Map<NodeId, NodeId[]>();
  const orderedIds = Object.keys(next.nodes).sort();
  for (const nodeId of orderedIds) {
    const node = next.nodes[nodeId];
    if (node.parentId === null) continue;
    const parent = next.nodes[node.parentId];
    if (!parent) continue;
    if (parent.childIds.includes(nodeId)) continue;
    const bucket = missing.get(node.parentId);
    if (bucket) {
      bucket.push(nodeId);
    } else {
      missing.set(node.parentId, [nodeId]);
    }
  }
  for (const [parentId, childIds] of missing) {
    next.nodes[parentId].childIds.push(...childIds);
    repaired.push(`nodes.${parentId}.childIds`);
  }

  for (const [edgeId, edge] of Object.entries(next.edges)) {
    if (!next.nodes[edge.fromNodeId] || !next.nodes[edge.toNodeId]) {
      delete next.edges[edgeId];
      repaired.push(`edges.${edgeId}`);
    }
  }

  return { doc: next, validation: validateDoc(next), repaired };
}

function collectReachable(doc: Doc): Set<NodeId> {
  const reachable = new Set<NodeId>();
  if (!doc.nodes[doc.rootId]) {
    return reachable;
  }
  const stack: NodeId[] = [doc.rootId];
  while (stack.length > 0) {
    const current = stack.pop() as NodeId;
    if (reachable.has(current)) {
      continue;
    }
    reachable.add(current);
    const node = doc.nodes[current];
    if (!node) continue;
    for (const childId of node.childIds) {
      if (!reachable.has(childId)) {
        stack.push(childId);
      }
    }
  }
  return reachable;
}

function classifyOrphans(
  doc: Doc,
  add: (code: CoreErrorCode, path: string, message: string) => void
): void {
  const reachable = collectReachable(doc);
  type State = 'cycle' | 'unreachable';
  const state = new Map<NodeId, State>();

  for (const nodeId of Object.keys(doc.nodes)) {
    if (reachable.has(nodeId) || state.has(nodeId)) {
      continue;
    }
    const path: NodeId[] = [];
    const onPath = new Set<NodeId>();
    let current: NodeId | null = nodeId;
    let inferred: State | null = null;

    while (current !== null) {
      if (reachable.has(current)) {
        inferred = 'unreachable';
        break;
      }
      if (state.has(current)) {
        inferred = state.get(current) as State;
        break;
      }
      if (onPath.has(current)) {
        inferred = 'cycle';
        const cycleStart = path.indexOf(current);
        for (let i = cycleStart; i < path.length; i++) {
          state.set(path[i], 'cycle');
        }
        for (let i = 0; i < cycleStart; i++) {
          state.set(path[i], 'cycle');
        }
        path.length = cycleStart;
        break;
      }
      onPath.add(current);
      path.push(current);
      current = doc.nodes[current]?.parentId ?? null;
    }

    if (inferred === null) {
      inferred = 'unreachable';
    }
    for (const id of path) {
      if (!state.has(id)) {
        state.set(id, inferred);
      }
    }
  }

  for (const [nodeId, kind] of state) {
    if (kind === 'cycle') {
      add('CYCLE_DETECTED', `nodes.${nodeId}.parentId`, 'Node ancestry contains a cycle');
    } else {
      add('VALIDATION_FAILED', `nodes.${nodeId}`, 'Node is not reachable from root');
    }
  }
}
