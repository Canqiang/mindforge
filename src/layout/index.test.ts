import { describe, expect, it } from 'vitest';
import { applyDocOp, createEmptyDoc, createTextDoc, type Doc, type NodeId } from '../core';
import { computeSimpleMindMapLayout, type MeasuredNode } from './index';

const context = { origin: 'test' as const, timestamp: 0, history: 'skip' as const };

function withNode(doc: Doc, id: NodeId, label: string, parentId: NodeId): Doc {
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

function setCollapsed(doc: Doc, nodeId: NodeId): Doc {
  return applyDocOp(
    doc,
    { id: `collapse-${nodeId}`, type: 'setCollapsed', nodeId, collapsed: true },
    context
  ).doc!;
}

function defaultMeasures(doc: Doc): Record<NodeId, MeasuredNode> {
  return Object.fromEntries(
    Object.keys(doc.nodes).map((id) => [id, { width: 180, height: 56 }])
  );
}

describe('computeSimpleMindMapLayout', () => {
  it('lays out a small tree with one node per level', () => {
    let doc = createEmptyDoc({ title: 'Root', now: 0 });
    doc = withNode(doc, 'a', 'A', 'root');
    doc = withNode(doc, 'a1', 'A1', 'a');

    const result = computeSimpleMindMapLayout({ doc, measuredNodes: defaultMeasures(doc) });

    expect(Object.keys(result.nodes).sort()).toEqual(['a', 'a1', 'root']);
    expect(result.edges.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual([
      'a->a1',
      'root->a'
    ]);
  });

  it('skips descendants of a collapsed node and prunes their edges', () => {
    let doc = createEmptyDoc({ title: 'Root', now: 0 });
    doc = withNode(doc, 'a', 'A', 'root');
    doc = withNode(doc, 'a1', 'A1', 'a');
    doc = withNode(doc, 'a2', 'A2', 'a');
    doc = withNode(doc, 'a1-x', 'A1X', 'a1');
    doc = setCollapsed(doc, 'a');

    const result = computeSimpleMindMapLayout({ doc, measuredNodes: defaultMeasures(doc) });

    // root and the collapsed node itself are placed; their descendants are not.
    expect(Object.keys(result.nodes).sort()).toEqual(['a', 'root']);
    expect(result.edges.map((edge) => `${edge.from}->${edge.to}`)).toEqual(['root->a']);
  });

  it('shows siblings of a collapsed branch unaffected', () => {
    let doc = createEmptyDoc({ title: 'Root', now: 0 });
    doc = withNode(doc, 'a', 'A', 'root');
    doc = withNode(doc, 'b', 'B', 'root');
    doc = withNode(doc, 'a1', 'A1', 'a');
    doc = withNode(doc, 'b1', 'B1', 'b');
    doc = setCollapsed(doc, 'a');

    const result = computeSimpleMindMapLayout({ doc, measuredNodes: defaultMeasures(doc) });

    expect(Object.keys(result.nodes).sort()).toEqual(['a', 'b', 'b1', 'root']);
    expect(result.edges.find((edge) => edge.from === 'b' && edge.to === 'b1')).toBeTruthy();
    expect(result.edges.find((edge) => edge.from === 'a' && edge.to === 'a1')).toBeUndefined();
  });
});
