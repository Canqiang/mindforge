import { produce } from 'immer';
import { cloneRichText, isRichText } from './rich-text';
import { selectEdgesForNode, selectSubtree } from './selectors';
import type {
  AddFreeEdgeOp,
  ApplyContext,
  ApplyResult,
  CoreError,
  DeleteFreeEdgeOp,
  DeleteSubtreeOp,
  Doc,
  DocOperation,
  InsertNodeOp,
  MindNode,
  MoveNodeOp,
  NodeId,
  NodePayload,
  RichText,
  SetThemeOp,
  UpdateFreeEdgeOp,
  UpdateNodeMetaOp
} from './types';
import { validateDoc } from './validation';

export interface ApplyOptions {
  /**
   * Skip the upfront validateDoc on the input doc. Safe when the caller
   * guarantees the doc is already validated (e.g. the in-memory store
   * always feeds previously-applied output back in).
   */
  skipInputValidation?: boolean;
}

export function applyDocOp(
  doc: Doc,
  op: DocOperation,
  context: ApplyContext,
  options?: ApplyOptions
): ApplyResult {
  return applyDocTransaction(doc, [op], context, options);
}

export function applyDocTransaction(
  doc: Doc,
  ops: DocOperation[],
  context: ApplyContext,
  options?: ApplyOptions
): ApplyResult {
  if (!options?.skipInputValidation) {
    const initialValidation = validateDoc(doc);
    if (!initialValidation.ok) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Cannot apply operation to an invalid document',
          path: initialValidation.issues[0]?.path
        },
        validation: initialValidation
      };
    }
  }

  let next = doc;
  const inverseOps: DocOperation[] = [];

  for (const op of ops) {
    const result = applySingleDocOp(next, op, context);
    if (!result.ok || !result.doc || !result.inverseOps) {
      return result;
    }
    next = result.doc;
    inverseOps.unshift(...result.inverseOps);
  }

  const validation = validateDoc(next);
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Operation produced an invalid document',
        opId: ops.at(-1)?.id,
        path: validation.issues[0]?.path
      },
      validation
    };
  }

  return { ok: true, doc: next, inverseOps, validation };
}

function applySingleDocOp(doc: Doc, op: DocOperation, context: ApplyContext): ApplyResult {
  switch (op.type) {
    case 'insertNode':
      return applyInsertNode(doc, op, context);
    case 'deleteSubtree':
      return applyDeleteSubtree(doc, op, context);
    case 'moveNode':
      return applyMoveNode(doc, op, context);
    case 'updateContent':
      return applyUpdateContent(doc, op, context);
    case 'setCollapsed':
      return applySetCollapsed(doc, op, context);
    case 'updateNodeMeta':
      return applyUpdateNodeMeta(doc, op, context);
    case 'addFreeEdge':
      return applyAddFreeEdge(doc, op, context);
    case 'updateFreeEdge':
      return applyUpdateFreeEdge(doc, op, context);
    case 'deleteFreeEdge':
      return applyDeleteFreeEdge(doc, op, context);
    case 'setTheme':
      return applySetTheme(doc, op, context);
    default:
      return fail('INVALID_OPERATION', 'Unsupported operation');
  }
}

function applyInsertNode(doc: Doc, op: InsertNodeOp, context: ApplyContext): ApplyResult {
  if (doc.nodes[op.node.id]) {
    return fail('DUPLICATE_NODE', `Node "${op.node.id}" already exists`, op.id, op.node.id);
  }
  if (op.parentId === null) {
    return fail('INVALID_PARENT', 'Cannot insert a second root node', op.id, op.node.id);
  }
  const parentId = op.parentId;
  const parent = doc.nodes[parentId];
  if (!parent) {
    return fail('INVALID_PARENT', `Parent "${parentId}" does not exist`, op.id, op.node.id);
  }
  if (op.index < 0 || op.index > parent.childIds.length) {
    return fail('INVALID_OPERATION', `Insert index ${op.index} is out of bounds`, op.id, op.node.id);
  }

  const next = produce(doc, (draft) => {
    draft.nodes[op.node.id] = payloadToNode(op.node, parentId);
    draft.nodes[parentId].childIds.splice(op.index, 0, op.node.id);
    touch(draft, context);
  });

  return {
    ok: true,
    doc: next,
    inverseOps: [{ id: inverseId(op.id), type: 'deleteSubtree', nodeId: op.node.id }]
  };
}

