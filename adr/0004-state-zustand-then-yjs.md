# ADR-0004 — State Management: Zustand Now, CRDT Later

**Status:** Accepted · 2026-05-15 · revised after design reflection

---

## Context

### English

We need a state container that:

1. Holds the document (flat node map per [ADR-0002](./0002-document-model-flat.md)) plus ephemeral UI state (selection, hover, zoom).
2. Supports fast, scoped subscriptions — a node component should re-render only when its own `Node` slice changes.
3. Supports operation-based undo / redo.
4. **Can be replaced by a CRDT (Y.js or Loro) in v0.3** without rewriting consumers, when we add collaboration.

Options considered:

- **Redux Toolkit** — Battle-tested, but heavy for a single-app editor; the selector overhead is non-trivial.
- **Jotai** — Atom-based; great for derived state, but the doc is one big shared object, not many atoms.
- **Y.js directly from day one** — Tempting, but Y.js has a steep mental model, awkward debugging, and we lose ~3 weeks getting v0.1 out the door.
- **Loro directly from day one** — Younger than Y.js but with cleaner semantics and built-in time travel. Even less mature ecosystem and tooling than Y.js, harder to take on day one.
- **Zustand** — Tiny (~1KB), TypeScript-friendly, supports selectors with shallow compare, integrates with Immer, no Provider boilerplate.

**The non-obvious constraint:** CRDT migration is *not* a drop-in. The differences that *will* leak through the API:

- Undo: `Y.UndoManager` is scoped per Y.Doc and per origin; cross-user undo has semantic limits. "Undo my changes" vs "undo last change" must be distinguished.
- Awareness / presence: a CRDT concept with no Zustand analogue. The API will *grow* in v0.3 to include it.
- Origin tracking: `Doc.transact(origin)` is fundamental to CRDT loop prevention; the Zustand-era ops layer has to be designed *as if* origins exist.
- Async transactions: CRDT transactions can be batched / merged across the network; consumers must not assume synchronous post-condition.

So the goal is not "drop-in", it is: **the op-based mutation API stays the same; undo semantics and subscription semantics are explicitly versioned and may shift between v0.2 and v0.3**.

### 中文

需要一个状态容器，要满足：

1. 装文档（[ADR-0002](./0002-document-model-flat.md) 里的平铺节点表）+ 临时 UI 状态（选区、hover、缩放）。
2. 支持快速、按需的订阅——节点组件只在自己那份 `Node` 切片变化时才重渲。
3. 支持基于操作的撤销 / 重做。
4. **v0.3 加协作时能换成 CRDT（Y.js 或 Loro）而不重写消费者**。

考虑过：

- **Redux Toolkit**——久经考验，但对单 app 编辑器偏重；selector 开销不可忽略。
- **Jotai**——原子化，派生状态很爽，但文档是一个大共享对象，不是一堆原子。
- **第一天就上 Y.js**——很诱人，但 Y.js 心智模型陡、调试别扭，会让 v0.1 推迟约 3 周。
- **第一天就上 Loro**——比 Y.js 年轻、语义更干净、内建时间旅行。生态和工具更不成熟，第一天上风险更大。
- **Zustand**——超小（~1KB）、对 TS 友好、selector 支持浅比较、能跟 Immer 集成、没有 Provider 样板。

**不那么显眼的约束：** CRDT 迁移**不是 drop-in**。会从 API 漏出来的差异：

- 撤销：`Y.UndoManager` 按 Y.Doc 和 origin 作用域；跨用户撤销有语义限制。「撤销我的修改」和「撤销最后一次修改」必须区分。
- Awareness / presence：CRDT 概念，Zustand 没对应物。v0.3 时 API 会**增长**纳入它。
- Origin 跟踪：`Doc.transact(origin)` 是 CRDT 防回环的根基；Zustand 阶段的 ops 层就要**假装 origin 存在**来设计。
- 异步事务：CRDT 事务可以跨网络批合并；消费者不能假设同步后置条件。

所以目标不是「drop-in」，是：**基于操作的变更 API 不变；撤销语义和订阅语义显式版本化，v0.2 → v0.3 之间可能变**。

---

## Decision

### English

- **Phase 1 (v0.1 – v0.2):** Zustand + Immer holds `Doc` and ephemeral UI state.
- **Public API is `core.applyDocOp(op)` + scoped selectors** — never expose the Zustand store directly to consumers.
- **Phase 2 (v0.3):** Replace the Zustand store internals with `Y.Doc` (or Loro — final pick made during v0.2 based on stability and ergonomics at that time). The `core` op API stays the same. Undo and awareness APIs grow.

