import { getPlainText, type Doc, type NodeId, type RichText } from '../core';
import { NodeEditor } from '../editor/NodeEditor';
import { formatSelectionMirror, type EditorSurface, type TextSelectionMirror } from '../editor/selection';
import type { CSSProperties } from 'react';

interface OutlinePaneProps {
  doc: Doc;
  mirroredSelection: TextSelectionMirror | null;
  onContentChange: (nodeId: NodeId, content: RichText, surface: EditorSurface) => void;
  onSelectionChange: (selection: TextSelectionMirror) => void;
}

export function OutlinePane({ doc, mirroredSelection, onContentChange, onSelectionChange }: OutlinePaneProps) {
  return (
    <aside className="outline-pane">
      <div className="pane-label">Spike outline bridge</div>
      <OutlineNode
        doc={doc}
        nodeId={doc.rootId}
        depth={0}
        mirroredSelection={mirroredSelection}
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

function OutlineNode({ doc, nodeId, depth, mirroredSelection, onContentChange, onSelectionChange }: OutlineNodeProps) {
  const node = doc.nodes[nodeId];
  if (!node) {
    return null;
  }

  const title = getPlainText(node.content) || 'Untitled';

  return (
    <div className="outline-node" style={{ '--outline-depth': depth } as CSSProperties}>
      <div className="outline-node-row">
        <span className="outline-bullet" aria-hidden="true" />
        <NodeEditor
          nodeId={nodeId}
          content={node.content}
          surface="outline"
          mirroredSelection={mirroredSelection}
          ariaLabel={`Outline editor for ${title}`}
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
              nodeId={childId}
              depth={depth + 1}
              mirroredSelection={mirroredSelection}
              onContentChange={onContentChange}
              onSelectionChange={onSelectionChange}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
