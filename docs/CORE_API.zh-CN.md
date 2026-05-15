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
export type { DocOperation, OpOrigin, ApplyResult, ValidationResult };
export { createEmptyDoc, validateDoc, repairDoc };
export { applyDocOp, applyDocTransaction, invertDocOperation };
export { selectNode, selectChildIds, selectSubtree, selectPath };
export { createCoreStore };
```

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
  context: ApplyContext
): ApplyResult;

function applyDocTransaction(
  doc: Doc,
  ops: DocOperation[],
  context: ApplyContext
): ApplyResult;

interface ApplyResult {
  ok: boolean;
  doc?: Doc;
  inverseOps?: DocOperation[];
  validation?: ValidationResult;
  error?: CoreError;
}
```

规则：

- apply 必须是 immutable：不修改输入 doc。
- transaction 必须原子化：任一 op 失败，整个 transaction 不生效。
- apply 失败必须返回错误，不允许半成功。
- import / load 可以 repair；普通用户操作不能静默 repair。

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

`repairDoc(doc)` 只用于 import / load，并且必须返回 repair report。

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
  applyDocOp(op: DocOperation, origin: OpOrigin): ApplyResult;
  applyDocTransaction(ops: DocOperation[], origin: OpOrigin): ApplyResult;
  undo(scope?: 'local' | 'global'): ApplyResult;
  redo(scope?: 'local' | 'global'): ApplyResult;
  subscribeNode(id: NodeId, fn: (node: Node) => void): Unsubscribe;
  subscribeChildIds(id: NodeId, fn: (childIds: NodeId[]) => void): Unsubscribe;
}
```

`subscribeDoc` 如果存在，只允许 debug、import/export、devtools 使用。普通 UI 不应该订阅整份 doc。

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
