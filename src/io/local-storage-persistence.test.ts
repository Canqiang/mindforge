import { describe, expect, it, vi } from 'vitest';
import {
  applyDocOp,
  createCoreStore,
  createEmptyDoc,
  createTextDoc,
  getPlainText,
  type Doc
} from '../core';
import {
  clearStoredDoc,
  loadStoredDoc,
  persistDocSnapshot,
  subscribeStorePersistence,
  type PersistenceLogger,
  type PersistenceOptions
} from './local-storage-persistence';

function createMemoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { snapshot: () => Record<string, string> } {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
    snapshot: () => Object.fromEntries(data)
  };
}

function silentLogger(): PersistenceLogger {
  return { warn: vi.fn() };
}

function makeDoc(): Doc {
  const empty = createEmptyDoc({ title: 'Persisted', now: 0 });
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

describe('local-storage-persistence', () => {
  it('round-trips a doc through persist + load', () => {
    const storage = createMemoryStorage();
    const options: PersistenceOptions = { storage, logger: silentLogger() };

    persistDocSnapshot(makeDoc(), options);
    const restored = loadStoredDoc(options);

    expect(restored).not.toBeNull();
    expect(getPlainText(restored!.nodes.hello.content)).toBe('Hello');
  });

  it('returns null when storage is empty', () => {
    const storage = createMemoryStorage();
    expect(loadStoredDoc({ storage, logger: silentLogger() })).toBeNull();
  });

  it('rejects a stored doc whose schema version is not 1', () => {
    const storage = createMemoryStorage();
    const logger = silentLogger();
    const doc = makeDoc();
    storage.setItem('mindforge:doc:v1', JSON.stringify({ ...doc, version: 999 }));

    expect(loadStoredDoc({ storage, logger })).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('discards a stored doc that fails validation and cannot be repaired', () => {
    const storage = createMemoryStorage();
    const logger = silentLogger();
    const broken = makeDoc();
    storage.setItem('mindforge:doc:v1', JSON.stringify({ ...broken, rootId: 'ghost' }));

    expect(loadStoredDoc({ storage, logger })).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('auto-repairs drift in stored docs (orphan node missing from childIds)', () => {
    const storage = createMemoryStorage();
    const logger = silentLogger();
    const doc = makeDoc();
    // Drop hello from root.childIds while leaving its parentId pointed at root.
    const drifted: Doc = {
      ...doc,
      nodes: {
        ...doc.nodes,
        [doc.rootId]: { ...doc.nodes[doc.rootId], childIds: [] }
      }
    };
    storage.setItem('mindforge:doc:v1', JSON.stringify(drifted));

    const restored = loadStoredDoc({ storage, logger });
    expect(restored).not.toBeNull();
    expect(restored!.nodes[doc.rootId].childIds).toEqual(['hello']);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('auto-repaired'), expect.anything());
  });

  it('swallows a quota error from setItem without throwing', () => {
    const logger = silentLogger();
    const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      },
      removeItem: () => undefined
    };

    expect(() => persistDocSnapshot(makeDoc(), { storage, logger })).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('persist'), expect.any(Error));
  });

  it('debounces store subscription and persists once after the debounce window', async () => {
    vi.useFakeTimers();
    try {
      const storage = createMemoryStorage();
      const logger = silentLogger();
      const store = createCoreStore(makeDoc());
      const unsubscribe = subscribeStorePersistence(store, { storage, logger, debounceMs: 100 });

      store.applyDocOp(
        { id: 'op-1', type: 'updateContent', nodeId: 'hello', content: createTextDoc('First') },
        'test'
      );
      store.applyDocOp(
        { id: 'op-2', type: 'updateContent', nodeId: 'hello', content: createTextDoc('Second') },
        'test'
      );

      // Before debounce elapses: nothing persisted yet.
      expect(storage.snapshot()).toEqual({});

      vi.advanceTimersByTime(100);

      const persisted = JSON.parse(storage.snapshot()['mindforge:doc:v1']) as Doc;
      expect(getPlainText(persisted.nodes.hello.content)).toBe('Second');

      unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it('unsubscribe flushes a pending save synchronously', () => {
    vi.useFakeTimers();
    try {
      const storage = createMemoryStorage();
      const store = createCoreStore(makeDoc());
      const unsubscribe = subscribeStorePersistence(store, { storage, logger: silentLogger(), debounceMs: 5000 });

      store.applyDocOp(
        { id: 'op-flush', type: 'updateContent', nodeId: 'hello', content: createTextDoc('Flushed') },
        'test'
      );
      // Don't advance timers — the save is still pending.
      expect(storage.snapshot()).toEqual({});

      unsubscribe();
      const flushed = JSON.parse(storage.snapshot()['mindforge:doc:v1']) as Doc;
      expect(getPlainText(flushed.nodes.hello.content)).toBe('Flushed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('clearStoredDoc removes the entry', () => {
    const storage = createMemoryStorage();
    persistDocSnapshot(makeDoc(), { storage, logger: silentLogger() });
    expect(loadStoredDoc({ storage, logger: silentLogger() })).not.toBeNull();
    clearStoredDoc({ storage });
    expect(loadStoredDoc({ storage, logger: silentLogger() })).toBeNull();
  });
});
