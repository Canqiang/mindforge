import { describe, expect, it } from 'vitest';
import { applyDocOp, createEmptyDoc, createTextDoc, type Doc } from '../core';
import {
  exportDocToBlob,
  parseDocFromText,
  suggestDocFilename
} from './import-export';

function makeDoc(title = 'Round trip'): Doc {
  const empty = createEmptyDoc({ title, now: 0 });
  return applyDocOp(
    empty,
    {
      id: 'insert-hello',
      type: 'insertNode',
      parentId: empty.rootId,
      index: 0,
      node: { id: 'hello', content: createTextDoc('Hello'), side: 'right' }
    },
    { origin: 'test', timestamp: 0, history: 'skip' }
  ).doc!;
}

async function blobText(blob: Blob): Promise<string> {
  return blob.text();
}

describe('import-export', () => {
  it('round-trips a doc through exportDocToBlob → parseDocFromText', async () => {
    const original = makeDoc();
    const blob = exportDocToBlob(original);
    expect(blob.type).toBe('application/json');

    const text = await blobText(blob);
    const parsed = parseDocFromText(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.warnings).toEqual([]);
    expect(parsed.data.doc).toEqual(original);
  });

  it('suggestDocFilename slugifies the title and pins the .mindforge.json extension', () => {
    expect(suggestDocFilename(makeDoc('My Mind Map!!!'))).toBe('my-mind-map.mindforge.json');
    expect(suggestDocFilename(makeDoc(''))).toBe('mindforge.mindforge.json');
    expect(suggestDocFilename(makeDoc('中文 + emoji 🚀'))).toBe('emoji.mindforge.json');
  });

  it('rejects non-JSON input with a structured error', () => {
    const result = parseDocFromText('not json at all');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_JSON');
  });

  it('rejects JSON that does not look like a doc', () => {
    const result = parseDocFromText(JSON.stringify({ hello: 'world' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_DOC_SHAPE');
  });

  it('rejects an unsupported schema version', () => {
    const doc = makeDoc();
    const bumped = { ...doc, version: 999 };
    const result = parseDocFromText(JSON.stringify(bumped));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UNSUPPORTED_VERSION');
    if (result.error.code === 'UNSUPPORTED_VERSION') {
      expect(result.error.version).toBe(999);
    }
  });

  it('auto-repairs parent↔childIds drift on import and warns about it', () => {
    const doc = makeDoc();
    const drifted: Doc = {
      ...doc,
      nodes: {
        ...doc.nodes,
        [doc.rootId]: { ...doc.nodes[doc.rootId], childIds: [] }
      }
    };
    const result = parseDocFromText(JSON.stringify(drifted));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.doc.nodes[doc.rootId].childIds).toEqual(['hello']);
    expect(result.data.warnings.length).toBeGreaterThan(0);
  });

  it('rejects a doc that cannot be repaired (missing rootId target)', () => {
    const doc = makeDoc();
    const broken: Doc = { ...doc, rootId: 'ghost' };
    const result = parseDocFromText(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_DOC');
  });
});
