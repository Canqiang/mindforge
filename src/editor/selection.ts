import type { NodeId, OpOrigin } from '../core';

export type EditorSurface = Extract<OpOrigin, 'canvas' | 'outline'>;

export interface TextSelectionMirror {
  nodeId: NodeId;
  from: number;
  to: number;
  origin: EditorSurface;
  updatedAt: number;
  composing: boolean;
}

export interface SelectionRange {
  from: number;
  to: number;
}

export function createSelectionMirror(input: {
  nodeId: NodeId;
  from: number;
  to: number;
  origin: EditorSurface;
  updatedAt: number;
  composing?: boolean;
}): TextSelectionMirror {
  return {
    nodeId: input.nodeId,
    from: input.from,
    to: input.to,
    origin: input.origin,
    updatedAt: input.updatedAt,
    composing: Boolean(input.composing)
  };
}

export function shouldMirrorSelection(selection: TextSelectionMirror | null, nodeId: NodeId, surface: EditorSurface): selection is TextSelectionMirror {
  return Boolean(selection && selection.nodeId === nodeId && selection.origin !== surface);
}

export function clampSelectionRange(selection: SelectionRange, maxPosition: number): SelectionRange {
  const safeMax = Math.max(1, maxPosition);
  const from = clamp(selection.from, 1, safeMax);
  const to = clamp(selection.to, 1, safeMax);
  return from <= to ? { from, to } : { from: to, to: from };
}

export function formatSelectionMirror(selection: TextSelectionMirror | null): string {
  if (!selection) {
    return 'No mirrored selection';
  }
  const range = selection.from === selection.to ? `${selection.from}` : `${selection.from}-${selection.to}`;
  const composing = selection.composing ? ' composing' : '';
  return `${selection.origin} -> ${selection.nodeId} @ ${range}${composing}`;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}