```ts
// core/store.ts — single mutation entrypoint, regardless of backend
export interface CoreStore {
  applyDocOp(op: DocOperation, origin: OpOrigin): ApplyResult;  // origin = forward-compat for CRDT
  applyDocTransaction(ops: DocOperation[], origin: OpOrigin): ApplyResult;
  undo(scope?: 'local' | 'global'): ApplyResult;                 // scope = explicit for forward-compat
  redo(scope?: 'local' | 'global'): ApplyResult;
  subscribeNode(id: NodeId, fn: (n: Node) => void): Unsubscribe;
  subscribeChildIds(id: NodeId, fn: (ids: NodeId[]) => void): Unsubscribe;
}
```

Both Zustand and a CRDT can implement this interface. In Phase 1 `origin` is ignored and `scope` defaults to `global`. In Phase 2 they become meaningful.

### 中文

- **第一阶段（v0.1 – v0.2）：** Zustand + Immer 装 `Doc` 和临时 UI 状态。
- **对外 API 是 `core.applyDocOp(op)` + 按需 selector**——**绝不**直接把 Zustand store 暴露给消费者。
- **第二阶段（v0.3）：** Zustand store 内部实现换成 `Y.Doc`（或 Loro——v0.2 期间根据当时的稳定性和工程学终选）。`core` 的 op API 不变。撤销和 awareness API 会**增长**。

同上代码块（接口语言无关）。第一阶段 `origin` 忽略、`scope` 默认 `global`；第二阶段二者都有实际意义。

---

## Consequences

### English

**Pros**

- Fast time-to-MVP — Zustand is learnable in an hour.
- Clean abstraction boundary forces consumers to use ops instead of direct mutation, which is the right hygiene regardless of backend.
- No collaboration tax paid in v0.1.
- Forward-compatible `origin` / `scope` signatures mean consumers don't break in v0.3 even though semantics tighten.

**Cons**

- The scoped subscription API is slightly heavier than just `useStore(selector)` — the indirection is the point.
- We must resist importing the Zustand store from anywhere outside `core/`. ESLint rule enforces.
- Awareness, presence cursors, and remote-undo conflict resolution are not designed in Phase 1; v0.3 will introduce them. This is *acceptable but not free*.
- Loro vs Y.js decision is deferred to v0.2. If their semantics diverge meaningfully, the `core.undo` contract may need a minor revision at swap time.

**Mitigations**

- ESLint rule: only files inside `src/core/` may import `zustand`.
- The v0.1 `core/store.ts` is written with a fake CRDT-shaped transaction log so the diff to Y.js / Loro is visibly small.
- Document the migration contract in `src/core/README.md` so v0.3 work has a checklist.
- v0.2 includes a "CRDT bake-off" spike: implement the doc model in both Y.js and Loro, compare undo / awareness / sync ergonomics, decide.

### 中文

**优点**

- 出 MVP 快——Zustand 一小时上手。
- 干净的抽象边界强制消费者用操作而不是直接 mutate，这是不论用什么后端都该有的卫生。
- v0.1 不用付协作税。
- 向前兼容的 `origin` / `scope` 签名意味着 v0.3 语义收紧也不破坏消费者。

**缺点**

- 按需订阅 API 比 `useStore(selector)` 稍重——这层间接本来就是设计目标。
- 必须忍住在 `src/core/` 之外的地方 import Zustand store 的诱惑。ESLint 规则强制。
- Awareness、presence 光标、远端撤销冲突解决在第一阶段不设计；v0.3 引入。这**可以接受但不是白送**。
- Loro vs Y.js 决策推迟到 v0.2。如果二者语义差异显著，换的时候 `core.undo` 合约可能要小修。

**缓解措施**

- ESLint 规则：只有 `src/core/` 里的文件可以 import `zustand`。
- v0.1 的 `core/store.ts` 用伪 CRDT 形状的事务日志写，让到 Y.js / Loro 的 diff 肉眼可见地小。
- 迁移契约写在 `src/core/README.md` 里，v0.3 工作有 checklist。
- v0.2 含「CRDT bake-off」spike：在 Y.js 和 Loro 各实现一遍 doc 模型，比较撤销 / awareness / 同步工程学，再定。
