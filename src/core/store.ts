import { createStore } from 'zustand/vanilla';
import { applyDocTransaction } from './operations';
import type { ApplyResult, Doc, DocOperation, MindNode, NodeId, OpOrigin, Unsubscribe } from './types';
import { validateDoc } from './validation';

const EMPTY_CHILD_IDS: NodeId[] = [];

interface HistoryEntry {
  label: string;
  origin: OpOrigin;
  ops: DocOperation[];
  inverseOps: DocOperation[];
  timestamp: number;
}

interface CoreStoreState {
  doc: Doc;
  revision: number;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

export interface CoreStore {
  getDoc(): Doc;
  applyDocOp(op: DocOperation, origin: OpOrigin): ApplyResult;
  applyDocTransaction(ops: DocOperation[], origin: OpOrigin): ApplyResult;
  undo(scope?: 'local' | 'global'): ApplyResult;
  redo(scope?: 'local' | 'global'): ApplyResult;
  subscribeNode(id: NodeId, fn: (node: MindNode | undefined) => void): Unsubscribe;
  subscribeChildIds(id: NodeId, fn: (childIds: NodeId[]) => void): Unsubscribe;
}

export function createCoreStore(initialDoc: Doc): CoreStore {
  const initialValidation = validateDoc(initialDoc);
  if (!initialValidation.ok) {
    throw new Error(
      `createCoreStore: initial doc is invalid: ${initialValidation.issues[0]?.path ?? 'unknown'}`
    );
  }

  const store = createStore<CoreStoreState>(() => ({
    doc: initialDoc,
    revision: 0,
    undoStack: [],
    redoStack: []
  }));

  const applyTransaction = (ops: DocOperation[], origin: OpOrigin, recordHistory: boolean): ApplyResult => {
    const state = store.getState();
    const timestamp = Date.now();
    const result = applyDocTransaction(
      state.doc,
      ops,
      {
        origin,
        timestamp,
        history: recordHistory ? 'record' : 'skip'
      },
      { skipInputValidation: true }
    );

    if (!result.ok || !result.doc || !result.inverseOps) {
      return result;
    }

    const entry: HistoryEntry = {
      label: ops.at(-1)?.type ?? 'transaction',
      origin,
      ops,
      inverseOps: result.inverseOps,
      timestamp
    };

    store.setState((current) => ({
      doc: result.doc!,
      revision: current.revision + 1,
      undoStack: recordHistory ? [...current.undoStack, entry] : current.undoStack,
      redoStack: recordHistory ? [] : current.redoStack
    }));

    return result;
  };

  return {
    getDoc() {
      return store.getState().doc;
    },
    applyDocOp(op, origin) {
      return applyTransaction([op], origin, true);
    },
    applyDocTransaction(ops, origin) {
      return applyTransaction(ops, origin, true);
    },
    undo() {
      const state = store.getState();
      const entry = state.undoStack.at(-1);
      if (!entry) {
        return { ok: true, doc: state.doc, inverseOps: [] };
      }

      const result = applyDocTransaction(
        state.doc,
        entry.inverseOps,
        {
          origin: 'history',
          timestamp: Date.now(),
          history: 'skip'
        },
        { skipInputValidation: true }
      );

      if (!result.ok || !result.doc) {
        return result;
      }

      store.setState((current) => ({
        doc: result.doc!,
        revision: current.revision + 1,
        undoStack: current.undoStack.slice(0, -1),
        redoStack: [...current.redoStack, entry]
      }));

      return result;
    },
    redo() {
      const state = store.getState();
      const entry = state.redoStack.at(-1);
      if (!entry) {
        return { ok: true, doc: state.doc, inverseOps: [] };
      }

      const result = applyDocTransaction(
        state.doc,
        entry.ops,
        {
          origin: 'history',
          timestamp: Date.now(),
          history: 'skip'
        },
        { skipInputValidation: true }
      );

      if (!result.ok || !result.doc) {
        return result;
      }

      store.setState((current) => ({
        doc: result.doc!,
        revision: current.revision + 1,
        undoStack: [...current.undoStack, entry],
        redoStack: current.redoStack.slice(0, -1)
      }));

      return result;
    },
    subscribeNode(id, fn) {
      let previous = store.getState().doc.nodes[id];
      fn(previous);
      return store.subscribe((state) => {
        const next = state.doc.nodes[id];
        if (next !== previous) {
          previous = next;
          fn(next);
        }
      });
    },
    subscribeChildIds(id, fn) {
      let previous = store.getState().doc.nodes[id]?.childIds ?? EMPTY_CHILD_IDS;
      fn(previous);
      return store.subscribe((state) => {
        const next = state.doc.nodes[id]?.childIds ?? EMPTY_CHILD_IDS;
        if (next !== previous) {
          previous = next;
          fn(next);
        }
      });
    }
  };
}