function applyDeleteSubtree(doc: Doc, op: DeleteSubtreeOp, context: ApplyContext): ApplyResult {
  const node = doc.nodes[op.nodeId];
  if (!node) {
    return fail('NODE_NOT_FOUND', `Node "${op.nodeId}" does not exist`, op.id, op.nodeId);
  }
  if (op.nodeId === doc.rootId) {
    return fail('INVALID_OPERATION', 'Cannot delete the root node', op.id, op.nodeId);
  }
  if (!node.parentId) {
    return fail('INVALID_PARENT', `Node "${op.nodeId}" has no parent`, op.id, op.nodeId);
  }

  const subtree = selectSubtree(doc, op.nodeId);
  const subtreeIds = new Set(subtree.map((item) => item.id));
  const parentId = node.parentId;
  const originalIndex = doc.nodes[parentId].childIds.indexOf(op.nodeId);
  if (originalIndex < 0) {
    return fail('INVALID_PARENT', `Parent "${parentId}" does not reference "${op.nodeId}"`, op.id, op.nodeId);
  }
  const removedEdges = Object.fromEntries(
    subtree.flatMap((item) => selectEdgesForNode(doc, item.id)).filter(([, edge]) => subtreeIds.has(edge.fromNodeId) || subtreeIds.has(edge.toNodeId))
  );

  const descendantIndex = new Map<NodeId, number>();
  for (const item of subtree) {
    if (item.id === op.nodeId) continue;
    if (item.parentId === null) {
      return fail('INVALID_PARENT', `Descendant "${item.id}" has no parent`, op.id, item.id);
    }
    const parent = doc.nodes[item.parentId];
    const idx = parent?.childIds.indexOf(item.id) ?? -1;
    if (idx < 0) {
      return fail('INVALID_PARENT', `Parent "${item.parentId}" does not reference "${item.id}"`, op.id, item.id);
    }
    descendantIndex.set(item.id, idx);
  }

  const next = produce(doc, (draft) => {
    draft.nodes[parentId].childIds = draft.nodes[parentId].childIds.filter((id) => id !== op.nodeId);
    subtreeIds.forEach((id) => {
      delete draft.nodes[id];
    });
    Object.keys(removedEdges).forEach((edgeId) => {
      delete draft.edges[edgeId];
    });
    touch(draft, context);
  });

  const inverseOps: DocOperation[] = subtree.map((item) => {
    const isSubtreeRoot = item.id === op.nodeId;
    return {
      id: `${inverseId(op.id)}:insert:${item.id}`,
      type: 'insertNode',
      node: nodeToPayload(item),
      parentId: isSubtreeRoot ? parentId : (item.parentId as NodeId),
      index: isSubtreeRoot ? originalIndex : (descendantIndex.get(item.id) as number)
    };
  });

  inverseOps.push(
    ...Object.values(removedEdges).map<AddFreeEdgeOp>((edge) => ({
      id: `${inverseId(op.id)}:edge:${edge.id}`,
      type: 'addFreeEdge',
      edge: structuredClone(edge)
    }))
  );

  return { ok: true, doc: next, inverseOps };
}

