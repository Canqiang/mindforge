# MindForge — 设计文档

> [English version](./DESIGN.md)
>
> **状态：** 活文档。v0.1-release 之前的数字和决策都是「尽力估」，会随着 spike 验证假设而修订。

本文档记录 MindForge 的产品定位、开放风险、范围、技术决策与路线图。每条具体决策见 [`adr/`](../adr)。执行规格见 [`SPIKE_PLAN.zh-CN.md`](./SPIKE_PLAN.zh-CN.md)、[`STATE_MODEL.zh-CN.md`](./STATE_MODEL.zh-CN.md)、[`CORE_API.zh-CN.md`](./CORE_API.zh-CN.md)。AI / vibe coding 执行规则见 [`VIBE_CODING_RULES.zh-CN.md`](./VIBE_CODING_RULES.zh-CN.md)，根目录 [`AGENTS.md`](../AGENTS.md) 是给 agent 的最小执行契约。

## 1. 产品定位

**MindForge** 是一个漂亮、AI 原生、开源的思维导图编辑器。目标是做日常笔记和结构化思考场景下 XMind 的开源替代——**不是**复刻 XMind 的全部图表类型。

| 维度 | 定位 |
|---|---|
| 一句话 | 漂亮、AI 原生的开源思维导图编辑器——Markdown 友好、Local-first。 |
| 核心用户 | 程序员、产品/咨询、研究生。已经在用 Markdown，受不了 XMind 收费 + 界面老气，受不了 markmap 不能编辑。 |
| 杀手锏 | ① 大纲 ↔ 画布 实时双向同步 ② AI 侧栏（扩写 / 重组 / 总结 / 反向大纲化） ③ 默认就好看 |
| **不做** | 多种图表类型（鱼骨、矩阵、甘特）、重型样式编辑器、团队工作空间——这些是 XMind 的舒适区，正面打没意义。 |
| **移动端** | v0.1 只读浏览。编辑仅桌面 / iPad——DOM + contenteditable + drag 在手机上不能优雅降级。 |
| **AI 隐私** | 本地 Ollama 优先；云端 provider 走 BYO key 且明确征求同意。**绝不**收集文档内容遥测。 |

## 2. 开放风险与未知

下列在 v0.1-spike 之前未解决。spike 的存在就是为了解决其中承重的几条（R1–R4）。

| # | 风险 | 为什么重要 | 何时能知 |
|---|---|---|---|
| R1 | 大纲 ↔ 画布选区同步发卡（光标跳、输入法乱） | 杀手锏崩盘 | v0.1-spike 结束时 |
| R2 | DOM 节点性能上限低于预期 | 限制目标用户；可能要重写为 Canvas | spike benchmark：500 / 1000 / 2000 节点 |
| R3 | 每个节点一个 Tiptap 实例代价太高 | 被迫改成单编辑器 + 视口相对渲染——难得多 | v0.1-spike |
| R4 | DOM 文字在 CSS 缩放下渲染丑（subpixel / reflow） | 思维导图频繁缩放，毁手感 | v0.1-spike |
| R5 | `html-to-image` 导出 PNG 在 web font / CSS 变量 / foreignObject 上有 bug | 用户高频功能，XMind 常用场景 | v0.1 中期 |
| R6 | v0.3 Y.js 迁移不是真的 drop-in（撤销 / awareness 语义会变） | 可能要改消费者，不只是内部 | v0.3 规划时 |
| R7 | 「MindForge」与现存商标 / npm 包冲突 | 自行车棚问题，但发版前必须解决 | v0.1-release 前 |
| R8 | 画布的无障碍非 trivial（焦点模型、读屏层级） | 开源项目不能发不可访问的版本 | v0.1 中期 |
| R9 | Reingold-Tilford + 左右双向 + 子树避让，比 200 行难得多 | 拖延工期；影响手感 | v0.1-spike（基础）+ v0.1（避让） |

## 3. v0.1-spike：验证命门

**时长：** 2–3 周。
**唯一目标：** 证明大纲 ↔ 画布双向同步（包括选区）手感好。

**在范围内：**

- 文档模型（平铺节点表，`parentId` + `childIds`，ProseMirror JSON 正文）
- 一个 Tiptap 大纲编辑器（绑定到 doc 的 bullet list）
- 画布：DOM 节点按简单左/右布局（无子树避让），直线连边，平移 + 缩放
- 双向同步：两个视图任一处输入都更新另一处；选区 / 光标跨视图镜像
- 一套默认主题（够用就行，不丢人）
- Benchmark harness：100 / 500 / 1000 / 2000 节点的帧时、输入延迟、布局耗时

**不在范围：** 多主题、AI、自由箭头、导入 / 导出、拖拽改父、备注、撤销，以及一切装饰性的东西。

详细执行计划和 go / no-go 标准见 [`SPIKE_PLAN.zh-CN.md`](./SPIKE_PLAN.zh-CN.md)。

**通过 = 进入 v0.1-release 的标准：**

