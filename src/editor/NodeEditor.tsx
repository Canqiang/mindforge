import type { JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useRef } from 'react';
import type { NodeId, RichText } from '../core';
import { clampSelectionRange, createSelectionMirror, shouldMirrorSelection, type EditorSurface, type TextSelectionMirror } from './selection';

const nodeEditorExtensions = [
  StarterKit.configure({
    blockquote: false,
    bulletList: false,
    codeBlock: false,
    heading: false,
    horizontalRule: false,
    listItem: false,
    orderedList: false
  })
];

interface NodeEditorProps {
  nodeId: NodeId;
  content: RichText;
  surface: EditorSurface;
  mirroredSelection: TextSelectionMirror | null;
  className?: string;
  ariaLabel: string;
  onContentChange: (nodeId: NodeId, content: RichText, surface: EditorSurface) => void;
  onSelectionChange: (selection: TextSelectionMirror) => void;
}

export function NodeEditor({
  nodeId,
  content,
  surface,
  mirroredSelection,
  className,
  ariaLabel,
  onContentChange,
  onSelectionChange
}: NodeEditorProps) {
  const isComposingRef = useRef(false);
  const isApplyingMirrorRef = useRef(false);
  const lastContentJsonRef = useRef(JSON.stringify(content));
  const editorClassName = useMemo(() => ['node-editor', `node-editor-${surface}`, className].filter(Boolean).join(' '), [className, surface]);

  const editor = useEditor(
    {
      extensions: nodeEditorExtensions,
      content: toTiptapContent(content),
      editorProps: {
        attributes: {
          class: editorClassName,
          'aria-label': ariaLabel
        }
      },
      onUpdate({ editor: activeEditor }) {
        const nextContent = activeEditor.getJSON() as RichText;
        lastContentJsonRef.current = JSON.stringify(nextContent);
        onContentChange(nodeId, nextContent, surface);
      },
      onSelectionUpdate({ editor: activeEditor }) {
        if (isApplyingMirrorRef.current) {
          return;
        }
        onSelectionChange(
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
    [ariaLabel, editorClassName, nodeId, onContentChange, onSelectionChange, surface]
  );

  const contentJson = JSON.stringify(content);

  useEffect(() => {
    if (!editor || contentJson === lastContentJsonRef.current) {
      return;
    }

    lastContentJsonRef.current = contentJson;
    editor.commands.setContent(toTiptapContent(content), {
      emitUpdate: false,
      errorOnInvalidContent: true
    });
  }, [content, contentJson, editor]);

  useEffect(() => {
    if (!editor || !shouldMirrorSelection(mirroredSelection, nodeId, surface)) {
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

  return (
    <EditorContent
      editor={editor}
      data-node-id={nodeId}
      data-editor-surface={surface}
      data-mirrored={shouldMirrorSelection(mirroredSelection, nodeId, surface)}
      onCompositionStart={() => {
        isComposingRef.current = true;
      }}
      onCompositionEnd={() => {
        isComposingRef.current = false;
      }}
    />
  );
}

function toTiptapContent(content: RichText): JSONContent {
  return structuredClone(content) as JSONContent;
}
