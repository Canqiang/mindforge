import { memo, useMemo, useRef, type CSSProperties } from 'react';
import { getPlainText, type Doc, type MindNode, type NodeId, type RichText } from '../core';
import type { StructuralKeyEvent } from '../editor/NodeEditor';
import { NodeEditorSlot } from '../editor/NodeEditorSlot';
import { formatSelectionMirror, type EditorSurface, type TextSelectionMirror } from '../editor/selection';

interface OutlinePaneProps {
  doc: Doc;
  activeNodeId: NodeId | null;
  mirroredSelection: TextSelectionMirror | null;
  aiPending: boolean;
  canExpand: boolean;
  onActivateEditor: (surface: EditorSurface, nodeId: NodeId) => void;
  onContentChange: (nodeId: NodeId, content: RichText, surface: EditorSurface) => void;
  onSelectionChange: (selection: TextSelectionMirror) => void;
  onToggleCollapsed: (nodeId: NodeId, next: boolean) => void;
  onStructuralKey: (event: StructuralKeyEvent) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onExpand: () => void;
}

interface OutlineRow {
  nodeId: NodeId;
  depth: number;
}

export function OutlinePane({ doc, activeNodeId, mirroredSelection, aiPending, canExpand, onActivateEditor, onContentChange, onSelectionChange, onToggleCollapsed, onStructuralKey, onExport, onImport, onExpand }: OutlinePaneProps) {
  const rows = useMemo(() => flattenOutlineRows(doc), [doc]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <aside className="outline-pane">
      <div className="outline-pane-header">
        <div className="pane-label">Spike outline bridge</div>
        <div className="outline-pane-actions" role="toolbar" aria-label="Document file actions">
          <button
            type="button"
            className="outline-pane-action outline-pane-action-ai"
            onClick={onExpand}
            disabled={!canExpand}
            aria-label="Expand the active node with AI sub-topics"
            title="Generate sub-topics for the active node (Ollama)"
          >
            {aiPending ? '...' : 'Expand AI'}
          </button>
          <button
            type="button"
            className="outline-pane-action"
            onClick={onExport}
            aria-label="Export document as JSON"
          >
            Export
          </button>
          <button
            type="button"
            className="outline-pane-action"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Import document from JSON file"
          >
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onImport(file);
            }}
          />
        </div>
      </div>
      {rows.map((row) => {
        const node = doc.nodes[row.nodeId];
        if (!node) {
          return null;
        }
        return (
          <OutlineNodeRow
            key={row.nodeId}
            node={node}
            depth={row.depth}
            active={activeNodeId === row.nodeId}
            mirroredSelection={mirroredSelection?.nodeId === row.nodeId ? mirroredSelection : null}
            onActivateEditor={onActivateEditor}
            onContentChange={onContentChange}
            onSelectionChange={onSelectionChange}
            onToggleCollapsed={onToggleCollapsed}
            onStructuralKey={onStructuralKey}
          />
        );
      })}
      <div className="bridge-status" aria-live="polite">
        {formatSelectionMirror(mirroredSelection)}
      </div>
    </aside>
  );
}

interface OutlineNodeRowProps {
  node: MindNode;
  depth: number;
  active: boolean;
  mirroredSelection: TextSelectionMirror | null;
  onActivateEditor: (surface: EditorSurface, nodeId: NodeId) => void;
  onContentChange: (nodeId: NodeId, content: RichText, surface: EditorSurface) => void;
  onSelectionChange: (selection: TextSelectionMirror) => void;
  onToggleCollapsed: (nodeId: NodeId, next: boolean) => void;
  onStructuralKey: (event: StructuralKeyEvent) => void;
}

const OutlineNodeRow = memo(function OutlineNodeRow({
  node,
  depth,
  active,
  mirroredSelection,
  onActivateEditor,
  onContentChange,
  onSelectionChange,
  onToggleCollapsed,
  onStructuralKey
}: OutlineNodeRowProps) {
  const title = getPlainText(node.content) || 'Untitled';
  const hasChildren = node.childIds.length > 0;
  const collapsed = Boolean(node.collapsed);

  return (
    <div className="outline-node" style={{ '--outline-depth': depth } as CSSProperties}>
      <div className="outline-node-row">
        {hasChildren ? (
          <button
            type="button"
            className="outline-chevron"
            data-collapsed={collapsed}
            aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            aria-expanded={!collapsed}
            onClick={() => onToggleCollapsed(node.id, !collapsed)}
          >
            <span aria-hidden="true">▸</span>
          </button>
        ) : (
          <span className="outline-bullet" aria-hidden="true" />
        )}
        <NodeEditorSlot
          nodeId={node.id}
          surface="outline"
          active={active}
          mirroredSelection={mirroredSelection}
          ariaLabel={`Outline editor for ${title}`}
          onActivate={onActivateEditor}
          onContentChange={onContentChange}
          onSelectionChange={onSelectionChange}
          onStructuralKey={onStructuralKey}
        />
      </div>
    </div>
  );
});

function flattenOutlineRows(doc: Doc): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const visit = (nodeId: NodeId, depth: number) => {
    const node = doc.nodes[nodeId];
    if (!node) {
      return;
    }

    rows.push({ nodeId, depth });
    if (node.collapsed) {
      return;
    }
    node.childIds.forEach((childId) => visit(childId, depth + 1));
  };

  visit(doc.rootId, 0);
  return rows;
}
