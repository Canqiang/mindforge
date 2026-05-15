import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createCoreStore, createTextDoc, validateDoc, type CoreStore, type Doc, type DocOperation, type NodeId, type RichText } from './core';
import type { StructuralKeyEvent } from './editor/NodeEditor';
import type { EditorSurface, TextSelectionMirror } from './editor/selection';
import { loadStoredDoc, subscribeStorePersistence } from './io';
import { computeSimpleMindMapLayout } from './layout';
import { OutlinePane } from './outline/OutlinePane';
import { SpikeCanvas } from './render/SpikeCanvas';
import { createSpikeDoc } from './spike-seed';
import { resolveTheme } from './theme/themes';

const APP_BOOT_STARTED_AT = performance.now();

interface AppRuntime {
  store: CoreStore;
  fixtureName: string;
  /**
   * Fixtures are read-only benchmark snapshots — we never persist them to
   * localStorage and never restore a fixture across reloads. The user's
   * actual document is the one stored under the normal key.
   */
  isFixture: boolean;
}

type ActiveEditors = Record<EditorSurface, NodeId | null>;

export function App() {
  const [runtime, setRuntime] = useState<AppRuntime>(createInitialRuntime);
  const opSeqRef = useRef(0);
  const mountStartRef = useRef(APP_BOOT_STARTED_AT);
  const subscribeStore = useCallback(
    (listener: () => void) => runtime.store.subscribe(listener),
    [runtime.store]
  );
  const getDocSnapshot = useCallback(() => runtime.store.getDoc(), [runtime.store]);
  const doc = useSyncExternalStore(subscribeStore, getDocSnapshot);
  const [selectionMirror, setSelectionMirror] = useState<TextSelectionMirror | null>(null);
  const [activeEditors, setActiveEditors] = useState<ActiveEditors>({ outline: null, canvas: null });
  const [lastError, setLastError] = useState<string | null>(null);
  const [benchmarkReady, setBenchmarkReady] = useState(false);
  const [canvasViewportMeasured, setCanvasViewportMeasured] = useState(false);
  const [mountMs, setMountMs] = useState(0);
  const [layoutMs, setLayoutMs] = useState(0);

  useEffect(() => {
    const fixtureName = safeGetFixtureNameFromUrl();
    if (!fixtureName) {
      return;
    }

    let cancelled = false;
    void loadFixtureDoc(fixtureName)
      .then((fixtureDoc) => {
        if (cancelled) {
          return;
        }
        mountStartRef.current = performance.now();
        setBenchmarkReady(false);
        setRuntime({ store: createCoreStore(fixtureDoc), fixtureName, isFixture: true });
        setSelectionMirror(null);
        setActiveEditors({ outline: null, canvas: null });
        setLastError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLastError(error instanceof Error ? error.message : 'Failed to load fixture');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (runtime.isFixture) {
      return;
    }
    // Cleanup flushes the pending debounced save synchronously so a tab
    // close / route change doesn't lose the last keystroke.
    return subscribeStorePersistence(runtime.store);
  }, [runtime]);

  const theme = resolveTheme(doc.theme);
  const canUndo = runtime.store.canUndo();
  const canRedo = runtime.store.canRedo();
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previous = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = theme;
    return () => {
      // Restore the previous theme attribute on unmount so dev hot-reloads
      // don't leave a stale value on document.documentElement.
      if (previous === undefined) {
        delete document.documentElement.dataset.theme;
      } else {
        document.documentElement.dataset.theme = previous;
      }
    };
  }, [theme]);

  const measuredNodes = useMemo(
    () => Object.fromEntries(Object.keys(doc.nodes).map((id) => [id, { width: id === doc.rootId ? 240 : 200, height: 64 }])),
    [doc]
  );

  const layout = useMemo(
    () =>
      computeSimpleMindMapLayout({
        doc,
        measuredNodes
      }),
    [doc, measuredNodes]
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const startedAt = performance.now();
      computeSimpleMindMapLayout({
        doc,
        measuredNodes
      });
      setLayoutMs(performance.now() - startedAt);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [doc, measuredNodes]);

  useEffect(() => {
    setBenchmarkReady(false);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setMountMs(performance.now() - mountStartRef.current);
        setBenchmarkReady(true);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [runtime.fixtureName]);

  const applyOperation = useCallback((op: DocOperation, origin: EditorSurface) => {
    const result = runtime.store.applyDocOp(op, origin);
    if (!result.ok || !result.doc) {
      setLastError(result.error ? `${result.error.code}: ${result.error.message}` : 'Unknown operation error');
      return;
    }
    setLastError(null);
  }, [runtime.store]);

  const handleContentChange = useCallback(
    (nodeId: NodeId, content: RichText, surface: EditorSurface) => {
      opSeqRef.current += 1;
      applyOperation(
        {
          id: `${surface}:content:${nodeId}:${opSeqRef.current}`,
          type: 'updateContent',
          nodeId,
          content
        },
        surface
      );
    },
    [applyOperation]
  );

  const handleActivateEditor = useCallback((surface: EditorSurface, nodeId: NodeId) => {
    setActiveEditors((current) => (current[surface] === nodeId ? current : { ...current, [surface]: nodeId }));
  }, []);

  const handleSelectionChange = useCallback((selection: TextSelectionMirror) => {
    setSelectionMirror(selection);
    const mirrorSurface: EditorSurface = selection.origin === 'canvas' ? 'outline' : 'canvas';
    setActiveEditors((current) =>
      current[mirrorSurface] === selection.nodeId ? current : { ...current, [mirrorSurface]: selection.nodeId }
    );
  }, []);

  const handleCanvasViewportMeasured = useCallback(() => {
    setCanvasViewportMeasured(true);
  }, []);

  const handleToggleCollapsed = useCallback(
    (nodeId: NodeId, next: boolean) => {
      opSeqRef.current += 1;
      applyOperation(
        {
          id: `collapse:${nodeId}:${opSeqRef.current}`,
          type: 'setCollapsed',
          nodeId,
          collapsed: next ? true : undefined
        },
        'outline'
      );
    },
    [applyOperation]
  );

  const handleSelectTheme = useCallback(
    (themeId: string) => {
      opSeqRef.current += 1;
      applyOperation(
        { id: `theme:${themeId}:${opSeqRef.current}`, type: 'setTheme', theme: themeId },
        'canvas'
      );
    },
    [applyOperation]
  );

  const handleStructuralKey = useCallback(
    (event: StructuralKeyEvent) => {
      const { nodeId, surface, kind } = event;
      const currentDoc = runtime.store.getDoc();
      const node = currentDoc.nodes[nodeId];
      if (!node) return;

      if (kind === 'enter') {
        const newId = generateNodeId();
        let parentId: NodeId;
        let insertIndex: number;
        if (nodeId === currentDoc.rootId) {
          parentId = nodeId;
          insertIndex = node.childIds.length;
        } else {
          parentId = node.parentId as NodeId;
          const parent = currentDoc.nodes[parentId];
          insertIndex = parent.childIds.indexOf(nodeId) + 1;
        }

        opSeqRef.current += 1;
        applyOperation(
          {
            id: `enter:${newId}:${opSeqRef.current}`,
            type: 'insertNode',
            parentId,
            index: insertIndex,
            node: {
              id: newId,
              content: createTextDoc(''),
              side: parentId === currentDoc.rootId ? (insertIndex % 2 === 0 ? 'right' : 'left') : undefined
            }
          },
          surface
        );
        setActiveEditors((current) => ({ ...current, [surface]: newId }));
        return;
      }

      if (kind === 'tab') {
        if (nodeId === currentDoc.rootId || !node.parentId) return;
        const parent = currentDoc.nodes[node.parentId];
        const index = parent.childIds.indexOf(nodeId);
        if (index <= 0) return;
        const prevSiblingId = parent.childIds[index - 1];
        const prevSibling = currentDoc.nodes[prevSiblingId];
        opSeqRef.current += 1;
        applyOperation(
          {
            id: `tab:${nodeId}:${opSeqRef.current}`,
            type: 'moveNode',
            nodeId,
            newParentId: prevSiblingId,
            index: prevSibling.childIds.length
          },
          surface
        );
        return;
      }

      if (kind === 'shift-tab') {
        if (nodeId === currentDoc.rootId || !node.parentId) return;
        const parentId = node.parentId;
        const parent = currentDoc.nodes[parentId];
        if (parent.parentId === null) return;
        const grandparentId = parent.parentId;
        const grandparent = currentDoc.nodes[grandparentId];
        const parentIndex = grandparent.childIds.indexOf(parentId);
        opSeqRef.current += 1;
        applyOperation(
          {
            id: `shift-tab:${nodeId}:${opSeqRef.current}`,
            type: 'moveNode',
            nodeId,
            newParentId: grandparentId,
            index: parentIndex + 1
          },
          surface
        );
        return;
      }

      if (kind === 'backspace-empty') {
        if (nodeId === currentDoc.rootId) return;
        if (node.childIds.length > 0) return;
        if (!node.parentId) return;
        const parent = currentDoc.nodes[node.parentId];
        const index = parent.childIds.indexOf(nodeId);
        const focusTarget = index > 0 ? parent.childIds[index - 1] : parent.id;
        opSeqRef.current += 1;
        applyOperation(
          {
            id: `backspace:${nodeId}:${opSeqRef.current}`,
            type: 'deleteSubtree',
            nodeId
          },
          surface
        );
        setActiveEditors((current) => ({ ...current, [surface]: focusTarget }));
      }
    },
    [applyOperation, runtime.store]
  );

  const handleUndo = useCallback(() => {
    const result = runtime.store.undo();
    if (!result.ok) {
      setLastError(result.error ? `${result.error.code}: ${result.error.message}` : 'Undo failed');
    }
  }, [runtime.store]);

  const handleRedo = useCallback(() => {
    const result = runtime.store.redo();
    if (!result.ok) {
      setLastError(result.error ? `${result.error.code}: ${result.error.message}` : 'Redo failed');
    }
  }, [runtime.store]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Cmd (macOS) or Ctrl (others) only. Reject events where neither is set,
      // and reject events with the other modifier as well (e.g. plain Z without
      // any modifier should still type 'z' inside a focused editor).
      const isPrimary = event.metaKey !== event.ctrlKey;
      if (!isPrimary) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (key === 'y' && !event.shiftKey) {
        // Windows-style redo. macOS hotkey is Cmd-Shift-Z handled above.
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  return (
    <main
      className="app-shell"
      data-fixture={runtime.fixtureName}
      data-node-count={Object.keys(doc.nodes).length}
      data-layout-ms={layoutMs.toFixed(2)}
      data-mount-ms={mountMs.toFixed(2)}
      data-benchmark-ready={benchmarkReady && canvasViewportMeasured}
    >
      <OutlinePane
        doc={doc}
        activeNodeId={activeEditors.outline}
        mirroredSelection={selectionMirror}
        onActivateEditor={handleActivateEditor}
        onContentChange={handleContentChange}
        onSelectionChange={handleSelectionChange}
        onToggleCollapsed={handleToggleCollapsed}
        onStructuralKey={handleStructuralKey}
      />
      <section className="canvas-pane">
        <SpikeCanvas
          doc={doc}
          layout={layout}
          activeNodeId={activeEditors.canvas}
          mirroredSelection={selectionMirror}
          theme={theme}
          canUndo={canUndo}
          canRedo={canRedo}
          onActivateEditor={handleActivateEditor}
          onContentChange={handleContentChange}
          onSelectionChange={handleSelectionChange}
          onToggleCollapsed={handleToggleCollapsed}
          onSelectTheme={handleSelectTheme}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onStructuralKey={handleStructuralKey}
          onViewportMeasured={handleCanvasViewportMeasured}
        />
      </section>
      {lastError ? (
        <div className="operation-error" role="status">
          {lastError}
        </div>
      ) : null}
    </main>
  );
}

function createInitialRuntime(): AppRuntime {
  // If we'll be loading a fixture, seed a throwaway doc — the fixture
  // useEffect will swap the store. We deliberately do NOT auto-restore the
  // stored doc in this case, so opening ?fixture=balanced-1000 in a new tab
  // never shows the user's real document.
  const fixtureName = safeGetFixtureNameFromUrl();
  if (fixtureName) {
    return { store: createCoreStore(createSpikeDoc()), fixtureName: 'seed', isFixture: false };
  }

  const stored = loadStoredDoc();
  if (stored) {
    return { store: createCoreStore(stored), fixtureName: 'stored', isFixture: false };
  }
  return { store: createCoreStore(createSpikeDoc()), fixtureName: 'seed', isFixture: false };
}

function safeGetFixtureNameFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('fixture');
  if (!raw) return null;
  // Reject anything that isn't a safe fixture slug — don't throw, just
  // ignore it so a bad URL can't break initial render.
  return /^[a-z0-9-]+$/.test(raw) ? raw : null;
}

function generateNodeId(): NodeId {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `n-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `n-${Math.random().toString(36).slice(2, 10)}`;
}

async function loadFixtureDoc(fixtureName: string): Promise<Doc> {
  const response = await fetch(`/examples/benchmark/${fixtureName}.json`);
  if (!response.ok) {
    throw new Error(`Failed to load fixture "${fixtureName}" (${response.status})`);
  }

  const doc = (await response.json()) as Doc;
  const validation = validateDoc(doc);
  if (!validation.ok) {
    throw new Error(`Fixture "${fixtureName}" failed validation: ${validation.issues[0]?.path ?? 'unknown'}`);
  }
  return doc;
}

