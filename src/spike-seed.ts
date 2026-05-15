import { applyDocOp, createEmptyDoc, createTextDoc, type Doc, type NodeId } from './core';

/**
 * Seed document for the v0.1-spike. Lives outside app.tsx so the composition
 * root doesn't need to import `applyDocOp` directly — keeping the two-entry
 * mutation path visually contained to one construction module.
 */
export function createSpikeDoc(): Doc {
  const now = Date.now();
  let doc = createEmptyDoc({
    title: 'MindForge spike',
    children: ['Outline sync', 'DOM + SVG render', 'Selection bridge'],
    now
  });

  doc = insertChild(doc, 'outline-content', 'Shared ProseMirror JSON', 'node-1', now);
  doc = insertChild(doc, 'outline-selection', 'Node-local cursor range', 'node-1', now);
  doc = insertChild(doc, 'render-pan-zoom', 'Pan and zoom surface', 'node-2', now);
  doc = insertChild(doc, 'bridge-ime', 'IME composition guard', 'node-3', now);
  return doc;
}

function insertChild(doc: Doc, id: NodeId, title: string, parentId: NodeId, timestamp: number): Doc {
  const result = applyDocOp(
    doc,
    {
      id: `seed:${id}`,
      type: 'insertNode',
      parentId,
      index: doc.nodes[parentId].childIds.length,
      node: {
        id,
        content: createTextDoc(title)
      }
    },
    { origin: 'test', timestamp, history: 'skip' },
    { skipInputValidation: true }
  );

  if (!result.ok || !result.doc) {
    throw new Error(result.error?.message ?? `Failed to seed node ${id}`);
  }
  return result.doc;
}
