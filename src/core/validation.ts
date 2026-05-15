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

  const reachable = collectReachable(doc);
  for (const nodeId of Object.keys(doc.nodes)) {
    if (!reachable.has(nodeId)) {
      add('VALIDATION_FAILED', `nodes.${nodeId}`, 'Node is not reachable from root');
    }
  }

  for (const [nodeId, node] of Object.entries(doc.nodes)) {
    const seen = new Set<NodeId>();
    let current: NodeId | null = node.parentId;
    while (current !== null) {
      if (current === nodeId || seen.has(current)) {
        add('CYCLE_DETECTED', `nodes.${nodeId}.parentId`, 'Node ancestry contains a cycle');
        break;
      }
      seen.add(current);
      current = doc.nodes[current]?.parentId ?? null;
    }
  }

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

  for (const [nodeId, node] of Object.entries(next.nodes)) {
    const unique = Array.from(new Set(node.childIds)).filter((childId) => next.nodes[childId]?.parentId === nodeId);
    if (unique.length !== node.childIds.length) {
      node.childIds = unique;
      repaired.push(`nodes.${nodeId}.childIds`);
    }
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
  const visit = (nodeId: NodeId) => {
    if (reachable.has(nodeId)) {
      return;
    }
    reachable.add(nodeId);
    doc.nodes[nodeId]?.childIds.forEach(visit);
  };
  visit(doc.rootId);
  return reachable;
}
