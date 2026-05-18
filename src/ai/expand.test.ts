import { describe, expect, it, vi } from 'vitest';
import { applyDocOp, createEmptyDoc, createTextDoc, type Doc } from '../core';
import { expandNode } from './expand';
import { AiProviderError, type AiProvider } from './providers/types';

function makeDoc(): Doc {
  const empty = createEmptyDoc({ title: 'Root', now: 0 });
  return applyDocOp(
    empty,
    {
      id: 'insert-a',
      type: 'insertNode',
      parentId: empty.rootId,
      index: 0,
      node: { id: 'a', content: createTextDoc('Renewable energy'), side: 'right' }
    },
    { origin: 'test', timestamp: 0, history: 'skip' }
  ).doc!;
}

function mockProvider(text: string): AiProvider {
  return {
    name: 'mock',
    generate: vi.fn(async () => ({ text }))
  };
}

function failingProvider(error: unknown): AiProvider {
  return {
    name: 'mock-fail',
    generate: vi.fn(async () => {
      throw error;
    })
  };
}

describe('expandNode', () => {
  it('generates insertNode ops for each title returned by the provider', async () => {
    const doc = makeDoc();
    const provider = mockProvider(JSON.stringify({ titles: ['Solar', 'Wind', 'Hydro'] }));

    const result = await expandNode(provider, { doc, nodeId: 'a', count: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.titles).toEqual(['Solar', 'Wind', 'Hydro']);
    expect(result.ops).toHaveLength(3);
    expect(result.ops[0]).toMatchObject({
      type: 'insertNode',
      parentId: 'a',
      index: 0
    });
    expect(result.ops[1]).toMatchObject({ index: 1, parentId: 'a' });
    expect(result.ops[2]).toMatchObject({ index: 2, parentId: 'a' });
    // Children of a non-root parent must not carry the `side` field.
    for (const op of result.ops) {
      if (op.type === 'insertNode') {
        expect(op.node.side).toBeUndefined();
      }
    }
  });

  it('alternates side="right" / "left" when expanding the root node', async () => {
    const doc = makeDoc();
    const provider = mockProvider(JSON.stringify({ titles: ['Alpha', 'Beta'] }));

    const result = await expandNode(provider, { doc, nodeId: doc.rootId, count: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sides = result.ops
      .filter((op) => op.type === 'insertNode')
      .map((op) => (op.type === 'insertNode' ? op.node.side : undefined));
    // Root already has child 'a' at index 0; next two land at indices 1 and 2.
    expect(sides).toEqual(['left', 'right']);
  });

  it('returns NODE_NOT_FOUND for a missing node', async () => {
    const doc = makeDoc();
    const provider = mockProvider('');
    const result = await expandNode(provider, { doc, nodeId: 'ghost' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NODE_NOT_FOUND');
  });

  it('returns NOT_JSON when the provider returns non-JSON text', async () => {
    const doc = makeDoc();
    const provider = mockProvider('hello world (not json)');
    const result = await expandNode(provider, { doc, nodeId: 'a' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_JSON');
  });

  it('returns BAD_RESPONSE when titles is missing or wrong shape', async () => {
    const doc = makeDoc();
    const provider = mockProvider(JSON.stringify({ items: ['x'] }));
    const result = await expandNode(provider, { doc, nodeId: 'a' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('BAD_RESPONSE');
  });

  it('returns NO_TITLES when the array is empty after filtering', async () => {
    const doc = makeDoc();
    const provider = mockProvider(JSON.stringify({ titles: ['', '   ', 42] }));
    const result = await expandNode(provider, { doc, nodeId: 'a' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NO_TITLES');
  });

  it('forwards PROVIDER_ERROR messages from the provider', async () => {
    const doc = makeDoc();
    const provider = failingProvider(new AiProviderError('Ollama is offline'));
    const result = await expandNode(provider, { doc, nodeId: 'a' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PROVIDER_ERROR');
    expect(result.error.message).toContain('Ollama is offline');
  });

  it('clamps count and truncates over-long titles', async () => {
    const doc = makeDoc();
    const longTitle = 'a'.repeat(200);
    const provider = mockProvider(JSON.stringify({ titles: [longTitle, 'short'] }));
    const result = await expandNode(provider, { doc, nodeId: 'a', count: 99 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.titles[0].length).toBeLessThanOrEqual(80);
    expect(result.titles[1]).toBe('short');
  });
});
