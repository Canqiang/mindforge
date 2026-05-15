import { useMemo, useRef, useState } from 'react';
import { getPlainText, type Doc, type NodeId, type RichText } from '../core';
import { NodeEditor } from '../editor/NodeEditor';
import type { EditorSurface, TextSelectionMirror } from '../editor/selection';
import type { LayoutResult } from '../layout';

interface SpikeCanvasProps {
  doc: Doc;
  layout: LayoutResult;
  mirroredSelection: TextSelectionMirror | null;
  onContentChange: (nodeId: NodeId, content: RichText, surface: EditorSurface) => void;
  onSelectionChange: (selection: TextSelectionMirror) => void;
}

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export function SpikeCanvas({ doc, layout, mirroredSelection, onContentChange, onSelectionChange }: SpikeCanvasProps) {
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const panRef = useRef<{ pointerId: number; x: number; y: number; viewport: Viewport } | null>(null);
  const world = useMemo(
    () => ({
      width: Math.max(1400, layout.bounds.maxX + 560),
      height: Math.max(900, layout.bounds.maxY + 320)
    }),
    [layout.bounds.maxX, layout.bounds.maxY]
  );

  return (
    <div
      className="spike-canvas"
      aria-label="Mind map spike canvas"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('.spike-node')) {
          return;
        }
        panRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          viewport
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const pan = panRef.current;
        if (!pan || pan.pointerId !== event.pointerId) {
          return;
        }
        setViewport({
          ...pan.viewport,
          x: pan.viewport.x + event.clientX - pan.x,
          y: pan.viewport.y + event.clientY - pan.y
        });
      }}
      onPointerUp={(event) => {
        if (panRef.current?.pointerId === event.pointerId) {
          panRef.current = null;
        }
      }}
      onWheel={(event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          const delta = event.deltaY > 0 ? -0.08 : 0.08;
          setViewport((current) => ({
            ...current,
            scale: Math.min(1.8, Math.max(0.45, Number((current.scale + delta).toFixed(2))))
          }));
          return;
        }
        setViewport((current) => ({
          ...current,
          x: current.x - event.deltaX,
          y: current.y - event.deltaY
        }));
      }}
    >
      <div className="canvas-toolbar" aria-label="Canvas viewport controls">
        <button type="button" onClick={() => setViewport((current) => ({ ...current, scale: Math.max(0.45, current.scale - 0.1) }))}>
          -
        </button>
        <span>{Math.round(viewport.scale * 100)}%</span>
        <button type="button" onClick={() => setViewport((current) => ({ ...current, scale: Math.min(1.8, current.scale + 0.1) }))}>
          +
        </button>
        <button type="button" onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}>
          Reset
        </button>
      </div>
      <div
        className="spike-canvas-world"
        style={{
          width: world.width,
          height: world.height,
          transform: `translate3d(${Math.round(viewport.x)}px, ${Math.round(viewport.y)}px, 0) scale(${viewport.scale})`
        }}
      >
        <svg className="spike-edges" width={world.width} height={world.height} aria-hidden="true">
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
          const title = node ? getPlainText(node.content) : layoutNode.id;
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
              {node ? (
                <NodeEditor
                  nodeId={layoutNode.id}
                  content={node.content}
                  surface="canvas"
                  mirroredSelection={mirroredSelection}
                  ariaLabel={`Canvas editor for ${title}`}
                  onContentChange={onContentChange}
                  onSelectionChange={onSelectionChange}
                />
              ) : (
                layoutNode.id
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
