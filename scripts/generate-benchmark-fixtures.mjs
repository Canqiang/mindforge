import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outDir = join(process.cwd(), 'examples', 'benchmark');

const fixtures = [
  ['balanced-100', 100, 'balanced'],
  ['balanced-500', 500, 'balanced'],
  ['balanced-1000', 1000, 'balanced'],
  ['balanced-2000', 2000, 'balanced'],
  ['wide-500', 500, 'wide'],
  ['deep-300', 300, 'deep'],
  ['mixed-text-500', 500, 'mixed'],
  ['editing-hotspot-1000', 1000, 'balanced']
];

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const [name, count, shape] of fixtures) {
    const doc = generateFixture(name, count, shape);
    await writeFile(join(outDir, `${name}.json`), `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  }
}

function generateFixture(name, count, shape) {
  const nodes = {};
  const rootId = 'root';
  nodes[rootId] = {
    id: rootId,
    parentId: null,
    childIds: [],
    content: createTextDoc(name)
  };

  for (let index = 1; index < count; index += 1) {
    const id = `node-${index}`;
    const parentId = chooseParent(index, shape);
    nodes[id] = {
      id,
      parentId,
      childIds: [],
      content: createTextDoc(labelFor(index, shape)),
      side: parentId === rootId ? (index % 2 === 0 ? 'right' : 'left') : undefined
    };
    nodes[parentId].childIds.push(id);
  }

  return {
    version: 1,
    rootId,
    nodes,
    edges: {},
    theme: 'default',
    meta: {
      title: name,
      createdAt: 0,
      updatedAt: 0
    }
  };
}

function createTextDoc(text) {
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

function chooseParent(index, shape) {
  if (shape === 'wide') {
    return 'root';
  }
  if (shape === 'deep') {
    return index === 1 ? 'root' : `node-${index - 1}`;
  }
  return index <= 8 ? 'root' : `node-${Math.floor(index / 3)}`;
}

function labelFor(index, shape) {
  if (shape === 'mixed') {
    const variants = [
      `Short ${index}`,
      `Longer research note ${index} with enough text to affect measurement`,
      `Code node ${index}: const value = fn(input)`,
      `Idea ${index} -> hypothesis -> evidence`,
      `Emoji ${index} spark`
    ];
    return variants[index % variants.length];
  }
  return `Node ${index}`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
