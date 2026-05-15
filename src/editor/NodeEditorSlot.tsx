import { getPlainText, type NodeId, type RichText } from '../core';
import { NodeEditor } from './NodeEditor';
import { shouldMirrorSelection, type EditorSurface, type TextSelectionMirror } from './selection';

interface NodeEditorSlotProps {
  nodeId: NodeId;
  content: RichText;
  surface: EditorSurface;
  active: boolean;
  mirroredSelection: TextSelectionMirror | null;
  className?: string;
  ariaLabel: string;
  onActivate: (surface: EditorSurface, nodeId: NodeId) => void;
  onContentChange: (nodeId: NodeId, content: RichText, surface: EditorSurface) => void;
  onSelectionChange: (selection: TextSelectionMirror) => void;
}

export function NodeEditorSlot({
  nodeId,
  content,
  surface,
  active,
  mirroredSelection,
  className,
  ariaLabel,
  onActivate,
  onContentChange,
  onSelectionChange
}: NodeEditorSlotProps) {
  const isMirrored = shouldMirrorSelection(mirroredSelection, nodeId, surface);
  const plainText = getPlainText(content) || 'Untitled';

  const activateFromUser = () => {
    onActivate(surface, nodeId);
  };

  return (
    <div
      className="node-editor-slot"
      data-node-id={nodeId}
      data-editor-surface={surface}
      data-active={active}
      data-mirrored={isMirrored}
      onPointerDown={active ? undefined : activateFromUser}
      onFocus={active ? undefined : activateFromUser}
    >
      {active ? (
        <NodeEditor
          nodeId={nodeId}
          content={content}
          surface={surface}
          mirroredSelection={mirroredSelection}
          className={className}
          ariaLabel={ariaLabel}
          onContentChange={onContentChange}
          onSelectionChange={onSelectionChange}
        />
      ) : (
        <button type="button" className="node-editor-placeholder" aria-label={ariaLabel} onClick={activateFromUser}>
          {plainText}
        </button>
      )}
    </div>
  );
}
