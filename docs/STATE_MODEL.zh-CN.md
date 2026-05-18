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

### v0.1-spike 实现现状

EditorBridgeState 在 spike 阶段是**分散在 `src/editor/NodeEditor.tsx` 的 ref + state**，不是集中式 store。
等 v0.1-release 阶段稳定再上集中式 hook。当前各项实现状态：

| 字段 / 能力 | 实现方式 | 文件 |
|---|---|---|
| **origin 标签** | `applyDocOp(op, origin)` 把 `EditorSurface` 当 `OpOrigin` 传进 store | `src/app.tsx` 的 `applyOperation` |
| **回环防抖** | `richTextSignature(content)` 稳定签名比较，匹配则跳过 setContent | `src/editor/NodeEditor.tsx` `lastSignatureRef` |
| **IME composition guard** | `useState(isComposing)` + setContent effect 依赖 `isComposing`，composition 结束自动补同步 | `src/editor/NodeEditor.tsx` |
| **selection mirror 防回环** | `isApplyingMirrorRef` 在程序化 `setTextSelection` 期间屏蔽 `onSelectionUpdate` | `src/editor/NodeEditor.tsx` |
| **suppressedOrigins** | 暂未集中实现——目前依赖 signature + isApplyingMirror 两道闸门 | — |
| **activeComposition / lastMirroredSelection** | 暂未集中实现；调试用 `formatSelectionMirror` 把当前 `TextSelectionMirror` 投到 `.bridge-status` | `src/editor/selection.ts` |

未实现的字段不是因为不需要，是因为 spike 阶段「signature + isApplyingMirror + isComposing」已经足以挡住死循环；
集中式 EditorBridgeState 等 v0.1-release 引入「多 surface 同时编辑」或「AI 流式 patch」时再补。

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

终态目标：UI 不订阅整份 doc，优先暴露这些 hook / selector：

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

- `useDoc()` **在 v0.1-release 及之后**只允许 debug、import/export、devtools 使用。
- 普通节点组件必须按 `NodeId` 订阅自己的 slice。
- layout 可以读取必要的 doc 派生结构，但必须 memo。

### v0.1-spike 例外条款（已退出，2026-05-18）

最初 v0.1-spike 阶段 App 通过 `useSyncExternalStore(store.subscribe, store.getDoc)` 订阅**整份 doc**，
作为「dual source of truth」清零后的暂态。v0.1-release 引入了 slice 订阅，已经退出这个例外。

- **现在的形状**：App 用 `useStructureRevision()` 订阅 `CoreStore.subscribeStructure` —— 仅在
  非 updateContent 的 op 上触发；layout / outline flatten / canvas culling 只在结构变更时重算。
- **content 走 slice 订阅**：`NodeEditorSlot` 用 `useNode(nodeId)` 通过 `CoreStore.subscribeNode` 拿到自己节点的 content，
  键入一字 → 只这一个 slot 重渲；App / OutlinePane / SpikeCanvas 都不动。
- **canUndo / canRedo** 用 `useCanUndo()` / `useCanRedo()`，订阅 full store 但 useSyncExternalStore 的 boolean 比较保证
  App 仅在 flip 时重渲，不会被 keystroke 高频触发。
- **structureRevision 的口径**：除了 `updateContent`，其他 op（insertNode / deleteSubtree / moveNode / setCollapsed /
  updateNodeMeta / setTheme / *FreeEdge / undo / redo）都会 bump。

ESLint 阻断 `src/core/` 外引入 zustand 的规则仍然有效；context + 三个 hook 都走 `CoreStore` 公开接口，
没有泄漏 zustand store 本身。

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

### v0.1 实现：LocalStorage backup

模块：`src/io/local-storage-persistence.ts`。

- **Key**：`mindforge:doc:v1`。schema 升级时写新 key（`v2`），保留 `v1` 一个 release 周期作为回退安全网。
- **写**：`subscribeStorePersistence(store, { debounceMs: 500 })`，对 `CoreStore.subscribe` 做 debounce；`unsubscribe()` 同步 flush 一次，避免 tab close / route change 丢失最后一次按键。
- **读**：`loadStoredDoc()`，先 `repairDoc` 兜底 drift，再 `validateDoc` 校验；失败一律返回 `null` 退到 spike seed。
- **不持久化的场景**：URL 带 `?fixture=...` 时（benchmark 模式），既不读 stored，也不订阅 persist，避免 benchmark 污染用户文档。
- **错误吞下**：QuotaExceeded / 私有模式 storage 不可用 / JSON 解析失败——全部走 `PersistenceLogger.warn`，不抛错、不中断编辑。
- **不持久化的字段**：undo stack（v0.1 默认）、ViewState、EditorBridgeState、SelectionState——重启后回到默认。
