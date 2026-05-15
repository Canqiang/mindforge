import { useEffect, useMemo, useRef, useState } from 'react';
import { getPlainText, type Doc, type NodeId, type RichText } from '../core';
import { NodeEditorSlot } from '../editor/NodeEditorSlot';
import type { EditorSurface, TextSelectionMirror } from '../editor/selection';
import type { LayoutNode, LayoutResult } from '../layout';

interface SpikeCanvasProps {
  doc: Doc;
  layout: LayoutResult;
  activeNodeId: NodeId | null;
  mirroredSelection: TextSelectionMirror | null;
  onActivateEditor: (surface: EditorSurface, nodeId: NodeId) => void;
  onContentChange: (nodeId: NodeId, content: RichText, surface: EditorSurface) => void;
  onSelectionChange: (selection: TextSelectionMirror) => void;
  onViewportMeasured: () => void;
}

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

interface CanvasSize {
  width: number;
  height: number;
}

interface CullRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 1440, height: 900 };
const VIEWPORT_OVERSCAN = 360;

export function SpikeCanvas({
  doc,
  layout,
  activeNodeId,
  mirroredSelection,
  onActivateEditor,
  onContentChange,
  onSelectionChange,
  onViewportMeasured
}: SpikeCanvasProps) {
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [canvasSize, setCanvasSize] = useState<CanvasSize>(DEFAULT_CANVAS_SIZE);
  const [viewportMeasured, setViewportMeasured] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; viewport: Viewport } | null>(null);
  const pendingViewportRef = useRef<Viewport | null>(null);
  const rafIdRef = useRef<number | null>(null);
  // Mirror of viewport state so the native wheel listener (which lives in a
  // useEffect with no deps) can read the latest snapshot without closing over
  // stale state.
  const viewportRef = useRef<Viewport>(viewport);
  viewportRef.current = viewport;

  const scheduleViewport = (next: Viewport) => {
    pendingViewportRef.current = next;
    if (rafIdRef.current !== null) {
      return;
    }
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const target = pendingViewportRef.current;
      pendingViewportRef.current = null;
      if (target) {
        setViewport(target);
      }
    });
  };

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);
  const mirroredNodeId = mirroredSelection?.nodeId ?? null;
  const world = useMemo(
    () => ({
      width: Math.max(1400, layout.bounds.maxX + 560),
      height: Math.max(900, layout.bounds.maxY + 320)
    }),
    [layout.bounds.maxX, layout.bounds.maxY]
  );
  const visible = useMemo(() => {
    const cullRect = getCullRect(viewport, canvasSize);
    const forcedNodeIds = new Set<NodeId>([doc.rootId]);
    if (activeNodeId) {
      forcedNodeIds.add(activeNodeId);
    }
    if (mirroredNodeId) {
      forcedNodeIds.add(mirroredNodeId);
    }

    const nodes = Object.values(layout.nodes).filter(
      (node) => forcedNodeIds.has(node.id) || rectIntersectsNode(cullRect, node)
    );
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = layout.edges.filter((edge) => nodeIds.has(edge.to));

    return { nodes, edges };
  }, [activeNodeId, canvasSize, doc.rootId, layout.edges, layout.nodes, mirroredNodeId, viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const updateSize = (entry: ResizeObserverEntry) => {
      const { width, height } = entry.contentRect;
      setViewportMeasured(true);
      onViewportMeasured();
      setCanvasSize((current) => {
        const next = { width: Math.round(width), height: Math.round(height) };
        return current.width === next.width && current.height === next.height ? current : next;
      });
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        updateSize(entry);
      }
    });

    observer.observe(canvas);
    return () => {
      observer.disconnect();
    };
  }, [onViewportMeasured]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    // React's synthetic wheel handler is registered passive by the runtime,
    // which makes preventDefault() a no-op in some browsers. Attach the
    // native listener ourselves with passive: false so we can stop the page
    // from scrolling while the user pans or zooms inside the canvas.
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const delta = event.deltaY > 0 ? -0.08 : 0.08;
        // Zoom is low-frequency; sync setViewport with the functional form
        // accumulates correctly even if the user mashes ctrl+wheel.
        setViewport((current) => ({
          ...current,
          scale: Math.min(1.8, Math.max(0.45, Number((current.scale + delta).toFixed(2))))
        }));
        return;
      }
      // Trackpad pan emits wheel events at ~60Hz. Coalesce into one render
      // per frame to keep visible-node culling cost flat.
      const base = pendingViewportRef.current ?? null;
      const start = base ?? viewportRef.current;
      scheduleViewport({
        ...start,
        x: start.x - event.deltaX,
        y: start.y - event.deltaY
      });
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (
    <div
      ref={canvasRef}
      className="spike-canvas"
      aria-label="Mind map spike canvas"
      data-total-node-count={Object.keys(layout.nodes).length}
      data-visible-node-count={visible.nodes.length}
      data-visible-edge-count={visible.edges.length}
      data-culling-enabled="true"
      data-viewport-measured={viewportMeasured}
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
        scheduleViewport({
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
          // Avoid Math.round() here: when scale != 1 the integer translate is
          // multiplied into a non-integer world coordinate and we get subpixel
          // shimmer on every pan tick. Sub-pixel translates render fine.
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`
        }}
      >
        <svg className="spike-edges" width={world.width} height={world.height} aria-hidden="true">
          {visible.edges.map((edge) => (
            <path
              key={`${edge.from}:${edge.to}`}
              d={`M ${edge.x1} ${edge.y1} C ${(edge.x1 + edge.x2) / 2} ${edge.y1}, ${(edge.x1 + edge.x2) / 2} ${edge.y2}, ${edge.x2} ${edge.y2}`}
              fill="none"
              stroke="var(--mf-edge)"
              strokeWidth="2"
            />
          ))}
        </svg>
        {visible.nodes.map((layoutNode) => {
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
                <NodeEditorSlot
                  nodeId={layoutNode.id}
                  content={node.content}
                  surface="canvas"
                  active={activeNodeId === layoutNode.id}
                  mirroredSelection={mirroredSelection}
                  ariaLabel={`Canvas editor for ${title}`}
                  onActivate={onActivateEditor}
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

function getCullRect(viewport: Viewport, canvasSize: CanvasSize): CullRect {
  const overscan = VIEWPORT_OVERSCAN / viewport.scale;
  return {
    left: -viewport.x / viewport.scale - overscan,
    top: -viewport.y / viewport.scale - overscan,
    right: (canvasSize.width - viewport.x) / viewport.scale + overscan,
    bottom: (canvasSize.height - viewport.y) / viewport.scale + overscan
  };
}

function rectIntersectsNode(rect: CullRect, node: LayoutNode): boolean {
  return node.x <= rect.right && node.x + node.width >= rect.left && node.y <= rect.bottom && node.y + node.height >= rect.top;
}