1. 两个视图打字都瞬时（按键到画面 < 16ms）
2. 任意滚动位置下选区同步都正确
3. 1000 节点的图，平移 / 缩放保持 60fps
4. 没发现根本性架构 blocker

**spike 不过 = Plan B**：在 spike 开始前先写好备选 ADR 草稿。候选：
- (a) 大纲改为非同步独立面板（放弃杀手锏）
- (b) 渲染层从 DOM 换 Canvas（重写 `render/`，保留 `core/`）
- (c) 单个共享 Tiptap + 给每个块加虚拟化的「node views」装饰

## 4. v0.1-release：MVP 范围

「不做这条产品就不成立」的功能。**仅当 spike 通过**才动手。

**编辑**

- 节点：增删、拖拽（兄弟内排序 + 改父）、折叠/展开、富文本（粗体、斜体、code、链接）
- 节点附加：备注（弹出 markdown 编辑器）、emoji 图标、超链接
- 自由连线（跨节点的关系箭头）
- 大纲视图（左侧抽屉，与画布双向同步，含光标）
- 撤销 / 重做（基于操作）

**视图**

- 主题系统（至少 5 套：`default`、`forest`、`ocean`、`sketch`、`mono`；CSS 变量驱动）
- 自动布局（经典脑图：左右双向 + 子树避让）
- 缩放 / 平移、minimap、fit-to-screen

**文件**

- 本地保存（JSON）+ LocalStorage 自动备份
- 导入：Markdown、OPML
- 导出：PNG、SVG、Markdown、JSON

**AI 侧栏**（差异化那根针）

- 选中节点 → 扩写为子节点
- 选中子树 → 重组（合并相似、拆分过长）
- 整图 → 大纲总结
- 任意文本 → 反向变思维导图

**v0.1 明确不做：** 实时协作、移动编辑、`.xmind` 兼容、桌面壳、自定义节点形状、模板市场。

## 5. 技术栈

| 层 | 选型 | 备注 |
|---|---|---|
| 语言 | TypeScript 5.x | — |
| UI 框架 | **React 19** + Vite | 见 [ADR-0003](../adr/0003-react-as-ui-framework.md)。React Compiler 只在 MVP 时已稳定才用，否则手动 memo。 |
| 渲染 | **DOM 节点 + SVG 连线** | 见 [ADR-0001](../adr/0001-rendering-dom-plus-svg.md)。性能上限和缩放渲染是开放风险。 |
| 状态 | **Zustand + Immer**，文档 CRDT 形状 | 见 [ADR-0004](../adr/0004-state-zustand-then-yjs.md)。v0.3 切 Y.js 是**有取舍的**，不是 drop-in——undo / awareness 语义会变。 |
| 文档模型 | 平铺节点表 + `parentId` / `childIds` | 见 [ADR-0002](../adr/0002-document-model-flat.md)。 |
| 布局 | 自己写的 **Reingold-Tilford 变种** | 预算 2 周，不是 200 行。 |
| 大纲编辑器 | **Tiptap**（ProseMirror） | 选区同步是显式工程，不是副作用。 |
| AI | **Vercel AI SDK** + OpenAI / Anthropic / Ollama 适配 | 流式优先；与 provider 无关；云端 BYO key，Ollama 默认优先以保隐私。 |
| 样式 | **Tailwind v4** + CSS 变量做主题 | 主题纯 CSS 变量；加主题不动 Tailwind。 |
| 构建 | Vite + pnpm | 单包——见 §6 和 [ADR-0005](../adr/0005-single-package.md)。 |
| 桌面（v0.2+） | **Tauri 2** | 同级 `src-tauri/` 目录，不切 monorepo。 |
| 测试 | Vitest（单元）+ Playwright（E2E） | 标配。 |

## 6. 仓库布局

单包，内部用目录组织。**真有外部复用诉求**才拆 monorepo。

```
mindforge/
├── src/
│   ├── core/      # 文档模型、操作（CRUD / 移动 / 折叠）、撤销栈、store
│   ├── layout/    # 布局算法（脑图；后续：组织图 / 逻辑图）
│   ├── editor/    # 共享 Tiptap 节点编辑器 + selection bridge 原语
│   ├── render/    # React 渲染组件（节点、连线、画布、minimap）
│   ├── outline/   # Tiptap 大纲编辑器 + 与 core 的双向绑定
│   ├── theme/     # CSS 变量 + 预设主题
│   ├── ai/        # AI provider 适配 + prompt 模板
│   ├── io/        # 导入 / 导出（md / opml / json / png / svg）
│   ├── ui/        # 通用 UI（按钮、弹层、侧栏、菜单）
│   └── app.tsx
├── public/
├── examples/      # demo 文档
├── docs/
├── adr/
├── index.html
├── package.json
└── vite.config.ts
```

Tauri（v0.2）以同级 `src-tauri/` 目录加入，沿用 Tauri 标准布局。见 [ADR-0005](../adr/0005-single-package.md)。

## 7. 数据模型

