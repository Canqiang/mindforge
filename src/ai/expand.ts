import {
  createTextDoc,
  getPlainText,
  type Doc,
  type DocOperation,
  type NodeId
} from '../core';
import { AiProviderError, type AiProvider } from './providers/types';

const DEFAULT_COUNT = 6;
const MAX_COUNT = 12;
const MAX_TITLE_LENGTH = 80;

export interface ExpandInput {
  doc: Doc;
  nodeId: NodeId;
  count?: number;
  signal?: AbortSignal;
}

export interface ExpandSuccess {
  ok: true;
  ops: DocOperation[];
  titles: string[];
  summary: string;
}

export interface ExpandFailure {
  ok: false;
  error: {
    code: 'NODE_NOT_FOUND' | 'PROVIDER_ERROR' | 'NOT_JSON' | 'BAD_RESPONSE' | 'NO_TITLES';
    message: string;
  };
}

export type ExpandResult = ExpandSuccess | ExpandFailure;

/**
 * Ask the provider for sub-topic titles, then turn each title into a
 * core `insertNode` op. The caller is responsible for wrapping them in
 * a single `applyDocTransaction` so the whole expansion is one undo step.
 *
 * Never throws — every failure mode (provider error, malformed JSON,
 * empty titles array) returns a structured ExpandFailure so the UI can
 * render a useful message.
 */
export async function expandNode(provider: AiProvider, input: ExpandInput): Promise<ExpandResult> {
  const node = input.doc.nodes[input.nodeId];
  if (!node) {
    return { ok: false, error: { code: 'NODE_NOT_FOUND', message: `Node "${input.nodeId}" not found` } };
  }

  const count = Math.max(1, Math.min(input.count ?? DEFAULT_COUNT, MAX_COUNT));
  const parentTitle = (getPlainText(node.content) || 'Untitled').trim();
  const prompt = buildPrompt(parentTitle, count);

  let raw: string;
  try {
    const { text } = await provider.generate({ prompt, responseFormat: 'json' }, input.signal);
    raw = text;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'PROVIDER_ERROR',
        message: error instanceof AiProviderError ? error.message : (error instanceof Error ? error.message : String(error))
      }
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      error: { code: 'NOT_JSON', message: error instanceof Error ? error.message : 'Provider response is not valid JSON' }
    };
  }

  const titles = extractTitles(parsed);
  if (titles === null) {
    return {
      ok: false,
      error: { code: 'BAD_RESPONSE', message: 'Provider response must be `{ titles: string[] }`' }
    };
  }
  if (titles.length === 0) {
    return { ok: false, error: { code: 'NO_TITLES', message: 'Provider returned an empty title list' } };
  }

  const baseIndex = node.childIds.length;
  const opSeed = `expand:${input.nodeId}:${Date.now()}`;
  const ops: DocOperation[] = titles.map((title, offset) => {
    const newId = generateNodeId();
    return {
      id: `${opSeed}:${offset}`,
      type: 'insertNode',
      parentId: input.nodeId,
      index: baseIndex + offset,
      node: {
        id: newId,
        content: createTextDoc(title),
        side: input.nodeId === input.doc.rootId
          ? (baseIndex + offset) % 2 === 0
            ? 'right'
            : 'left'
          : undefined
      }
    };
  });

  return {
    ok: true,
    ops,
    titles,
    summary: `Expanded "${parentTitle}" with ${titles.length} sub-topic${titles.length === 1 ? '' : 's'}`
  };
}

function buildPrompt(parentTitle: string, count: number): string {
  return [
    'You generate sub-topics for a mind map node.',
    '',
    `The current node title is: "${parentTitle}"`,
    '',
    `Suggest exactly ${count} concise sub-topic titles that would be useful child nodes.`,
    'Each title MUST be at most 6 words. No leading bullets. No trailing punctuation.',
    '',
    'Respond ONLY with JSON in this exact shape:',
    '{ "titles": ["...", "...", "..."] }',
    'No explanation, no markdown fences, just the JSON.'
  ].join('\n');
}

function extractTitles(value: unknown): string[] | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as { titles?: unknown }).titles;
  if (!Array.isArray(candidate)) return null;
  const titles: string[] = [];
  for (const item of candidate) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    titles.push(trimmed.slice(0, MAX_TITLE_LENGTH));
  }
  return titles;
}

function generateNodeId(): NodeId {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `n-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `n-${Math.random().toString(36).slice(2, 10)}`;
}
