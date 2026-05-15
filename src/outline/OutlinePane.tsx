import { getPlainText, type Doc, type NodeId, type RichText } from '../core';
import { NodeEditorSlot } from '../editor/NodeEditorSlot';
import { formatSelectionMirror, type EditorSurface, type TextSelectionMirror } from '../editor/selection';
import type { CSSProperties } from 'react';

interface OutlinePaneProps {
  doc: Doc;
  activeNodeId: NodeId | null;
  mirroredSelection: TextSelectionMirror | null;
  onActivateEditor: (surface: EditorSurface, nodeId: NodeId) => void;
  onContentChange: (nodeId: NodeId, content: RichText, surface: EditorSurface) => void;
  onSelectionChange: (selection: TextSelectionMirror) => void;
}

export function OutlinePane({ doc, activeNodeId, mirroredSelection, onActivateEditor, onContentChange, onSelectionChange }: OutlinePaneProps) {
  return (
    <aside className="outline-pane">
      <div className="pane-label">Spike outline bridge</div>
      <OutlineNode
        doc={doc}
        activeNodeId={activeNodeId}
        nodeId={doc.rootId}
        depth={0}
        mirroredSelection={mirroredSelection}
        onActivateEditor={onActivateEditor}
        onContentChange={onContentChange}
        onSelectionChange={onSelectionChange}
      />
      <div className="bridge-status" aria-live="polite">
        {formatSelectionMirror(mirroredSelection)}
      </div>
    </aside>
  );
}

interface OutlineNodeProps extends OutlinePaneProps {
  nodeId: NodeId;
  depth: number;
}

function OutlineNode({ doc, activeNodeId, nodeId, depth, mirroredSelection, onActivateEditor, onContentChange, onSelectionChange }: OutlineNodeProps) {
  const node = doc.nodes[nodeId];
  if (!node) {
    return null;
  }

  const title = getPlainText(node.content) || 'Untitled';

  return (
    <div className="outline-node" style={{ '--outline-depth': depth } as CSSProperties}>
      <div className="outline-node-row">
        <span className="outline-bullet" aria-hidden="true" />
        <NodeEditorSlot
          nodeId={nodeId}
          content={node.content}
          surface="outline"
          active={activeNodeId === nodeId}
          mirroredSelection={mirroredSelection}
          ariaLabel={`Outline editor for ${title}`}
          onActivate={onActivateEditor}
          onContentChange={onContentChange}
          onSelectionChange={onSelectionChange}
        />
      </div>
      {node.childIds.length > 0 ? (
        <div className="outline-children">
          {node.childIds.map((childId) => (
            <OutlineNode
              key={childId}
              doc={doc}
              activeNodeId={activeNodeId}
              nodeId={childId}
              depth={depth + 1}
              mirroredSelection={mirroredSelection}
              onActivateEditor={onActivateEditor}
              onContentChange={onContentChange}
              onSelectionChange={onSelectionChange}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
