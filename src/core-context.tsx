import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { CoreStore, MindNode, NodeId } from './core';

const CoreStoreContext = createContext<CoreStore | null>(null);

interface CoreStoreProviderProps {
  store: CoreStore;
  children: ReactNode;
}

export function CoreStoreProvider({ store, children }: CoreStoreProviderProps) {
  return <CoreStoreContext.Provider value={store}>{children}</CoreStoreContext.Provider>;
}

export function useCoreStore(): CoreStore {
  const store = useContext(CoreStoreContext);
  if (!store) {
    throw new Error('useCoreStore must be used inside a <CoreStoreProvider>.');
  }
  return store;
}

/**
 * Subscribe a component to a single node's slice. Re-renders only when that
 * node's identity in the doc changes (immer's structural sharing means
 * unrelated content edits never trigger this hook). Returns undefined when
 * the node has been deleted.
 */
export function useNode(nodeId: NodeId): MindNode | undefined {
  const store = useCoreStore();
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeNode(nodeId, () => listener()),
    [store, nodeId]
  );
  const getSnapshot = useCallback(() => store.getDoc().nodes[nodeId], [store, nodeId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Subscribe to the structureRevision — fires on structural / non-content
 * ops only. App-level layout, outline flatten, and chrome use this so a
 * keystroke inside a single node doesn't re-run any O(N) work.
 */
export function useStructureRevision(): number {
  const store = useCoreStore();
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeStructure(listener),
    [store]
  );
  const getSnapshot = useCallback(() => store.getStructureRevision(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Watch a boolean derived from the store. Subscribes to every apply but
 * `useSyncExternalStore` re-renders only when the boolean flips, so the
 * App's Undo / Redo buttons update without a full content-edit re-render.
 */
function useBooleanDerivative(read: (store: CoreStore) => boolean): boolean {
  const store = useCoreStore();
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => read(store), [store, read]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

const readCanUndo = (store: CoreStore) => store.canUndo();
const readCanRedo = (store: CoreStore) => store.canRedo();

export function useCanUndo(): boolean {
  return useBooleanDerivative(readCanUndo);
}

export function useCanRedo(): boolean {
  return useBooleanDerivative(readCanRedo);
}
