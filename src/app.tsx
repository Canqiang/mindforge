import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyDocOp, createCoreStore, createEmptyDoc, createTextDoc, validateDoc, type CoreStore, type Doc, type DocOperation, type NodeId, type RichText } from './core';
import type { EditorSurface, TextSelectionMirror } from './editor/selection';
import { computeSimpleMindMapLayout } from './layout';
import { OutlinePane } from './outline/OutlinePane';
import { SpikeCanvas } from './render/SpikeCanvas';

const APP_BOOT_STARTED_AT = performance.now();

interface AppRuntime {
  store: CoreStore;
  fixtureName: string;
}

export function App() {
  const [runtime, setRuntime] = useState<AppRuntime>(() => createRuntime(createSpikeDoc(), 'seed'));
  const opSeqRef = useRef(0);
  const mountStartRef = useRef(APP_BOOT_STARTED_AT);
  const [doc, setDoc] = useState(() => runtime.store.getDoc());
  const [selectionMirror, setSelectionMirror] = useState<TextSelectionMirror | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [benchmarkReady, setBenchmarkReady] = useState(false);
  const [mountMs, setMountMs] = useState(0);
  const [layoutMs, setLayoutMs] = useState(0);

  useEffect(() => {
    const fixtureName = getFixtureNameFromUrl();
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
        setRuntime(createRuntime(fixtureDoc, fixtureName));
        setDoc(fixtureDoc);
        setSelectionMirror(null);
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
  }, [doc]);

  const applyOperation = useCallback((op: DocOperation, origin: EditorSurface) => {
    const result = runtime.store.applyDocOp(op, origin);
    if (!result.ok || !result.doc) {
      setLastError(result.error ? `${result.error.code}: ${result.error.message}` : 'Unknown operation error');
      return;
    }

    setLastError(null);
    setDoc(result.doc);
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

  return (
    <main
      className="app-shell"
      data-fixture={runtime.fixtureName}
      data-node-count={Object.keys(doc.nodes).length}
      data-layout-ms={layoutMs.toFixed(2)}
      data-mount-ms={mountMs.toFixed(2)}
      data-benchmark-ready={benchmarkReady}
    >
      <OutlinePane
        doc={doc}
        mirroredSelection={selectionMirror}
        onContentChange={handleContentChange}
        onSelectionChange={setSelectionMirror}
      />
      <section className="canvas-pane">
        <SpikeCanvas
          doc={doc}
          layout={layout}
          mirroredSelection={selectionMirror}
          onContentChange={handleContentChange}
          onSelectionChange={setSelectionMirror}
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

function createRuntime(doc: Doc, fixtureName: string): AppRuntime {
  return {
    store: createCoreStore(doc),
    fixtureName
  };
}

function getFixtureNameFromUrl(): string | null {
  const fixtureName = new URLSearchParams(window.location.search).get('fixture');
  if (!fixtureName) {
    return null;
  }
  if (!/^[a-z0-9-]+$/.test(fixtureName)) {
    throw new Error(`Invalid fixture name: ${fixtureName}`);
  }
  return fixtureName;
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

function createSpikeDoc(): Doc {
  const now = Date.now();
  let doc = createEmptyDoc({
    title: 'MindForge spike',
    children: ['Outline sync', 'DOM + SVG render', 'Selection bridge'],
    now
  });

  doc = insertChild(doc, 'outline-content', 'Shared ProseMirror JSON', 'node-1', now);
  doc = insertChild(doc, 'outline-selection', 'Node-local cursor range', 'node-1', now);
  doc = insertChild(doc, 'render-pan-zoom', 'Pan and zoom surface', 'node-2', now);
  doc = insertChild(doc, 'bridge-ime', 'IME composition guard', 'node-3', now);
  return doc;
}

function insertChild(doc: Doc, id: NodeId, title: string, parentId: NodeId, timestamp: number): Doc {
  const result = applyDocOp(
    doc,
    {
      id: `seed:${id}`,
      type: 'insertNode',
      parentId,
      index: doc.nodes[parentId].childIds.length,
      node: {
        id,
        content: createTextDoc(title)
      }
    },
    { origin: 'test', timestamp, history: 'skip' }
  );

  if (!result.ok || !result.doc) {
    throw new Error(result.error?.message ?? `Failed to seed node ${id}`);
  }
  return result.doc;
}
