import { createEmptyDoc } from './core';
import { computeSimpleMindMapLayout } from './layout';
import { SpikeCanvas } from './render/SpikeCanvas';

const doc = createEmptyDoc({
  title: 'MindForge spike',
  children: ['Outline sync', 'DOM + SVG render', 'Core operation boundary']
});

const layout = computeSimpleMindMapLayout({
  doc,
  measuredNodes: Object.fromEntries(
    Object.keys(doc.nodes).map((id) => [id, { width: id === doc.rootId ? 220 : 180, height: 56 }])
  )
});

export function App() {
  return (
    <main className="app-shell">
      <aside className="outline-pane">
        <div className="pane-label">Spike outline placeholder</div>
        <h1>{doc.meta.title}</h1>
        <ol>
          {doc.nodes[doc.rootId].childIds.map((childId) => (
            <li key={childId}>{doc.nodes[childId].content.content?.[0]?.content?.[0]?.text}</li>
          ))}
        </ol>
      </aside>
      <section className="canvas-pane">
        <SpikeCanvas doc={doc} layout={layout} />
      </section>
    </main>
  );
}
