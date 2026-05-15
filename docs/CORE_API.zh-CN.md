# MindForge — Core API 规格

> 本文定义 `src/core/` 对外暴露的最小 API。它是后续实现、测试和 AI coding 的边界。

## 1. Core 的职责

`src/core/` 负责：

- Doc schema 和类型。
- DocOperation 定义。
- validation / repair。
- selectors。
- operation apply。
- inverse operation。
- doc history。
- store adapter。

`src/core/` 不负责：

- React 组件。
- DOM measurement。
- Tiptap editor instance 生命周期。
- AI provider 调用。
- PNG / SVG 导出细节。
- viewport / hover / selection UI 状态。

## 2. 公开入口

只有 `src/core/index.ts` 是跨模块公开入口。

允许导出：

```ts
export type { Doc, Node, FreeEdge, NodeId, EdgeId };
export type { DocOperation, OpOrigin, ApplyResult, ApplyOptions, ValidationResult };
export { createEmptyDoc, validateDoc, repairDoc };
export { applyDocOp, applyDocTransaction };
export { selectNode, selectChildIds, selectSubtree, selectPath };
export { createTextDoc, getPlainText, isRichText, richTextSignature };
export { createCoreStore };
```

`richTextSignature(content)` 产出 key 顺序稳定的字符串签名，供编辑器桥用来判断「这是不是我自己刚发的更新」。
不要把它当持久化字段写进 doc——它只是回灌防抖的临时键。

撤销不是独立 API。`applyDocOp` / `applyDocTransaction` 在成功 result 里附 `inverseOps`，
调用方（通常是 `CoreStore`）入栈，回滚时再 apply 一次即可。没有 `invertDocOperation` 这种「不 apply 也能算 inverse」
的入口——一次未应用就计算 inverse 没有现实场景，写出来语义还容易错位。

不允许跨模块 import：

- `src/core/store/internal/*`
- `src/core/ops/internal/*`
- `src/core/validation/internal/*`

## 3. DocOperation

`DocOperation` 只表达持久化文档内容变化：

```ts
type DocOperation =
  | InsertNodeOp
  | DeleteSubtreeOp
  | MoveNodeOp
  | UpdateContentOp
  | SetCollapsedOp
  | UpdateNodeMetaOp
  | AddFreeEdgeOp
  | UpdateFreeEdgeOp
  | DeleteFreeEdgeOp
  | SetThemeOp;
```

不属于 `DocOperation`：

- `setSelection`
- `setViewport`
- `setHover`
- `openPanel`
- `startComposition`
- `mirrorSelection`

这些属于 `ViewOperation` 或 `EditorBridgeState`。

## 4. Operation 合约

每个 op 必须定义：

| 字段 | 要求 |
|---|---|
| `id` | 稳定唯一，便于 history / debug |
| `type` | 字面量 discriminant |
| `payload` | 只包含应用该 op 必需的数据 |
| `origin` | 由 apply 层接收，不塞进 payload |
| `inverse` | 能生成撤销操作 |
| `validation` | apply 前必须校验 |

建议形状：

```ts
interface BaseDocOperation {
  id: OpId;
  type: string;
}

interface ApplyContext {
  origin: OpOrigin;
  timestamp: number;
  history: 'record' | 'skip';
}
```

## 5. Apply API

```ts
function applyDocOp(
  doc: Doc,
  op: DocOperation,
  context: ApplyContext,
  options?: ApplyOptions
): ApplyResult;

function applyDocTransaction(
  doc: Doc,
  ops: DocOperation[],
  context: ApplyContext,
  options?: ApplyOptions
): ApplyResult;

interface ApplyResult {
  ok: boolean;
  doc?: Doc;
  inverseOps?: DocOperation[];
  validation?: ValidationResult;
  error?: CoreError;
}

interface ApplyOptions {
  /**
   * 跳过入口处对 doc 的 validateDoc。仅当调用方能保证 doc 已经被校验过
   * （例如来自 store 自己上一次 apply 的输出）时才传 true。
   * 出口处的 validateDoc 始终会跑，永远会捕获非法的最终状态。
   */
  skipInputValidation?: boolean;
}
```

规则：

- apply 必须是 immutable：不修改输入 doc。
- transaction 必须原子化：任一 op 失败，整个 transaction 不生效。
- apply 失败必须返回错误，不允许半成功。
- import / load 可以 repair；普通用户操作不能静默 repair。
- 默认会在入口对 `doc` 跑一次 `validateDoc` 作为防御性检查；`skipInputValidation` 只是性能旋钮，
  不改变正确性保证——出口的 validate 仍然兜底。
- `CoreStore` 内部所有调用都会传 `skipInputValidation: true`，因为它在构造时已 validate `initialDoc`，
  之后只接收自己上一次 apply 的输出。

## 6. Validation

`validateDoc(doc)` 至少检查：

- `rootId` 存在。
- root node 的 `parentId === null`。
- 只有一个 root。
- 每个非 root node 的 `parentId` 存在。
- `parentId` 与父节点 `childIds` 双向一致。
- `childIds` 不重复。
- 没有环。
- 所有 node 都能从 root 到达；不可达 node 要报错或 repair。
- `edges` 的 `fromNodeId` / `toNodeId` 都存在。
- `side` 只允许 root 的直接子节点使用。
- ProseMirror JSON 满足当前 schema。

