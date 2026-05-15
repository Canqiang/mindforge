import { describe, expect, it } from 'vitest';
import { clampSelectionRange, createSelectionMirror, formatSelectionMirror, shouldMirrorSelection } from './selection';

describe('selection bridge helpers', () => {
  it('normalizes mirrored selection payloads', () => {
    const selection = createSelectionMirror({
      nodeId: 'a',
      from: 4,
      to: 4,
      origin: 'canvas',
      updatedAt: 12
    });

    expect(selection).toEqual({
      nodeId: 'a',
      from: 4,
      to: 4,
      origin: 'canvas',
      updatedAt: 12,
      composing: false
    });
  });

  it('mirrors only to the opposite surface for the same node', () => {
    const selection = createSelectionMirror({
      nodeId: 'a',
      from: 1,
      to: 3,
      origin: 'outline',
      updatedAt: 12
    });

    expect(shouldMirrorSelection(selection, 'a', 'canvas')).toBe(true);
    expect(shouldMirrorSelection(selection, 'a', 'outline')).toBe(false);
    expect(shouldMirrorSelection(selection, 'b', 'canvas')).toBe(false);
  });

  it('clamps mirrored ProseMirror ranges to a valid node-local range', () => {
    expect(clampSelectionRange({ from: 10, to: -2 }, 5)).toEqual({ from: 1, to: 5 });
    expect(clampSelectionRange({ from: Number.NaN, to: 4 }, 8)).toEqual({ from: 1, to: 4 });
  });

  it('formats selection bridge state for debug UI', () => {
    expect(formatSelectionMirror(null)).toBe('No mirrored selection');
    expect(
      formatSelectionMirror({
        nodeId: 'a',
        from: 2,
        to: 5,
        origin: 'canvas',
        updatedAt: 1,
        composing: true
      })
    ).toBe('canvas -> a @ 2-5 composing');
  });
});
