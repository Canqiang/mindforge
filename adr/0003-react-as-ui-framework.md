# ADR-0003 — UI Framework: React 19

**Status:** Accepted · 2026-05-15 · revised after design reflection

---

## Context

### English

The choice of UI framework constrains everything downstream:

- Which rich-text editor we can plug in (Tiptap is React-first; ProseMirror is framework-agnostic but Tiptap is the path of least resistance).
- Which reference implementations exist for similar editor-class apps (Tldraw, Excalidraw, Lexical, Liveblocks demos are all React).
- Which UI primitive libraries are mature (Radix, Headless UI, shadcn registry — all React-first in 2026).
- Hiring / contributor pool.

We considered:

- **React 19** — biggest ecosystem; mature DevTools; concurrent features (useful but oversold for editor-class apps where every keystroke causes state change).
- **Vue 3** — equally capable, but editor-class reference implementations are sparser.
- **Svelte 5 / SolidJS** — leaner runtime and arguably better performance for fine-grained reactivity, but the editor ecosystem (Tiptap, dnd-kit, Radix) is React-shaped, so we'd be writing more glue.
- **Vanilla TS + custom reactivity** — what markmap does. Lowest dependency, but every editor feature (selection management, keyboard handling, focus) becomes a from-scratch project.

### 中文

UI 框架的选择决定了下游一连串决策：

- 能接哪个富文本编辑器（Tiptap 是 React 优先；ProseMirror 与框架无关但 Tiptap 是阻力最小的路径）。
- 类似的编辑器类应用有哪些参考实现（Tldraw、Excalidraw、Lexical、Liveblocks demo 全是 React）。
- 哪些 UI 原语库够成熟（Radix、Headless UI、shadcn registry——2026 年这些都是 React 优先）。
- 招人 / 贡献者池。

考虑过：

- **React 19**——生态最大；DevTools 成熟；并发特性（有用，但对每个按键都触发状态变化的编辑器类应用被高估了）。
- **Vue 3**——能力相当，但编辑器类参考实现稀少。
- **Svelte 5 / SolidJS**——运行时更轻，细粒度响应式性能可能更好，但编辑器生态（Tiptap、dnd-kit、Radix）是 React 形状的，会写更多胶水。
- **纯 TS + 自造响应式**——markmap 的做法。依赖最少，但每个编辑器特性（选区管理、键盘处理、焦点）都得从零造。

---

## Decision

### English

**React 19** + Vite. Strict mode on. TypeScript everywhere.

- **React Compiler:** use *if* stable at v0.1-release time. Otherwise rely on manual memoization with strict ESLint rules and `useMemo` / `memo` where profiling shows wins. As of 2026-05 it is still RC; we do not assume its availability.
- **Concurrent features:** use `useDeferredValue` for outline-canvas sync (so typing in the active view never blocks the mirror view), and `useTransition` for layout recomputation. Don't use Suspense for editor data.

### 中文

**React 19** + Vite。开启严格模式。TypeScript 全覆盖。

- **React Compiler：** **如果**在 v0.1-release 时已稳定就用，否则靠手动 memoization + 严格 ESLint 规则 + 在 profiler 看到收益的地方加 `useMemo` / `memo`。截至 2026-05 它还是 RC，**不假定**可用。
- **并发特性：** 用 `useDeferredValue` 做大纲↔画布同步（活动视图打字时镜像视图永远不会阻塞），用 `useTransition` 做布局重算。**不要**对编辑器数据用 Suspense。

---

## Consequences

### English

**Pros**

- Tiptap, dnd-kit, Radix, @use-gesture, framer-motion, html-to-image — all first-class.
- Massive contributor pool and onboarding familiarity.
- Mature DevTools, profiler, error boundaries.

**Cons**

- Heavier runtime than Svelte / Solid (~40KB gzipped baseline).
- Re-render granularity needs care — wrong selector usage in Zustand can cascade. Without React Compiler we hand-write memoization.
- React's frequent API churn (Server Components, the new compiler, Activity) needs ongoing attention even though most don't apply to a client editor.

**Mitigations**

- Memoize on `NodeId`. A node component should re-render only when its own slice changes. Enforced by ESLint rules + a dev-only render-flash overlay during v0.1 development to surface over-rendering.
- Use React Compiler conditionally — guarded by config so it can be turned off without code changes if it misbehaves.
- Pin React minor version in `package.json`; document upgrade procedure.

### 中文

**优点**

- Tiptap、dnd-kit、Radix、@use-gesture、framer-motion、html-to-image——全部一等支持。
- 贡献者池巨大，上手熟悉度高。
- DevTools、profiler、error boundary 都成熟。

**缺点**

- 运行时比 Svelte / Solid 重（约 40KB gzipped 基线）。
- 重渲染粒度要小心——Zustand 选择器用错会级联。没 React Compiler 就得手写 memo。
- React 的 API 变动频繁（Server Components、新编译器、Activity），需要持续关注——尽管大多数和客户端编辑器无关。

**缓解措施**

- 按 `NodeId` 做 memo。节点组件只在自己那份切片变化时才重渲。靠 ESLint 规则强制 + v0.1 开发期开启「render flash」开发覆盖层来暴露 over-render。
- React Compiler 走条件配置——配置可关，无需改代码即可在它行为异常时禁用。
- `package.json` 锁 React minor 版本；写明升级流程。