实现细节（v0.1-spike）：

- 可达性 + 环检测合并成一次 O(N) 染色 DFS；环节点报 `CYCLE_DETECTED`，不会再叠加一条 unreachable。
- 一个节点最多只属于「reachable / unreachable / cycle」中的一类。

`repairDoc(doc)` 只用于 import / load，并且必须返回 repair report。两轮修复：

1. **Pass 1**：丢掉 `childIds` 里指向不存在节点、parentId 不一致或重复的项。
2. **Pass 2**：把 `parentId` 指向但 parent.childIds 漏列的孤儿按 id 排序 append 到 parent.childIds，
   兑现 [ADR-0002](../adr/0002-document-model-flat.md) 「parentId ↔ childIds 一致性自动修复」承诺。

## 7. Selectors

selectors 必须是纯函数：

```ts
selectNode(doc, nodeId)
selectChildIds(doc, nodeId)
selectChildren(doc, nodeId)
selectSubtree(doc, nodeId)
selectPath(doc, nodeId)
selectEdgesForNode(doc, nodeId)
```

规则：

- selector 不触发 layout。
- selector 不读 store。
- selector 不做 DOM measurement。
- 重型 selector 需要 memo，memo key 必须与相关 doc slice 绑定。

## 8. Store Adapter

核心 store 对 UI 暴露 scoped subscription，不暴露整份 Zustand store：

```ts
interface CoreStore {
  getDoc(): Doc;
  subscribe(fn: () => void): Unsubscribe;
  applyDocOp(op: DocOperation, origin: OpOrigin): ApplyResult;
  applyDocTransaction(ops: DocOperation[], origin: OpOrigin): ApplyResult;
  undo(scope?: 'local' | 'global'): ApplyResult;
  redo(scope?: 'local' | 'global'): ApplyResult;
  subscribeNode(id: NodeId, fn: (node: Node) => void): Unsubscribe;
  subscribeChildIds(id: NodeId, fn: (childIds: NodeId[]) => void): Unsubscribe;
}
```

合约：

- `subscribe(fn)` 在 `doc` 引用变化时触发回调；**不在订阅时立即 fire**，与 `subscribeNode` / `subscribeChildIds` 的 fire-on-subscribe 行为不同。
  设计目的是直接喂给 React 的 `useSyncExternalStore(subscribe, getDoc)`，所以快照通过 `getDoc()` 同步获取。
- `subscribeNode(id, fn)` / `subscribeChildIds(id, fn)` 在订阅时同步触发一次（初始快照），之后只在对应切片引用变化时触发。
- `createCoreStore(initialDoc)` 构造时会跑一次 `validateDoc(initialDoc)`，失败抛错；后续 `applyDoc*` 调用都走 `skipInputValidation: true`。
- 失败的 op 不会推进 `revision`，也不会触发 `subscribe` 回调（doc 引用未变）。

注意：v0.1-spike 阶段允许「App 通过 `useSyncExternalStore(subscribe, getDoc)` 订阅整份 doc」作为 dual-source-of-truth 的替代方案，
但这并不是终态——v0.1-release 之前应该把 OutlinePane / SpikeCanvas 的子组件改成 `subscribeNode` 风格的 slice 订阅。详见
[STATE_MODEL §8](./STATE_MODEL.zh-CN.md#8-store-公开访问)。

## 9. Error Model

Core error 必须可读、可测试：

```ts
type CoreErrorCode =
  | 'NODE_NOT_FOUND'
  | 'EDGE_NOT_FOUND'
  | 'INVALID_PARENT'
  | 'CYCLE_DETECTED'
  | 'DUPLICATE_CHILD'
  | 'INVALID_RICH_TEXT'
  | 'VALIDATION_FAILED';
```

错误信息包含：

- code
- message
- op id
- node id / edge id（如适用）
- validation path（如适用）

## 10. 测试矩阵

每个 DocOperation 至少测试：

- 成功 apply。
- 失败 apply 不修改 doc。
- inverse op 能恢复原文档。
- validation 能捕获非法状态。
- transaction 中失败会 rollback。

关键 op 的额外测试：

- `MoveNodeOp`：拒绝移动到自己、移动到后代、重复 child、非法 parent。
- `DeleteSubtreeOp`：删除整棵子树，删除相关 free edges，不能删除 root（除非通过专用 reset op）。
- `UpdateContentOp`：校验 ProseMirror JSON；连续输入可 history merge。
- `AddFreeEdgeOp`：拒绝不存在端点；允许或拒绝自环必须显式决定。

## 11. AI 与 Core

AI 层只能生成候选 `DocOperation[]`：

```ts
interface CandidatePatch {
  summary: string;
  ops: DocOperation[];
  warnings: string[];
}
```

执行流程：

1. AI 输出 structured candidate patch。
2. core dry-run `applyDocTransaction`。
3. validation 通过。
4. UI preview / confirm（destructive 操作必需）。
5. apply 到真实 doc。

AI 不允许直接写 `Doc`。
