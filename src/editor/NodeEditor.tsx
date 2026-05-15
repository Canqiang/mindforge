import type { JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { richTextSignature, type NodeId, type RichText } from '../core';
import { clampSelectionRange, createSelectionMirror, shouldMirrorSelection, type EditorSurface, type TextSelectionMirror } from './selection';

const nodeEditorExtensions = [
  StarterKit.configure({
    blockquote: false,
    bulletList: false,
    codeBlock: false,
    heading: false,
    horizontalRule: false,
    listItem: false,
    orderedList: false,
    // Disable Tiptap v3's per-editor undo (the option is named `undoRedo`
    // in StarterKit v3; older docs may call it `history`). Every
    // updateContent op flows through the CoreStore history stack, and a
    // competing Tiptap undo would put the doc and the editor out of sync.
    undoRedo: false
  })
];

export type StructuralKey = 'enter' | 'tab' | 'shift-tab' | 'backspace-empty';

export interface StructuralKeyEvent {
  nodeId: NodeId;
  surface: EditorSurface;
  kind: StructuralKey;
}

interface NodeEditorProps {
  nodeId: NodeId;
  content: RichText;
  surface: EditorSurface;
  mirroredSelection: TextSelectionMirror | null;
  className?: string;
  ariaLabel: string;
  /**
   * Whether the editor should grab focus on mount. Slots set this to false
   * when the editor is being mounted only because the opposite surface
   * already owns the selection — auto-focusing the mirror would emit
   * another selectionUpdate and overwrite the originating surface's mirror.
   */
  autoFocus?: boolean;
  onContentChange: (nodeId: NodeId, content: RichText, surface: EditorSurface) => void;
  onSelectionChange: (selection: TextSelectionMirror) => void;
  onStructuralKey?: (event: StructuralKeyEvent) => void;
}

export function NodeEditor({
  nodeId,
  content,
  surface,
  mirroredSelection,
  className,
  ariaLabel,
  autoFocus,
  onContentChange,
  onSelectionChange,
  onStructuralKey
}: NodeEditorProps) {
  const [isComposing, setIsComposing] = useState(false);
  const isComposingRef = useRef(false);
  isComposingRef.current = isComposing;
  const isApplyingMirrorRef = useRef(false);
  const onContentChangeRef = useRef(onContentChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onStructuralKeyRef = useRef(onStructuralKey);
  const lastSignatureRef = useRef(richTextSignature(content));
  const editorClassName = useMemo(() => ['node-editor', `node-editor-${surface}`, className].filter(Boolean).join(' '), [className, surface]);

  useEffect(() => {
    onContentChangeRef.current = onContentChange;
    onSelectionChangeRef.current = onSelectionChange;
    onStructuralKeyRef.current = onStructuralKey;
  }, [onContentChange, onSelectionChange, onStructuralKey]);

  const editor = useEditor(
    {
      extensions: nodeEditorExtensions,
      content: toTiptapContent(content),
      autofocus: autoFocus ? 'end' : false,
      editorProps: {
        attributes: {
          class: editorClassName,
          'aria-label': ariaLabel
        },
        handleKeyDown: (view, event) => {
          if (isComposingRef.current) {
            return false;
          }
          const callback = onStructuralKeyRef.current;
          if (!callback) {
            return false;
          }
          if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            callback({ nodeId, surface, kind: 'enter' });
            return true;
          }
          if (event.key === 'Tab') {
            event.preventDefault();
            callback({
              nodeId,
              surface,
              kind: event.shiftKey ? 'shift-tab' : 'tab'
            });
            return true;
          }
          if (event.key === 'Backspace' && view.state.doc.textContent.length === 0) {
            event.preventDefault();
            callback({ nodeId, surface, kind: 'backspace-empty' });
            return true;
          }
          return false;
        }
      },
      onUpdate({ editor: activeEditor }) {
        const nextContent = activeEditor.getJSON() as RichText;
        // Record our own emit signature so the prop echo doesn't trigger
        // a setContent round-trip below.
        lastSignatureRef.current = richTextSignature(nextContent);
        onContentChangeRef.current(nodeId, nextContent, surface);
      },
      onSelectionUpdate({ editor: activeEditor }) {
        if (isApplyingMirrorRef.current) {
          return;
        }
        onSelectionChangeRef.current(
          createSelectionMirror({
            nodeId,
            from: activeEditor.state.selection.from,
            to: activeEditor.state.selection.to,
            origin: surface,
            updatedAt: performance.now(),
            composing: isComposingRef.current
          })
        );
      }
    },
    [editorClassName, nodeId, surface]
  );

  const contentSignature = useMemo(() => richTextSignature(content), [content]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }
    // Skip echo of our own update — content prop matches the signature we just emitted.
    if (contentSignature === lastSignatureRef.current) {
      return;
    }
    // IME composition is in progress — replacing the contentEditable DOM here
    // would cancel the user's composition. Defer until composition ends; the
    // effect re-runs when `isComposing` flips false because it's in deps.
    if (isComposing) {
      return;
    }

    lastSignatureRef.current = contentSignature;
    editor.commands.setContent(toTiptapContent(content), {
      emitUpdate: false,
      errorOnInvalidContent: true
    });
  }, [content, contentSignature, editor, isComposing]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !shouldMirrorSelection(mirroredSelection, nodeId, surface)) {
      return;
    }

    const maxPosition = editor.state.doc.content.size;
    const range = clampSelectionRange(mirroredSelection, maxPosition);
    isApplyingMirrorRef.current = true;
    editor.commands.setTextSelection(range);
    queueMicrotask(() => {
      isApplyingMirrorRef.current = false;
    });
  }, [editor, mirroredSelection, nodeId, surface]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }
    editor.view.dom.setAttribute('aria-label', ariaLabel);
  }, [ariaLabel, editor]);

  return (
    <EditorContent
      editor={editor}
      onCompositionStart={() => {
        setIsComposing(true);
      }}
      onCompositionEnd={() => {
        setIsComposing(false);
      }}
    />
  );
}

function toTiptapContent(content: RichText): JSONContent {
  return structuredClone(content) as JSONContent;
}
