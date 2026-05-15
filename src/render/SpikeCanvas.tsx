import { getPlainText, type Doc } from '../core';
import type { LayoutResult } from '../layout';

interface SpikeCanvasProps {
  doc: Doc;
  layout: LayoutResult;
}

export function SpikeCanvas({ doc, layout }: SpikeCanvasProps) {
  return (
    <div className="spike-canvas" aria-label="Mind map spike canvas">
      <svg className="spike-edges" width="100%" height="100%" aria-hidden="true">
        {layout.edges.map((edge) => (
          <path
            key={`${edge.from}:${edge.to}`}
            d={`M ${edge.x1} ${edge.y1} C ${(edge.x1 + edge.x2) / 2} ${edge.y1}, ${(edge.x1 + edge.x2) / 2} ${edge.y2}, ${edge.x2} ${edge.y2}`}
            fill="none"
            stroke="var(--mf-edge)"
            strokeWidth="2"
          />
        ))}
      </svg>
      {Object.values(layout.nodes).map((layoutNode) => {
        const node = doc.nodes[layoutNode.id];
        return (
          <div
            key={layoutNode.id}
            className="spike-node"
            data-root={layoutNode.id === doc.rootId}
            style={{
              width: layoutNode.width,
              minHeight: layoutNode.height,
              transform: `translate3d(${Math.round(layoutNode.x)}px, ${Math.round(layoutNode.y)}px, 0)`
            }}
          >
            {node ? getPlainText(node.content) : layoutNode.id}
          </div>
        );
      })}
    </div>
  );
}
