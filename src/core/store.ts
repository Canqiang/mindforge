import { createStore } from 'zustand/vanilla';
import { applyDocTransaction } from './operations';
import type { ApplyResult, Doc, DocOperation, MindNode, NodeId, OpOrigin, Unsubscribe } from './types';
import { validateDoc } from './validation';

const EMPTY_CHILD_IDS: NodeId[] = Object.freeze([] as NodeId[]) as NodeId[];

/**
 * Window in milliseconds within which two consecutive updateContent ops on
 * the same node from the same origin are collapsed into a single history
 * entry. Picked to feel like "one logical edit" — a sentence, a word — not
 * a single keystroke. Pause longer than this and the next edit becomes its
 * own undo step.
 */
const MERGE_WINDOW_MS = 600;

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
  /**
   * Bumped on every apply whose ops touch anything other than a single
   * node's rich-text content — insertNode, deleteSubtree, moveNode,
   * setCollapsed, updateNodeMeta, setTheme, every free-edge op, plus
   * undo / redo. App-level subscribers use this as their useMemo /
   * useSyncExternalStore key so they re-render only when something
   * the layout, the outline shape, or the document chrome cares about
   * changed — content-only edits flow through subscribeNode instead.
   */
  structureRevision: number;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  /**
   * Set to true after every undo / redo so the next normal apply forces a
   * fresh history entry instead of merging with the entry the user just
   * stepped through. Cleared after the next apply that records history.
   */
  blockMerge: boolean;
}

export interface CoreStore {
  getDoc(): Doc;
  /**
   * Subscribe to any doc mutation. The callback receives no arguments; call
   * `getDoc()` to read the current snapshot. Designed for `useSyncExternalStore`
   * style consumption — does NOT fire on subscribe.
   */
  subscribe(fn: () => void): Unsubscribe;
  /**
   * Subscribe ONLY to structure / non-content mutations. Content-only
   * keystrokes (single-node updateContent ops) won't fire this callback,
   * so an App-level subscriber doesn't re-render on every character. Pair
   * with `getStructureRevision` for `useSyncExternalStore`.
   */
  subscribeStructure(fn: () => void): Unsubscribe;
  getStructureRevision(): number;
  /**
   * Synchronous read of whether an entry is available on the undo / redo
   * stack. Both flip together with `doc` identity on every successful apply,
   * so a consumer subscribed via `subscribe` can recompute them inline.
   */
  canUndo(): boolean;
  canRedo(): boolean;
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
    structureRevision: 0,
    undoStack: [],
    redoStack: [],
    blockMerge: false
  }));

  const opsAffectStructure = (ops: DocOperation[]): boolean =>
    ops.some((op) => op.type !== 'updateContent');

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

    const structural = opsAffectStructure(ops);

    store.setState((current) => {
      if (!recordHistory) {
        return {
          ...current,
          doc: result.doc!,
          revision: current.revision + 1,
          structureRevision: structural ? current.structureRevision + 1 : current.structureRevision
        };
      }
      const previous = current.blockMerge ? undefined : current.undoStack.at(-1);
      const merged = mergeContinuousUpdateContent(previous, entry);
      const nextUndoStack = merged
        ? [...current.undoStack.slice(0, -1), merged]
        : [...current.undoStack, entry];
      return {
        ...current,
        doc: result.doc!,
        revision: current.revision + 1,
        structureRevision: structural ? current.structureRevision + 1 : current.structureRevision,
        undoStack: nextUndoStack,
        redoStack: [],
        blockMerge: false
      };
    });

    return result;
  };

  return {
    getDoc() {
      return store.getState().doc;
    },
    subscribe(fn) {
      return store.subscribe((state, prev) => {
        if (state.doc !== prev.doc) {
          fn();
        }
      });
    },
    subscribeStructure(fn) {
      return store.subscribe((state, prev) => {
        if (state.structureRevision !== prev.structureRevision) {
          fn();
        }
      });
    },
    getStructureRevision() {
      return store.getState().structureRevision;
    },
    canUndo() {
      return store.getState().undoStack.length > 0;
    },
    canRedo() {
      return store.getState().redoStack.length > 0;
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

      const undoStructural = opsAffectStructure(entry.inverseOps);
      store.setState((current) => ({
        ...current,
        doc: result.doc!,
        revision: current.revision + 1,
        structureRevision: undoStructural ? current.structureRevision + 1 : current.structureRevision,
        undoStack: current.undoStack.slice(0, -1),
        redoStack: [...current.redoStack, entry],
        blockMerge: true
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

      const redoStructural = opsAffectStructure(entry.ops);
      store.setState((current) => ({
        ...current,
        doc: result.doc!,
        revision: current.revision + 1,
        structureRevision: redoStructural ? current.structureRevision + 1 : current.structureRevision,
        undoStack: [...current.undoStack, entry],
        redoStack: current.redoStack.slice(0, -1),
        blockMerge: true
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

/**
 * Coalesce a fresh updateContent entry with the immediately preceding entry
 * when they target the same node from the same origin within MERGE_WINDOW_MS.
 *
 * The merged entry keeps the EARLIEST inverse so a single Cmd-Z undoes the
 * whole burst, and adopts the LATEST forward op so redo / debug labels point
 * at the most recent state. Returns null when nothing should merge.
 */
function mergeContinuousUpdateContent(
  previous: HistoryEntry | undefined,
  incoming: HistoryEntry
): HistoryEntry | null {
  if (!previous) return null;
  if (previous.origin !== incoming.origin) return null;
  if (incoming.timestamp - previous.timestamp > MERGE_WINDOW_MS) return null;
  if (previous.ops.length !== 1 || incoming.ops.length !== 1) return null;
  const prevOp = previous.ops[0];
  const newOp = incoming.ops[0];
  if (prevOp.type !== 'updateContent' || newOp.type !== 'updateContent') return null;
  if (prevOp.nodeId !== newOp.nodeId) return null;
  return {
    label: incoming.label,
    origin: incoming.origin,
    ops: [newOp],
    inverseOps: previous.inverseOps,
    timestamp: incoming.timestamp
  };
}