```ts
// 平铺存储：CRUD O(1)，CRDT 友好
interface Doc {
  version: 1;
  rootId: string;
  nodes: Record<NodeId, Node>;
  edges: Record<EdgeId, FreeEdge>;  // 自由箭头（关系线）
  theme: string;
  meta: { title: string; createdAt: number; updatedAt: number };
}

interface Node {
  id: NodeId;
  parentId: NodeId | null;       // null = root
  childIds: NodeId[];            // 显式有序
  content: RichText;             // ProseMirror JSON——与大纲同形状
  collapsed?: boolean;
  note?: RichText;
  icon?: string;
  color?: string;                // 个例覆盖，默认走主题
  side?: 'left' | 'right';       // 仅 root 的直接子节点用（未来非经典布局会受限）
}

interface FreeEdge {
  id: EdgeId;
  fromNodeId: NodeId;
  toNodeId: NodeId;
  label?: string;
  style?: 'solid' | 'dashed';
}
```

**关键决定：** 节点正文是 ProseMirror JSON，与大纲形状一致。**共享 doc 节点是白送的；共享光标 / 选区是显式工程**，需要用 ProseMirror collaboration 原语或 transaction patching 实现。见 [ADR-0002](../adr/0002-document-model-flat.md)。

## 8. 渲染与状态管线

```
用户输入（画布或大纲）
        │
        ▼
Intent / command
        │
        ├──► DocOperation（insertNode / moveNode / editContent / ...）
        │       │
        │       ▼
        │   core.applyDocOp(doc, op, context) ──► doc'（immutable，经 Immer）
        │       │
        │       ├──► 内容撤销栈
        │       └──► layout / render / outline 按 scoped subscription 更新
        │
        └──► ViewOperation（setSelection / setViewport / hover / ...）
                │
                ▼
            ViewState / EditorBridgeState 更新（不进入内容 undo）
```

两个渲染目标（画布 + 大纲）共享一份文档事实来源（`doc`）；`DocOperation` 是唯一文档变更入口。selection / cursor 属于 `ViewState` 与 `EditorBridgeState`，不是 `DocState`。状态分层见 [`STATE_MODEL.zh-CN.md`](./STATE_MODEL.zh-CN.md)，core API 见 [`CORE_API.zh-CN.md`](./CORE_API.zh-CN.md)。

## 9. 路线图

时间假定单人全职。2–3 人时 v0.1-release 大约 8–10 周可落。

| 阶段 | 时长 | 累计 | 目标 |
|---|---|---|---|
| **v0.1-spike** | 2–3 周 | 3 周 | 验证大纲 ↔ 画布同步。决定 go / no-go。 |
| **v0.1-release** | 14–17 周 | ~20 周 | 完整 MVP 清单。公开 Web 发版。目标：*比 markmap 漂亮、比 XMind Web 流畅*。 |
| **v0.2** | 6 周 | ~26 周 | Tauri 桌面；流式 AI；`.xmind` 导入；基于 benchmark 的性能 pass。 |
| **v0.3** | 8–10 周 | ~36 周 | 实时协作。Y.js 或 Loro（v0.2 决策）。自建 WebSocket relay；只读分享链接。 |
| **v0.4+** | — | — | 第二种布局结构（组织图或逻辑图），由用户反馈驱动。 |

## 10. 架构决策

- [ADR-0001 — 渲染：DOM 节点 + SVG 连线](../adr/0001-rendering-dom-plus-svg.md)
- [ADR-0002 — 文档模型：平铺 + `parentId` / `childIds`](../adr/0002-document-model-flat.md)
- [ADR-0003 — UI 框架：React 19](../adr/0003-react-as-ui-framework.md)
- [ADR-0004 — 状态：现在 Zustand，未来 CRDT](../adr/0004-state-zustand-then-yjs.md)
- [ADR-0005 — 单包，推迟 monorepo 拆分](../adr/0005-single-package.md)

## 11. Vibe coding 规则

MindForge 可以用 AI 高速实现，但不能让 AI 绕过架构边界。所有 AI coding agent 必须遵守：

- 根目录 [`AGENTS.md`](../AGENTS.md)：最小执行契约，适合 agent 自动读取。
- [`docs/VIBE_CODING_RULES.zh-CN.md`](./VIBE_CODING_RULES.zh-CN.md)：完整中文规则，覆盖模块边界、ops、同步、渲染、AI、测试和完成定义。

## 12. 执行规格

- [`SPIKE_PLAN.zh-CN.md`](./SPIKE_PLAN.zh-CN.md)：v0.1-spike 范围、benchmark、selection 验收、go / no-go。
- [`STATE_MODEL.zh-CN.md`](./STATE_MODEL.zh-CN.md)：`DocState`、`ViewState`、`EditorBridgeState`、`HistoryState` 的边界。
- [`CORE_API.zh-CN.md`](./CORE_API.zh-CN.md)：`DocOperation`、validation、selectors、store adapter、AI candidate patch 边界。
