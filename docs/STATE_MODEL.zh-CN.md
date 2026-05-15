# MindForge — 状态模型规格

> 本文定义 MindForge 的状态分层。核心目标：文档内容、视图状态、编辑器桥接状态不要混成一团。

## 1. 状态分层

MindForge 至少有四类状态：

| 状态 | 内容 | 是否持久化 | 是否进入内容 undo |
|---|---|---|---|
| `DocState` | mind map 文档：节点、边、主题、meta | 是 | 是 |
| `ViewState` | viewport、selection、hover、active panel、展开中的弹层 | 否 | 否 |
| `EditorBridgeState` | outline / canvas 的 ProseMirror transaction origin、composition 状态、selection mirror 状态 | 否 | 否 |
| `HistoryState` | doc operation history、redo stack、transaction group | 否，未来可选 | 管理 undo 本身 |

最重要的边界：**`DocState` 是文档事实来源；selection / cursor 不属于 `DocState`。**

## 2. DocState

`DocState` 只存可保存到磁盘的内容：

```ts
interface DocState {
  doc: Doc;
  revision: number;
  lastAppliedOpId?: OpId;
}
```

`Doc` 的结构由设计文档和 ADR-0002 定义。任何改变 `DocState.doc` 的行为必须通过 `DocOperation`。

## 3. ViewState

`ViewState` 存当前用户界面的临时状态：

```ts
interface ViewState {
  viewport: ViewportState;
  selection: SelectionState;
  hover?: HoverState;
  activePanel: 'canvas' | 'outline' | 'ai' | 'none';
  focusedSurface: 'canvas' | 'outline' | 'dialog' | 'none';
}

interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}
```

`ViewState` 不进入文档 undo stack。比如 pan / zoom、hover、打开菜单、普通 selection 变化都不能污染内容历史。

## 4. SelectionState

selection 需要能表达“选中节点”和“选中节点内文字”两类情况：

```ts
type SelectionState =
  | { kind: 'none' }
  | {
      kind: 'node';
      nodeIds: NodeId[];
      primaryNodeId: NodeId;
      origin: OpOrigin;
      updatedAt: number;
    }
  | {
      kind: 'node-content';
      nodeId: NodeId;
      anchor: RichTextPosition;
      head: RichTextPosition;
      origin: OpOrigin;
      updatedAt: number;
    };

interface RichTextPosition {
  // Node-local ProseMirror position, not outline-global position.
  pos: number;
}
```

规则：

- `node-content` 的 `pos` 必须是 node-local，不允许把 outline 全局 offset 泄露给 canvas。
- outline ↔ canvas 的映射由 `EditorBridgeState` 负责。
- selection 可镜像，但不是文档内容。
- selection 默认不进入 undo stack。

## 5. EditorBridgeState

`EditorBridgeState` 是同步层的状态，不是业务文档：

```ts
interface EditorBridgeState {
  activeComposition?: {
    surface: 'outline' | 'canvas';
    nodeId: NodeId;
    startedAt: number;
  };
  lastMirroredSelection?: {
    from: 'outline' | 'canvas';
    to: 'outline' | 'canvas';
    nodeId: NodeId;
    revision: number;
  };
  suppressedOrigins: Set<OpOrigin>;
}
```

用途：

- 防止 outline 和 canvas transaction 互相回放导致死循环。
- 在 IME composition 期间延迟或合并 mirror。
- 记录最近一次 selection mirror，便于 debug。

## 6. HistoryState

内容 undo 只追踪 `DocOperation`：

```ts
interface HistoryState {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

interface HistoryEntry {
  id: OpId;
  label: string;
  origin: OpOrigin;
  ops: DocOperation[];
  inverseOps: DocOperation[];
  timestamp: number;
}
```

规则：

- `ViewOperation` 不进入 `HistoryState`。
- 连续输入可以合并成一个 history entry，但必须保留正确 inverse。
- AI destructive 操作必须可撤销，或在执行前要求确认。
- 未来 CRDT 阶段需要区分 `local` undo 和 `global` undo。

## 7. Operation 分层

```ts
type AppOperation = DocOperation | ViewOperation;
```

- `DocOperation`：改变持久化文档内容，例如新增节点、移动节点、更新正文、删除子树、折叠节点。
- `ViewOperation`：改变界面状态，例如 set selection、set viewport、set hover、open panel。

核心规则：

- `core.applyDocOp(...)` 只接受 `DocOperation`。
- `view.applyViewOp(...)` 或 store view slice 处理 `ViewOperation`。
- `setSelection` 不是 `DocOperation`。

## 8. Store 公开访问

UI 不应该订阅整份 doc。优先暴露这些 hook / selector：

```ts
useNode(nodeId)
useChildIds(nodeId)
useRootId()
useNodeContent(nodeId)
useSelection()
useViewport()
useLayoutNode(nodeId)
```

限制：

- `useDoc()` 只允许 debug、import/export、devtools 使用。
- 普通节点组件必须按 `NodeId` 订阅自己的 slice。
- layout 可以读取必要的 doc 派生结构，但必须 memo。

## 9. 持久化边界

保存到磁盘：

- `DocState.doc`

不保存到磁盘：

- selection
- viewport
- hover
- active panel
- bridge state
- undo stack（v0.1 默认不保存）

LocalStorage 自动备份只备份 `Doc`。如果要恢复 UI 状态，必须作为单独 feature 设计。
