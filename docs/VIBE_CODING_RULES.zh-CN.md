# MindForge — Vibe Code 工程规则

> 本文是给 AI coding agent / vibe coding 使用的执行规则。目标不是限制速度，而是防止快速堆代码把编辑器核心做成不可维护的 demo。

## 1. 当前阶段

MindForge 还在 pre-alpha。v0.1-release 之前，所有代码都必须服从 `v0.1-spike` 的验证目标：

- 大纲 ↔ 画布双向同步，包括内容和选区 / 光标。
- DOM + SVG 渲染在 100 / 500 / 1000 / 2000 节点下的性能基准。
- 证明没有根本性架构 blocker。

**不要**在 spike 通过之前实现完整 MVP。AI、自由箭头、导入导出、多主题、备注、minimap、桌面端都不是 spike 目标。

## 2. 不可破坏的不变量

1. **单包优先。** 仓库保持一个 `package.json`、一个 Vite app。不得擅自引入 monorepo、Turborepo、独立 package 发布结构；需要改先修订 ADR-0005。
2. **`DocOperation` 是唯一文档写入口。** 所有文档变更必须走 `core.applyDocOp(...)` 或 `core.applyDocTransaction(...)`。React 组件、outline、render、AI、IO 都不能直接改 `doc.nodes`、`doc.edges`、`childIds`。
3. **`parentId` / `childIds` 必须一致。** 任何移动、插入、删除都必须同时维护双向关系，并通过 `core/validate` 校验。
4. **ProseMirror JSON 只共享正文。** 光标和选区不是 JSON 的一部分，必须显式设计 transaction / origin / selection 映射。
5. **AI 只能生成候选操作。** 模型输出必须转成结构化 candidate ops，经过 schema 校验、业务校验，再 apply。不得让自然语言或任意 JSON 直接 patch 文档。
6. **Local-first 和隐私是产品约束。** 默认本地；云端模型 BYO key，明确用户动作后才调用。不得加入文档内容遥测。
7. **布局必须是纯函数。** `layout` 不读 DOM、不读 store、不依赖 React 生命周期。节点尺寸由 `render` 测量后传入。
8. **导入导出必须可验证。** 所有 import 都要 validate / repair；所有 export 都要有 round-trip fixture。
9. **不顺手扩 scope。** 如果实现需要突破 DESIGN 或 ADR，先改文档 / 新增 ADR，再写代码。
10. **每个行为变更必须有验证路径。** 单测、Playwright、benchmark、或明确的手工验收步骤，至少其一。

## 3. 模块边界

- `src/core/`：文档 schema、DocOperation、validate、undo/redo、store。除 store 实现外不依赖 UI。只有这里允许 import `zustand`。详见 [`CORE_API.zh-CN.md`](./CORE_API.zh-CN.md)。
- `src/layout/`：纯布局算法。可以 import core 类型 / selector。不得 import DOM、React、Zustand、Tiptap、AI。
- `src/render/`：canvas、DOM node、SVG edge、viewport、measurement、minimap。可以消费 core / layout / theme / ui。
- `src/outline/`：Tiptap 大纲和 transaction 映射。可以消费 core。所有镜像 transaction 必须带 `origin`，防止回环。
- `src/ai/`：provider 适配、prompt、structured generation。只能输出候选 ops，不能直接改 doc。
- `src/io/`：import / export、schema migration、fixture round trip。必须复用 core validation。
- `src/theme/`：CSS 变量和主题预设。组件里避免写死主题色。
- `src/ui/`：通用 UI 原语。不得 import app 状态。
- `src/app.tsx`：composition root，只负责组装模块，不承载业务逻辑。

每个模块只有 `src/<module>/index.ts` 是公开入口。跨模块优先从入口 import，不要深挖私有文件。

## 4. Core / Ops 规则

