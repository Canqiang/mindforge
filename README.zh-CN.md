<h1 align="center">MindForge</h1>

<p align="center">开源、漂亮、AI 原生的思维导图编辑器。</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./docs/DESIGN.zh-CN.md">设计文档</a> ·
  <a href="./adr">ADR 决策记录</a>
</p>

> **状态：** Pre-alpha，公开设计中，代码即将开工。

## 这是什么

MindForge 是一个开源思维导图编辑器，目标是：

- **默认就好看**——主题化、CSS 变量驱动，不再有 D3 默认渲染那种「学术毕设感」。
- **大纲与图双向同步**——左侧大纲、右侧画布，共享同一份文档模型；光标 / 选区同步作为 spike 承重验证。
- **AI 原生**——选中节点扩写、子树重组、整图总结、文本反向变图；OpenAI / Anthropic / 本地 Ollama 任选。
- **Local-first**——文档就是磁盘上的 JSON，不强制账号。
- **可 hack**——模型 / 布局 / 渲染 / 大纲 / 主题 分层清楚，先单包，后续有复用压力再拆。

## 为什么不用 xxx

- **markmap** 是渲染器不是编辑器，节点不能拖、不能加自由箭头、不能换主题。
- **XMind** 闭源、收费、UI 老气；我们不复刻它每一种图表，只做日常真在用的那部分。
- **Whimsical / Miro** 是纯 SaaS，规模上去就贵。

## 技术栈

TypeScript · React 19 · Vite · Tiptap (ProseMirror) · Zustand（后续切 CRDT）· Tailwind v4 · Tauri 2（桌面端）· 单包 Vite app。

完整架构、决策、路线图见 [`docs/DESIGN.zh-CN.md`](./docs/DESIGN.zh-CN.md)。spike、状态模型和 core API 规格见 [`docs/SPIKE_PLAN.zh-CN.md`](./docs/SPIKE_PLAN.zh-CN.md)、[`docs/STATE_MODEL.zh-CN.md`](./docs/STATE_MODEL.zh-CN.md)、[`docs/CORE_API.zh-CN.md`](./docs/CORE_API.zh-CN.md)。AI / vibe coding 执行规则见 [`AGENTS.md`](./AGENTS.md) 和 [`docs/VIBE_CODING_RULES.zh-CN.md`](./docs/VIBE_CODING_RULES.zh-CN.md)。

## 路线图

| 阶段 | 目标 |
|---|---|
| v0.1-spike（2–3 周） | 验证大纲 ↔ 画布选区同步——承重假设 |
| v0.1-release（~20 周） | Web MVP——编辑、主题、大纲同步、基础 AI |
| v0.2（~26 周） | Tauri 桌面端、AI 流式、`.xmind` 导入 |
| v0.3（~36 周） | 实时协作（Y.js 或 Loro） |
| v0.4+ | 第二种布局结构（组织图 / 逻辑图） |

时间假定单人全职。开放风险清单见 [`docs/DESIGN.zh-CN.md`](./docs/DESIGN.zh-CN.md)。

## License

MIT（计划）。
