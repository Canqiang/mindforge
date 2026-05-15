# ADR-0001 — Rendering: DOM Nodes + SVG Edges

**Status:** Accepted · 2026-05-15 · revised after design reflection

---

## Context

### English

Mind map editors have three classic rendering choices:

1. **SVG-only** — D3 style. Everything is `<g>`, `<circle>`, `<text>`. Easy to export, but rich text inside SVG is awful, and every interaction (hover, focus, contenteditable) must be reimplemented.
2. **Canvas** — Konva / PixiJS style. Highest performance ceiling, but every interaction (selection, focus, accessibility, IME) must be built from scratch. Development cost is roughly 3× the alternatives.
3. **DOM nodes + SVG edges** — Whimsical / FigJam / Tldraw style. Nodes are real DOM elements; only connectors live in a single SVG layer.

The dominant question is whether MindForge prioritizes raw scale (10k+ nodes) or editor UX (rich text, drag, a11y, theming). Mind maps are usually under 500 nodes; outliers (research org charts, large XMind exports) reach 1k–2k.

### 中文

思维导图编辑器有三种经典渲染方式：

1. **纯 SVG**——D3 风格。一切都是 `<g>`、`<circle>`、`<text>`。导出方便，但 SVG 内做富文本极其痛苦，所有交互（hover、focus、contenteditable）都得自己实现。
2. **Canvas**——Konva / PixiJS 风格。性能上限最高，但所有交互（选区、焦点、无障碍、输入法）都要从零造。开发成本约是另外两种的 3 倍。
3. **DOM 节点 + SVG 连线**——Whimsical / FigJam / Tldraw 风格。节点是真 DOM 元素，只有连线住在单层 SVG 里。

最主要的取舍：MindForge 优先要的是规模上限（1 万+ 节点）还是编辑体验（富文本、拖拽、无障碍、主题）。思维导图通常在 500 节点以下；极端情况（科研用的组织图、XMind 大图）会到 1k–2k。

---

## Decision

### English

Render **nodes as `<div contenteditable>` DOM elements**, layered over a single `<svg>` element that draws all edges (parent-child and free arrows).

### 中文

节点用 `<div contenteditable>` 的 DOM 元素渲染，叠在一个 `<svg>` 图层上画所有连线（父子边和自由箭头）。

---

## Consequences

### English

**Pros**

- Rich text editing comes for free (browser native, IME-correct, a11y-correct out of the box for individual nodes).
- Theming via CSS variables — no need to redraw on theme change.
- Drag / drop, focus, keyboard navigation, screen readers — node-level support is built in.
- Easy to nest arbitrary React components inside a node (icons, popovers, images, code blocks).
- The same ProseMirror JSON powering node content can be reused by the outline editor.

**Cons / open risks**

- **Performance ceiling is TBD.** We *assume* ~1000 visible DOM nodes is workable; this must be measured in the v0.1-spike at 500 / 1000 / 2000 nodes before we commit. If the ceiling is lower, mitigations are viewport culling, virtualization at zoom-out, or switching `render/` to Canvas.
- **Text rendering under CSS zoom is a known weak point.** Subpixel rounding and font reflow make DOM nodes look mushy or jumpy during pan/zoom. Tldraw solves this with rounded-to-pixel transforms and SVG text in some modes — we will need to study and likely copy their approach.
- **Snapshot export (PNG / JPG) is not free.** `html-to-image` has documented issues with web fonts, foreignObject, CSS variables, and cross-origin images. We will reserve a buffer in v0.1 for export polish (or accept SVG-only export in v0.1 as fallback).
- **Canvas-level a11y is non-trivial.** Per-node a11y is free; the *canvas as a whole* (focus model, screen-reader hierarchy, keyboard navigation between nodes) is not. Designed in v0.1, not v0.1-spike.
- **Coordinate math bridges two coordinate systems** (DOM transform-aware layout for nodes, SVG viewBox for edges). Edge anchor math is the most fiddly part of this design.

**Mitigations**

- v0.1-spike includes a benchmark harness at 500 / 1000 / 2000 nodes — both static and during pan/zoom.
- If perf becomes a real issue post-MVP, `render/` is the only folder that needs to change — `core/`, `layout/`, `outline/` stay.
- Document the canvas a11y model as part of v0.1 design (not deferred to v0.2).

### 中文

**优点**

- 富文本编辑零成本（浏览器原生，输入法正确，单节点无障碍白送）
- 主题切换走 CSS 变量——切主题不用重画
- 拖拽、焦点、键盘导航、读屏——节点级支持白送
- 节点内嵌任意 React 组件很容易（图标、弹层、图片、代码块）
- 节点正文用的 ProseMirror JSON 可被大纲编辑器复用

**缺点 / 开放风险**

- **性能上限 TBD。** 假定 ~1000 可见 DOM 节点能用；这个数字必须在 v0.1-spike 中以 500 / 1000 / 2000 节点实测后再定。上限低于预期就上视口剔除、缩小虚拟化，或把 `render/` 换成 Canvas。
- **CSS 缩放下的文字渲染是已知弱点。** Subpixel 取整和字体 reflow 让 DOM 节点在平移/缩放时显糊或抖。Tldraw 通过 pixel 取整 transform + 部分模式下用 SVG text 解决——我们要学习并大概率照抄。
- **快照导出（PNG / JPG）不白送。** `html-to-image` 在 web font、foreignObject、CSS 变量、跨域图片上有已知问题。v0.1 预留导出打磨预算（或退而求其次：v0.1 只支持 SVG 导出）。
- **画布级无障碍非 trivial。** 单节点的 a11y 白送；**整个画布作为一个单元**（焦点模型、读屏层级、节点间键盘导航）不白送。这块在 v0.1 设计，不是 v0.1-spike。
- **两套坐标系打通**（节点用 DOM transform-aware 布局，连线用 SVG viewBox）。连线锚点数学是本设计最磨人的部分。

**缓解措施**

- v0.1-spike 含 500 / 1000 / 2000 节点的 benchmark harness——静态和平移/缩放都测。
- MVP 之后如果性能成问题，只动 `render/` 一个目录就够了——`core/`、`layout/`、`outline/` 不动。
- 画布无障碍模型作为 v0.1 设计的一部分（不推到 v0.2）。