function applyMoveNode(doc: Doc, op: MoveNodeOp, context: ApplyContext): ApplyResult {
  const node = doc.nodes[op.nodeId];
  const newParent = doc.nodes[op.newParentId];
  if (!node) {
    return fail('NODE_NOT_FOUND', `Node "${op.nodeId}" does not exist`, op.id, op.nodeId);
  }
  if (op.nodeId === doc.rootId) {
    return fail('INVALID_OPERATION', 'Cannot move the root node', op.id, op.nodeId);
  }
  if (!node.parentId || !doc.nodes[node.parentId]) {
    return fail('INVALID_PARENT', `Node "${op.nodeId}" has an invalid parent`, op.id, op.nodeId);
  }
  if (!newParent) {
    return fail('INVALID_PARENT', `Parent "${op.newParentId}" does not exist`, op.id, op.nodeId);
  }
  if (selectSubtree(doc, op.nodeId).some((item) => item.id === op.newParentId)) {
    return fail('CYCLE_DETECTED', 'Cannot move a node under itself or its descendant', op.id, op.nodeId);
  }
  if (op.index < 0 || op.index > newParent.childIds.length) {
    return fail('INVALID_OPERATION', `Move index ${op.index} is out of bounds`, op.id, op.nodeId);
  }

  const oldParentId = node.parentId;
  const oldIndex = doc.nodes[oldParentId].childIds.indexOf(op.nodeId);
  const oldSide = node.side;

  const next = produce(doc, (draft) => {
    draft.nodes[oldParentId].childIds = draft.nodes[oldParentId].childIds.filter((id) => id !== op.nodeId);
    const targetIndex = oldParentId === op.newParentId && oldIndex < op.index ? op.index - 1 : op.index;
    draft.nodes[op.newParentId].childIds.splice(targetIndex, 0, op.nodeId);
    draft.nodes[op.nodeId].parentId = op.newParentId;
    if (op.newParentId !== doc.rootId) {
      delete draft.nodes[op.nodeId].side;
    }
    touch(draft, context);
  });

  const inverseOps: DocOperation[] = [
    { id: inverseId(op.id), type: 'moveNode', nodeId: op.nodeId, newParentId: oldParentId, index: oldIndex }
  ];
  if (next.nodes[op.nodeId].side !== oldSide) {
    inverseOps.push({
      id: `${inverseId(op.id)}:side`,
      type: 'updateNodeMeta',
      nodeId: op.nodeId,
      patch: { side: oldSide }
    });
  }

  return { ok: true, doc: next, inverseOps };
}

function applyUpdateContent(doc: Doc, op: Extract<DocOperation, { type: 'updateContent' }>, context: ApplyContext): ApplyResult {
  const node = doc.nodes[op.nodeId];
  if (!node) {
    return fail('NODE_NOT_FOUND', `Node "${op.nodeId}" does not exist`, op.id, op.nodeId);
  }
  if (!isRichText(op.content)) {
    return fail('INVALID_RICH_TEXT', 'Node content must be ProseMirror-like JSON', op.id, op.nodeId);
  }

  const previous = cloneRichText(node.content);
  const next = produce(doc, (draft) => {
    draft.nodes[op.nodeId].content = cloneRichText(op.content);
    touch(draft, context);
  });

  return {
    ok: true,
    doc: next,
    inverseOps: [{ id: inverseId(op.id), type: 'updateContent', nodeId: op.nodeId, content: previous }]
  };
}

function applySetCollapsed(doc: Doc, op: Extract<DocOperation, { type: 'setCollapsed' }>, context: ApplyContext): ApplyResult {
  const node = doc.nodes[op.nodeId];
  if (!node) {
    return fail('NODE_NOT_FOUND', `Node "${op.nodeId}" does not exist`, op.id, op.nodeId);
  }
  const previous = node.collapsed;
  const next = produce(doc, (draft) => {
    if (op.collapsed === undefined) {
      delete draft.nodes[op.nodeId].collapsed;
    } else {
      draft.nodes[op.nodeId].collapsed = op.collapsed;
    }
    touch(draft, context);
  });
  return {
    ok: true,
    doc: next,
    inverseOps: [{ id: inverseId(op.id), type: 'setCollapsed', nodeId: op.nodeId, collapsed: previous }]
  };
}

function applyUpdateNodeMeta(doc: Doc, op: UpdateNodeMetaOp, context: ApplyContext): ApplyResult {
  const node = doc.nodes[op.nodeId];
  if (!node) {
    return fail('NODE_NOT_FOUND', `Node "${op.nodeId}" does not exist`, op.id, op.nodeId);
  }

  const previous: UpdateNodeMetaOp['patch'] = {};
  for (const key of Object.keys(op.patch) as Array<keyof UpdateNodeMetaOp['patch']>) {
    if (key === 'note') {
      previous.note = node.note ? cloneRichText(node.note) : undefined;
    } else if (key === 'icon') {
      previous.icon = node.icon;
    } else if (key === 'color') {
      previous.color = node.color;
    } else if (key === 'side') {
      previous.side = node.side;
    }
  }

  const next = produce(doc, (draft) => {
    applyMetaPatch(draft.nodes[op.nodeId], op.patch);
    touch(draft, context);
  });

  return {
    ok: true,
    doc: next,
    inverseOps: [{ id: inverseId(op.id), type: 'updateNodeMeta', nodeId: op.nodeId, patch: previous }]
  };
}

