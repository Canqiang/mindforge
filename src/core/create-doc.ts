import { createTextDoc } from './rich-text';
import type { Doc, MindNode, NodeId } from './types';

interface CreateEmptyDocOptions {
  title?: string;
  rootId?: NodeId;
  children?: string[];
  now?: number;
}

export function createEmptyDoc(options: CreateEmptyDocOptions = {}): Doc {
  const now = options.now ?? Date.now();
  const rootId = options.rootId ?? 'root';
  const childIds = options.children?.map((_, index) => `node-${index + 1}`) ?? [];

  const root: MindNode = {
    id: rootId,
    parentId: null,
    childIds,
    content: createTextDoc(options.title ?? 'Untitled')
  };

  const nodes: Doc['nodes'] = { [rootId]: root };

  options.children?.forEach((title, index) => {
    const id = childIds[index];
    nodes[id] = {
      id,
      parentId: rootId,
      childIds: [],
      content: createTextDoc(title),
      side: index % 2 === 0 ? 'right' : 'left'
    };
  });

  return {
    version: 1,
    rootId,
    nodes,
    edges: {},
    theme: 'default',
    meta: {
      title: options.title ?? 'Untitled',
      createdAt: now,
      updatedAt: now
    }
  };
}
