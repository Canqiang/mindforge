import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createCoreStore, validateDoc, type CoreStore, type Doc, type DocOperation, type NodeId, type RichText } from './core';
import type { EditorSurface, TextSelectionMirror } from './editor/selection';
import { loadStoredDoc, subscribeStorePersistence } from './io';
import { computeSimpleMindMapLayout } from './layout';
import { OutlinePane } from './outline/OutlinePane';
import { SpikeCanvas } from './render/SpikeCanvas';
import { createSpikeDoc } from './spike-seed';

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
      />
      <section className="canvas-pane">
        <SpikeCanvas
          doc={doc}
          layout={layout}
          activeNodeId={activeEditors.canvas}
          mirroredSelection={selectionMirror}
          onActivateEditor={handleActivateEditor}
          onContentChange={handleContentChange}
          onSelectionChange={handleSelectionChange}
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