function applyAddFreeEdge(doc: Doc, op: AddFreeEdgeOp, context: ApplyContext): ApplyResult {
  if (doc.edges[op.edge.id]) {
    return fail('INVALID_OPERATION', `Edge "${op.edge.id}" already exists`, op.id, undefined, op.edge.id);
  }
  if (!doc.nodes[op.edge.fromNodeId] || !doc.nodes[op.edge.toNodeId]) {
    return fail('NODE_NOT_FOUND', 'Free edge endpoints must exist', op.id, undefined, op.edge.id);
  }
  const next = produce(doc, (draft) => {
    draft.edges[op.edge.id] = structuredClone(op.edge);
    touch(draft, context);
  });
  return {
    ok: true,
    doc: next,
    inverseOps: [{ id: inverseId(op.id), type: 'deleteFreeEdge', edgeId: op.edge.id }]
  };
}

function applyUpdateFreeEdge(doc: Doc, op: UpdateFreeEdgeOp, context: ApplyContext): ApplyResult {
  const edge = doc.edges[op.edgeId];
  if (!edge) {
    return fail('EDGE_NOT_FOUND', `Edge "${op.edgeId}" does not exist`, op.id, undefined, op.edgeId);
  }
  const previous: UpdateFreeEdgeOp['patch'] = { label: edge.label, style: edge.style };
  const next = produce(doc, (draft) => {
    Object.assign(draft.edges[op.edgeId], op.patch);
    touch(draft, context);
  });
  return {
    ok: true,
    doc: next,
    inverseOps: [{ id: inverseId(op.id), type: 'updateFreeEdge', edgeId: op.edgeId, patch: previous }]
  };
}

function applyDeleteFreeEdge(doc: Doc, op: DeleteFreeEdgeOp, context: ApplyContext): ApplyResult {
  const edge = doc.edges[op.edgeId];
  if (!edge) {
    return fail('EDGE_NOT_FOUND', `Edge "${op.edgeId}" does not exist`, op.id, undefined, op.edgeId);
  }
  const next = produce(doc, (draft) => {
    delete draft.edges[op.edgeId];
    touch(draft, context);
  });
  return {
    ok: true,
    doc: next,
    inverseOps: [{ id: inverseId(op.id), type: 'addFreeEdge', edge: structuredClone(edge) }]
  };
}

function applySetTheme(doc: Doc, op: SetThemeOp, context: ApplyContext): ApplyResult {
  const previous = doc.theme;
  const next = produce(doc, (draft) => {
    draft.theme = op.theme;
    touch(draft, context);
  });
  return {
    ok: true,
    doc: next,
    inverseOps: [{ id: inverseId(op.id), type: 'setTheme', theme: previous }]
  };
}

function payloadToNode(payload: NodePayload, parentId: NodeId | null): MindNode {
  return {
    id: payload.id,
    parentId,
    childIds: [],
    content: cloneRichText(payload.content),
    collapsed: payload.collapsed,
    note: payload.note ? cloneRichText(payload.note) : undefined,
    icon: payload.icon,
    color: payload.color,
    side: payload.side
  };
}

function nodeToPayload(node: MindNode): NodePayload {
  return {
    id: node.id,
    content: cloneRichText(node.content),
    collapsed: node.collapsed,
    note: node.note ? cloneRichText(node.note) : undefined,
    icon: node.icon,
    color: node.color,
    side: node.side
  };
}

function applyMetaPatch(node: MindNode, patch: UpdateNodeMetaOp['patch']): void {
  for (const [key, value] of Object.entries(patch) as Array<[keyof UpdateNodeMetaOp['patch'], UpdateNodeMetaOp['patch'][keyof UpdateNodeMetaOp['patch']]]>) {
    if (value === undefined) {
      delete node[key];
    } else if (key === 'note') {
      node.note = cloneRichText(value as RichText);
    } else {
      node[key] = value as never;
    }
  }
}

function touch(doc: Doc, context: ApplyContext): void {
  doc.meta.updatedAt = context.timestamp;
}

function inverseId(id: string): string {
  return `${id}:inverse`;
}

function fail(code: CoreError['code'], message: string, opId?: string, nodeId?: NodeId, edgeId?: string): ApplyResult {
  return {
    ok: false,
    error: { code, message, opId, nodeId, edgeId }
  };
}
