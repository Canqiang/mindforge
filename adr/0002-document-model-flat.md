# ADR-0002 — Document Model: Flat Node Map with parentId / childIds

**Status:** Accepted · 2026-05-15 · revised after design reflection

---

## Context

### English

A mind map is conceptually a tree, but the storage shape has a big impact on:

- **Mutation cost** — Nested storage means every move/insert/delete may rewrite a parent path.
- **CRDT compatibility** — Y.js / Automerge / Loro all prefer flat maps of stable IDs over nested structures.
- **Undo / redo** — Operation-based undo is easier when the doc is a flat map and ops are plain `{type, target, payload}`.
- **Outline ↔ canvas sync** — Both views must agree on node identity and ordering, and ideally share the rich-text representation of each node's content.

We also need a representation for free arrows (relation lines that cross the tree structure), which a pure tree cannot express.

### 中文

思维导图概念上是棵树，但存储形状对几件事影响很大：

- **变更成本**——嵌套存储意味着任何移动/插入/删除都可能要重写整条父路径。
- **CRDT 兼容性**——Y.js / Automerge / Loro 都更喜欢「平铺的稳定 ID 表」而不是嵌套结构。
- **撤销重做**——文档是平铺、操作是普通 `{type, target, payload}` 时，基于操作的撤销最容易做。
- **大纲 ↔ 画布同步**——两个视图必须对节点身份和顺序达成一致，并理想地共享每个节点正文的富文本表示。

我们还需要表达「自由箭头」（跨树结构的关系线），纯树无法表达。

---

## Decision

### English

```ts
interface Doc {
  version: 1;
  rootId: string;
  nodes: Record<NodeId, Node>;
  edges: Record<EdgeId, FreeEdge>;
  theme: string;
  meta: { title: string; createdAt: number; updatedAt: number };
}

interface Node {
  id: NodeId;
  parentId: NodeId | null;
  childIds: NodeId[];     // explicit ordering
  content: RichText;      // ProseMirror JSON
  collapsed?: boolean;
  note?: RichText;
  icon?: string;
  color?: string;
  side?: 'left' | 'right';
}
```

- **Flat `nodes` map** keyed by stable `NodeId`.
- **`parentId` + `childIds`** maintained on both sides (denormalized): O(1) lookup in either direction.
- **`content` is ProseMirror JSON**, same shape Tiptap uses in the outline view. This makes the *doc-node* content shareable; cursor / selection sync is a *separate* engineering effort (see below).
- **Free arrows** live in a separate `edges` map.

### 中文

数据结构同上代码块（结构是语言无关的）。要点：

- **平铺 `nodes` 表**，用稳定的 `NodeId` 做 key。
- **`parentId` + `childIds` 双向冗余存储**：两个方向查找都 O(1)。
- **`content` 是 ProseMirror JSON**，跟 Tiptap 在大纲视图里用的形状一致。这让**节点正文**可以共享；**光标 / 选区同步是另一回事**（见下）。
- **自由箭头**住在单独的 `edges` 表里。

---

## Consequences

### English

**Pros**

- CRUD is O(1). Move = change `parentId` + splice two `childIds` arrays.
- Migration path to CRDT (Y.js / Loro) is clean: `Y.Map<NodeId, Y.Map>` matches the shape almost 1:1.
- Outline and canvas can use the same ProseMirror JSON for node content (no transform layer between models).
- Free arrows are a first-class concept, not a hack on top of the tree.

**Cons / open risks**

- **Sharing cursor / selection between outline and canvas is *not* free.** Tiptap maintains its own `EditorState`, and selection lives there, not in the doc. Outline ↔ canvas selection sync requires either (a) using ProseMirror's collaboration plugin with the same `Y.XmlFragment` backing both editors, or (b) explicit transaction patching with origin tracking. Both are real engineering work — budgeted in v0.1-spike (R1).
- **`side: 'left' | 'right'` is currently a root-only concept.** This is fine for classical mind maps but limits future layouts (org chart with sided branches, asymmetric subtrees). When the second layout type lands, this field will likely need to generalize.
- **Tree traversal requires building the parent→children map at runtime** (cheap, but not free).
- **Consistency burden:** `parentId` and `childIds` must always agree. All writes go through `core/ops.ts` to enforce it — never mutate a node directly.
- Storage is slightly larger than a nested representation (children stored twice: by ID and by order).

**Mitigations**

- All mutations go through `core.applyOp(doc, op)`. No component is allowed to mutate `doc.nodes` directly.
- Validation pass on import / load asserts every `parentId` ↔ `childIds` pair is consistent and fixes drift.
- `core/select.ts` memoizes derived views (`childrenOf`, `pathTo`, `subtreeOf`) keyed on the relevant slice.
- The selection-sync mechanism is the most important spike deliverable — see [DESIGN §3](../docs/DESIGN.md#3-v01-spike-validate-the-lynchpin).

### 中文

**优点**

- CRUD 是 O(1)。移动节点 = 改 `parentId` + 在两个 `childIds` 数组里 splice。
- 迁移到 CRDT（Y.js / Loro）路径干净：`Y.Map<NodeId, Y.Map>` 与之几乎 1:1。
- 大纲和画布可以用同一份 ProseMirror JSON 做节点正文（模型间没有转换层）。
- 自由箭头是一等公民概念，不是树之上的 hack。

**缺点 / 开放风险**

- **大纲与画布共享光标 / 选区不白送。** Tiptap 自己维护 `EditorState`，选区住在那里，不在 doc 里。两视图选区同步需要要么 (a) 用 ProseMirror collaboration 插件让两个编辑器共享同一个 `Y.XmlFragment`，要么 (b) 显式 transaction patching + origin tracking。两条路都是真工程量——已纳入 v0.1-spike 预算（R1）。
- **`side: 'left' | 'right'` 目前只是 root 才用的概念。** 经典脑图够用，但限制未来布局（带左右分支的组织图、非对称子树）。第二种布局结构落地时这个字段大概率要泛化。
- **树遍历需要在运行时构建「父→子」映射**（便宜，但不白送）。
- **一致性负担：** `parentId` 和 `childIds` 必须始终一致。所有写入走 `core/ops.ts` 来强制——**绝不直接 mutate 节点**。
- 存储稍大于嵌套表示（子节点存了两次：按 ID 和按顺序）。

**缓解措施**

- 所有变更走 `core.applyOp(doc, op)`。任何组件都不允许直接 mutate `doc.nodes`。
- 导入 / 加载时做校验，断言每对 `parentId` ↔ `childIds` 一致并修正漂移。
- `core/select.ts` 对派生视图（`childrenOf`、`pathTo`、`subtreeOf`）按相关切片做 memo。
- 选区同步机制是 spike 最重要的交付物——见 [DESIGN §3](../docs/DESIGN.zh-CN.md#3-v01-spike验证命门)。