- 每个 DocOperation 必须定义：输入、前置校验、状态变更、inverse op、是否进入 undo stack。
- 删除节点必须处理整棵子树，并删除相关 `FreeEdge`。
- 移动节点必须拒绝循环、拒绝把节点移动到自己的后代下面、拒绝重复 child id。
- `setSelection` 属于 `ViewOperation` / editor state，不是 `DocOperation`。默认不进入内容 undo stack，除非有明确交互理由。
- `rootId` 对应节点的 `parentId` 必须是 `null`，且文档只能有一个 root。
- import / load 后必须跑一次完整 validation。

## 5. Outline / Canvas 同步规则

- 不允许写“共享 ProseMirror JSON 所以光标自然同步”这种假设。
- 所有同步都要带 `origin`：`canvas`、`outline`、`ai`、`io`、`history`、`remote`。
- IME 输入、composition event、快速连续输入必须作为 spike 验收项。
- selection / cursor 的状态归属见 [`STATE_MODEL.zh-CN.md`](./STATE_MODEL.zh-CN.md)。
- spike 阶段可以实验“每节点一个 Tiptap 实例”，但没有 benchmark 前不得把它固化为 release 架构。
- 如果选择单 Tiptap / shared editor / Y.XmlFragment 方案，必须把原因写入 ADR。

## 6. Render / Layout 规则

- 坐标系统集中定义，不要在各组件里散落 viewport transform 计算。
- DOM measurement 只在 render 层做，结果以稳定结构传给 layout。
- layout 输出必须 deterministic：相同 doc + 相同尺寸输入，输出相同坐标。
- 大图性能不能靠感觉判断。100 / 500 / 1000 / 2000 节点都要有 benchmark，指标见 [`SPIKE_PLAN.zh-CN.md`](./SPIKE_PLAN.zh-CN.md)。
- SVG edge 的坐标必须从同一套 layout / measurement 数据来，不得各自 `getBoundingClientRect` 拼凑。
- 缩放下文字渲染质量是 spike 风险，不要在没有截图 / benchmark 前拍脑袋决定。

## 7. AI 规则

- AI provider 层只处理模型调用、stream、schema。它不拥有文档状态。
- 所有 AI 功能输出 `Operation[]` 或可解释的候选 patch。
- destructive 变更，例如重组子树，必须有 preview / confirm 或明确可撤销。
- provider 能力不同：structured output、tool calling、streaming、Ollama 本地可用性都要在代码中显式建模。
- prompt 不是安全边界。schema validation 和业务 validation 才是边界。

## 8. 测试和验收

- 新增 op：Vitest 覆盖成功路径、失败路径、validation、undo / redo。
- 新增 layout 行为：fixture 测试 + deterministic snapshot。影响性能时补 benchmark。
- 新增 outline / canvas 同步：Playwright 覆盖打字、选区、滚动位置、焦点切换。IME 场景至少有手工验收记录。
- 新增 import / export：round-trip fixture，不允许静默丢字段。
- 新增 AI 行为：schema 测试、provider fallback 测试、模型输出非法时的失败路径。

每次完成任务前至少运行相关测试；如果没法运行，要在交付说明里写清楚原因。

## 9. Vibe Code 工作流

1. 先确认当前阶段：`v0.1-spike`、`v0.1-release`、`v0.2` 等。
2. 先读 `docs/DESIGN.zh-CN.md` 和相关 ADR，再动代码。
3. 小步提交：一次只改一个行为面，避免“顺手重构半个项目”。
4. 先写 core / test，再接 UI。编辑器核心不能靠 UI 手测证明正确。
5. 不留“以后再补”的核心 TODO。可以保留非关键 TODO，但必须写清 owner、阶段、风险。
6. 如果发现 DESIGN 错了，先更新 DESIGN / ADR，再实现新的方向。
7. 交付时说明改了什么、验证了什么、还有什么风险。

## 10. 完成定义

一项功能完成，需要同时满足：

- 没破坏 DESIGN / ADR / 本规则的不变量。
- 相关测试或验收步骤已执行。
- 代码没有跨模块偷 import。
- 文档 schema、op、AI 输出、import/export 都经过 validation。
- 如果改变架构边界，对应 DESIGN 或 ADR 已更新。
