import { memo, useMemo, type CSSProperties } from 'react';
import { getPlainText, type Doc, type MindNode, type NodeId, type RichText } from '../core';
import { NodeEditorSlot } from '../editor/NodeEditorSlot';
import { formatSelectionMirror, type EditorSurface, type TextSelectionMirror } from '../editor/selection';

interface OutlinePaneProps {
  doc: Doc;
  activeNodeId: NodeId | null;
  mirroredSelection: TextSelectionMirror | null;
  onActivateEditor: (surface: EditorSurface, nodeId: NodeId) => void;
  onContentChange: (nodeId: NodeId, content: RichText, surface: EditorSurface) => void;
  onSelectionChange: (selection: TextSelectionMirror) => void;
}

interface OutlineRow {
  nodeId: NodeId;
  depth: number;
}

export function OutlinePane({ doc, activeNodeId, mirroredSelection, onActivateEditor, onContentChange, onSelectionChange }: OutlinePaneProps) {
  const rows = useMemo(() => flattenOutlineRows(doc), [doc]);

  return (
    <aside className="outline-pane">
      <div className="pane-label">Spike outline bridge</div>
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
}

const OutlineNodeRow = memo(function OutlineNodeRow({
  node,
  depth,
  active,
  mirroredSelection,
  onActivateEditor,
  onContentChange,
  onSelectionChange
}: OutlineNodeRowProps) {
  const title = getPlainText(node.content) || 'Untitled';

  return (
    <div className="outline-node" style={{ '--outline-depth': depth } as CSSProperties}>
      <div className="outline-node-row">
        <span className="outline-bullet" aria-hidden="true" />
        <NodeEditorSlot
          nodeId={node.id}
          content={node.content}
          surface="outline"
          active={active}
          mirroredSelection={mirroredSelection}
          ariaLabel={`Outline editor for ${title}`}
          onActivate={onActivateEditor}
          onContentChange={onContentChange}
          onSelectionChange={onSelectionChange}
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
