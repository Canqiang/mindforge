import { useCallback, useMemo, useRef, useState } from 'react';
import { applyDocOp, createCoreStore, createEmptyDoc, createTextDoc, type Doc, type DocOperation, type NodeId, type RichText } from './core';
import type { EditorSurface, TextSelectionMirror } from './editor/selection';
import { computeSimpleMindMapLayout } from './layout';
import { OutlinePane } from './outline/OutlinePane';
import { SpikeCanvas } from './render/SpikeCanvas';

export function App() {
  const [store] = useState(() => createCoreStore(createSpikeDoc()));
  const opSeqRef = useRef(0);
  const [doc, setDoc] = useState(() => store.getDoc());
  const [selectionMirror, setSelectionMirror] = useState<TextSelectionMirror | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeSimpleMindMapLayout({
        doc,
        measuredNodes: Object.fromEntries(
          Object.keys(doc.nodes).map((id) => [id, { width: id === doc.rootId ? 240 : 200, height: 64 }])
        )
      }),
    [doc]
  );

  const applyOperation = useCallback((op: DocOperation, origin: EditorSurface) => {
    const result = store.applyDocOp(op, origin);
    if (!result.ok || !result.doc) {
      setLastError(result.error ? `${result.error.code}: ${result.error.message}` : 'Unknown operation error');
      return;
    }

    setLastError(null);
    setDoc(result.doc);
  }, [store]);

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
    <main className="app-shell">
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
