import type { RichText, RichTextNode } from './types';

export function createTextDoc(text: string): RichText {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: text.length > 0 ? [{ type: 'text', text }] : []
      }
    ]
  };
}

export function cloneRichText(content: RichText): RichText {
  return structuredClone(content);
}

/**
 * Produce a key-order-stable string signature for a RichText doc. Used by the
 * editor bridge to decide whether an incoming `content` prop is the echo of
 * an update the editor just emitted. Comparing JSON.stringify directly is
 * unsafe because different RichText sources (Tiptap getJSON, fixture JSON,
 * structuredClone) may serialize keys in different orders.
 */
export function richTextSignature(content: RichText): string {
  return JSON.stringify(content, sortedKeyReplacer);
}

function sortedKeyReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = (value as Record<string, unknown>)[key];
    }
    return sorted;
  }
  return value;
}

export function getPlainText(content: RichText): string {
  const parts: string[] = [];
  visitRichText(content, (node) => {
    if (typeof node.text === 'string') {
      parts.push(node.text);
    }
  });
  return parts.join('');
}

export function isRichText(value: unknown): value is RichText {
  if (!isRecord(value) || value.type !== 'doc') {
    return false;
  }
  if (value.content === undefined) {
    return true;
  }
  return Array.isArray(value.content) && value.content.every(isRichTextNode);
}

function isRichTextNode(value: unknown): value is RichTextNode {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }
  if (value.text !== undefined && typeof value.text !== 'string') {
    return false;
  }
  if (value.content !== undefined && (!Array.isArray(value.content) || !value.content.every(isRichTextNode))) {
    return false;
  }
  if (value.marks !== undefined && !Array.isArray(value.marks)) {
    return false;
  }
  return true;
}

function visitRichText(node: RichText | RichTextNode, visitor: (node: RichTextNode) => void): void {
  if ('text' in node || node.type !== 'doc') {
    visitor(node as RichTextNode);
  }
  node.content?.forEach((child) => visitRichText(child, visitor));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
