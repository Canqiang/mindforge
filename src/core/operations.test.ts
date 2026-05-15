import { describe, expect, it } from 'vitest';
import { applyDocOp, applyDocTransaction, createCoreStore, createEmptyDoc, createTextDoc, getPlainText, repairDoc, validateDoc } from './index';
import type { ApplyContext, Doc, DocOperation } from './types';

const context: ApplyContext = { origin: 'test', timestamp: 100, history: 'record' };

describe('core doc operations', () => {
  it('inserts a node through a DocOperation', () => {
    const doc = createEmptyDoc({ title: 'Root', now: 0 });
    const result = applyDocOp(
      doc,
      {
        id: 'op-1',
        type: 'insertNode',
        parentId: doc.rootId,
        index: 0,
        node: { id: 'child-a', content: createTextDoc('Child A'), side: 'right' }
      },
      context
    );

    expect(result.ok).toBe(true);
    expect(result.doc?.nodes['child-a'].parentId).toBe(doc.rootId);
    expect(result.doc?.nodes[doc.rootId].childIds).toEqual(['child-a']);
    expect(validateDoc(result.doc!).ok).toBe(true);
  });

  it('rejects moving a node below its own descendant', () => {
    const doc = withNode(withNode(createEmptyDoc({ title: 'Root', now: 0 }), 'a', 'A', 'root'), 'b', 'B', 'a');
    const result = applyDocOp(doc, { id: 'op-cycle', type: 'moveNode', nodeId: 'a', newParentId: 'b', index: 0 }, context);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('CYCLE_DETECTED');
    expect(doc.nodes.a.parentId).toBe('root');
  });

  it('deletes a subtree and related free edges', () => {
    let doc = withNode(createEmptyDoc({ title: 'Root', now: 0 }), 'a', 'A', 'root');
    doc = applyDocOp(
      doc,
      {
        id: 'edge-1',
        type: 'addFreeEdge',
        edge: { id: 'edge-a-root', fromNodeId: 'a', toNodeId: 'root', style: 'solid' }
      },
      context
    ).doc!;

    const result = applyDocOp(doc, { id: 'delete-a', type: 'deleteSubtree', nodeId: 'a' }, context);

    expect(result.ok).toBe(true);
    expect(result.doc?.nodes.a).toBeUndefined();
    expect(result.doc?.edges['edge-a-root']).toBeUndefined();
    expect(result.inverseOps?.some((op) => op.type === 'addFreeEdge')).toBe(true);
  });

  it('rolls back a transaction when one operation fails', () => {
    const doc = createEmptyDoc({ title: 'Root', now: 0 });
    const ops: DocOperation[] = [
      {
        id: 'insert-a',
        type: 'insertNode',
        parentId: doc.rootId,
        index: 0,
        node: { id: 'a', content: createTextDoc('A'), side: 'right' }
      },
      { id: 'bad-move', type: 'moveNode', nodeId: 'missing', newParentId: doc.rootId, index: 0 }
    ];

    const result = applyDocTransaction(doc, ops, context);

    expect(result.ok).toBe(false);
    expect(doc.nodes.a).toBeUndefined();
  });

  it('returns inverse operations that can restore content', () => {
    const doc = withNode(createEmptyDoc({ title: 'Root', now: 0 }), 'a', 'A', 'root');
    const updated = applyDocOp(
      doc,
      { id: 'update-a', type: 'updateContent', nodeId: 'a', content: createTextDoc('Changed') },
      context
    );

    expect(getPlainText(updated.doc!.nodes.a.content)).toBe('Changed');

    const restored = applyDocTransaction(updated.doc!, updated.inverseOps!, { ...context, history: 'skip' });
    expect(restored.ok).toBe(true);
    expect(getPlainText(restored.doc!.nodes.a.content)).toBe('A');
  });

  it('undo of updateNodeMeta keeps fields not in the patch untouched', () => {
    let doc = createEmptyDoc({ title: 'Root', now: 0 });
    doc = applyDocOp(
      doc,
      {
        id: 'insert-a',
        type: 'insertNode',
        parentId: doc.rootId,
        index: 0,
        node: { id: 'a', content: createTextDoc('A'), color: '#ff0', icon: 'star', side: 'right' }
      },
      context
    ).doc!;

    const result = applyDocOp(
      doc,
      { id: 'meta-1', type: 'updateNodeMeta', nodeId: 'a', patch: { icon: 'flag' } },
      context
    );

    expect(result.ok).toBe(true);
    expect(result.doc?.nodes.a.icon).toBe('flag');
    expect(result.doc?.nodes.a.color).toBe('#ff0');

    const restored = applyDocTransaction(result.doc!, result.inverseOps!, { ...context, history: 'skip' });
    expect(restored.ok).toBe(true);
    expect(restored.doc?.nodes.a.icon).toBe('star');
    expect(restored.doc?.nodes.a.color).toBe('#ff0');
    expect(restored.doc?.nodes.a.side).toBe('right');
  });

  it('undo of moveNode away from root restores the original side', () => {
    let doc = createEmptyDoc({ title: 'Root', now: 0 });
    doc = applyDocOp(
      doc,
      {
        id: 'insert-a',
        type: 'insertNode',
        parentId: doc.rootId,
        index: 0,
        node: { id: 'a', content: createTextDoc('A'), side: 'right' }
      },
      context
    ).doc!;
    doc = applyDocOp(
      doc,
      {
        id: 'insert-b',
        type: 'insertNode',
        parentId: doc.rootId,
        index: 1,
        node: { id: 'b', content: createTextDoc('B'), side: 'left' }
      },
      context
    ).doc!;

    const moved = applyDocOp(doc, { id: 'move-a', type: 'moveNode', nodeId: 'a', newParentId: 'b', index: 0 }, context);
    expect(moved.ok).toBe(true);
    expect(moved.doc?.nodes.a.parentId).toBe('b');
    expect(moved.doc?.nodes.a.side).toBeUndefined();

    const restored = applyDocTransaction(moved.doc!, moved.inverseOps!, { ...context, history: 'skip' });
    expect(restored.ok).toBe(true);
    expect(restored.doc?.nodes.a.parentId).toBe(doc.rootId);
    expect(restored.doc?.nodes.a.side).toBe('right');
    expect(validateDoc(restored.doc!).ok).toBe(true);
  });

  it('moves a node between parents and preserves document invariants', () => {
    let doc = createEmptyDoc({ title: 'Root', now: 0 });
    doc = withNode(doc, 'a', 'A', 'root');
    doc = withNode(doc, 'b', 'B', 'root');
    doc = withNode(doc, 'a-1', 'A1', 'a');

    const result = applyDocOp(doc, { id: 'move-a-1', type: 'moveNode', nodeId: 'a-1', newParentId: 'b', index: 0 }, context);

    expect(result.ok).toBe(true);
    expect(result.doc?.nodes['a-1'].parentId).toBe('b');
    expect(result.doc?.nodes.a.childIds).toEqual([]);
    expect(result.doc?.nodes.b.childIds).toEqual(['a-1']);
    expect(validateDoc(result.doc!).ok).toBe(true);
  });

  it('rejects invalid rich text without returning a mutated doc', () => {
    const doc = withNode(createEmptyDoc({ title: 'Root', now: 0 }), 'a', 'A', 'root');
    const result = applyDocOp(
      doc,
      {
        id: 'bad-content',
        type: 'updateContent',
        nodeId: 'a',
        content: { type: 'doc', content: [{ type: 'paragraph', text: 123 as unknown as string }] }
      },
      context
    );

    expect(result.ok).toBe(false);
    expect(result.doc).toBeUndefined();
    expect(getPlainText(doc.nodes.a.content)).toBe('A');
  });

  it('rejects invalid intermediate rich text inside a transaction', () => {
    const doc = withNode(createEmptyDoc({ title: 'Root', now: 0 }), 'a', 'A', 'root');
    const result = applyDocTransaction(
      doc,
      [
        {
          id: 'bad-content',
          type: 'updateContent',
          nodeId: 'a',
          content: { type: 'doc', content: [{ type: 'paragraph', text: 123 as unknown as string }] }
        },
        { id: 'good-content', type: 'updateContent', nodeId: 'a', content: createTextDoc('Recovered') }
      ],
      context
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_RICH_TEXT');
    expect(getPlainText(doc.nodes.a.content)).toBe('A');
  });

  it('validates runtime enum values loaded from JSON', () => {
    const doc = withNode(createEmptyDoc({ title: 'Root', now: 0 }), 'a', 'A', 'root');
    const invalid = structuredClone(doc);
    invalid.nodes.a.side = 'middle' as 'left';
    invalid.edges.edge = {
      id: 'edge',
      fromNodeId: 'root',
      toNodeId: 'a',
      style: 'wavy' as 'solid'
    };

    const validation = validateDoc(invalid);
    expect(validation.ok).toBe(false);
    expect(validation.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(['nodes.a.side', 'edges.edge.style']));
  });

  it('clones note patches before storing them in the document', () => {
    const doc = withNode(createEmptyDoc({ title: 'Root', now: 0 }), 'a', 'A', 'root');
    const note = createTextDoc('Original note');
    const result = applyDocOp(doc, { id: 'note-a', type: 'updateNodeMeta', nodeId: 'a', patch: { note } }, context);

    note.content![0].content![0].text = 'Mutated outside';

    expect(result.ok).toBe(true);
    expect(getPlainText(result.doc!.nodes.a.note!)).toBe('Original note');
  });

  it('undo of setCollapsed restores an absent collapsed field', () => {
    const doc = withNode(createEmptyDoc({ title: 'Root', now: 0 }), 'a', 'A', 'root');
    const collapsed = applyDocOp(doc, { id: 'collapse-a', type: 'setCollapsed', nodeId: 'a', collapsed: true }, context);

    const restored = applyDocTransaction(collapsed.doc!, collapsed.inverseOps!, { ...context, history: 'skip' });

    expect(restored.ok).toBe(true);
    expect('collapsed' in restored.doc!.nodes.a).toBe(false);
  });

  it('notifies scoped store subscribers only when their slice changes', () => {
    const doc = withNode(createEmptyDoc({ title: 'Root', now: 0 }), 'a', 'A', 'root');
    const store = createCoreStore(doc);
    const seen: string[] = [];

    const unsubscribe = store.subscribeNode('a', (node) => {
      seen.push(node ? getPlainText(node.content) : 'missing');
    });

    store.applyDocOp({ id: 'theme', type: 'setTheme', theme: 'mono' }, 'test');
    store.applyDocOp({ id: 'update-a', type: 'updateContent', nodeId: 'a', content: createTextDoc('Changed') }, 'test');
    unsubscribe();

    expect(seen).toEqual(['A', 'Changed']);
  });

  it('does not repeatedly notify child subscribers after a node is deleted', () => {
    const doc = withNode(createEmptyDoc({ title: 'Root', now: 0 }), 'a', 'A', 'root');
    const store = createCoreStore(doc);
    let notificationCount = 0;

    const unsubscribe = store.subscribeChildIds('a', () => {
      notificationCount += 1;
    });

    store.applyDocOp({ id: 'delete-a', type: 'deleteSubtree', nodeId: 'a' }, 'test');
    store.applyDocOp({ id: 'theme-1', type: 'setTheme', theme: 'mono' }, 'test');
    store.applyDocOp({ id: 'theme-2', type: 'setTheme', theme: 'default' }, 'test');
    unsubscribe();

    expect(notificationCount).toBe(2);
  });

  it('undoes a deleted subtree with grandchildren in original order', () => {
    let doc = createEmptyDoc({ title: 'Root', now: 0 });
    doc = withNode(doc, 'a', 'A', 'root');
    doc = withNode(doc, 'a1', 'A1', 'a');
    doc = withNode(doc, 'a2', 'A2', 'a');
    doc = withNode(doc, 'a1-x', 'A1X', 'a1');
    doc = withNode(doc, 'a1-y', 'A1Y', 'a1');
    doc = withNode(doc, 'b', 'B', 'root');

    const beforeIds = JSON.stringify({
      root: doc.nodes.root.childIds,
      a: doc.nodes.a.childIds,
      a1: doc.nodes.a1.childIds,
      a2: doc.nodes.a2.childIds
    });

    const deleted = applyDocOp(doc, { id: 'del-a', type: 'deleteSubtree', nodeId: 'a' }, context);
    expect(deleted.ok).toBe(true);
    expect(deleted.doc?.nodes.a).toBeUndefined();
    expect(deleted.doc?.nodes.root.childIds).toEqual(['b']);

    const restored = applyDocTransaction(deleted.doc!, deleted.inverseOps!, { ...context, history: 'skip' });
    expect(restored.ok).toBe(true);
    expect(validateDoc(restored.doc!).ok).toBe(true);
    expect(
      JSON.stringify({
        root: restored.doc!.nodes.root.childIds,
        a: restored.doc!.nodes.a.childIds,
        a1: restored.doc!.nodes.a1.childIds,
        a2: restored.doc!.nodes.a2.childIds
      })
    ).toBe(beforeIds);
  });

  it('reports a cycle once and skips the redundant unreachable issue', () => {
    const doc: Doc = {
      version: 1,
      rootId: 'root',
      theme: 'default',
      meta: { title: 't', createdAt: 0, updatedAt: 0 },
      edges: {},
      nodes: {
        root: { id: 'root', parentId: null, childIds: [], content: createTextDoc('Root') },
        a: { id: 'a', parentId: 'b', childIds: ['b'], content: createTextDoc('A') },
        b: { id: 'b', parentId: 'a', childIds: ['a'], content: createTextDoc('B') }
      }
    };

    const result = validateDoc(doc);
    expect(result.ok).toBe(false);
    const cycles = result.issues.filter((issue) => issue.code === 'CYCLE_DETECTED');
    const unreachable = result.issues.filter((issue) => issue.message === 'Node is not reachable from root');
    expect(cycles.map((issue) => issue.path).sort()).toEqual(['nodes.a.parentId', 'nodes.b.parentId']);
    expect(unreachable).toEqual([]);
  });

  it('repairDoc backfills missing childIds entries for orphan nodes', () => {
    const doc: Doc = {
      version: 1,
      rootId: 'root',
      theme: 'default',
      meta: { title: 't', createdAt: 0, updatedAt: 0 },
      edges: {},
      nodes: {
        root: { id: 'root', parentId: null, childIds: ['a'], content: createTextDoc('Root') },
        a: { id: 'a', parentId: 'root', childIds: [], content: createTextDoc('A') },
        // b's parentId points to root, but root.childIds forgot to list it
        b: { id: 'b', parentId: 'root', childIds: [], content: createTextDoc('B') }
      }
    };

    expect(validateDoc(doc).ok).toBe(false);

    const { doc: repaired, validation, repaired: log } = repairDoc(doc);
    expect(validation.ok).toBe(true);
    expect(repaired.nodes.root.childIds).toContain('b');
    expect(log.some((entry) => entry === 'nodes.root.childIds')).toBe(true);
  });
});

function withNode(doc: ReturnType<typeof createEmptyDoc>, id: string, label: string, parentId: string) {
  return applyDocOp(
    doc,
    {
      id: `insert-${id}`,
      type: 'insertNode',
      parentId,
      index: doc.nodes[parentId].childIds.length,
      node: { id, content: createTextDoc(label), side: parentId === doc.rootId ? 'right' : undefined }
    },
    context
  ).doc!;
}
