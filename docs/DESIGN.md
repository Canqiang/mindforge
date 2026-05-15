# MindForge — Design Document

> [中文版](./DESIGN.zh-CN.md)
>
> **Status:** Living document. Numbers and decisions before v0.1-release are best-effort and will be revised as the spike validates assumptions.

This document captures the product positioning, open risks, scope, technical decisions, and roadmap for MindForge. Per-decision rationale lives in [`adr/`](../adr). Execution specs live in [`SPIKE_PLAN.zh-CN.md`](./SPIKE_PLAN.zh-CN.md), [`STATE_MODEL.zh-CN.md`](./STATE_MODEL.zh-CN.md), and [`CORE_API.zh-CN.md`](./CORE_API.zh-CN.md). AI / vibe coding execution rules live in [`VIBE_CODING_RULES.zh-CN.md`](./VIBE_CODING_RULES.zh-CN.md), with the minimal agent contract in root [`AGENTS.md`](../AGENTS.md).

## 1. Product positioning

**MindForge** is a beautiful, AI-native, open-source mind map editor. The goal is to be an open-source alternative to XMind for everyday note-taking and structured thinking — *not* to clone every chart type XMind ships.

| Dimension | Position |
|---|---|
| One-liner | An open, beautiful, AI-native mind map editor — Markdown-friendly, local-first. |
| Target user | Engineers, PMs/consultants, grad students. People who already write Markdown, are tired of XMind being paid and dated, tired of markmap being read-only. |
| Killer features | (1) Outline ↔ canvas real-time bidirectional sync. (2) AI sidebar (expand / restructure / summarize / reverse-outline). (3) Looks good out of the box. |
| **Non-goals** | Multiple chart types (fishbone, matrix, gantt), heavy style editor, team workspaces. These are XMind's home turf, not worth attacking head-on. |
| **Mobile** | Read-only view in v0.1. Editing is desktop / iPad only — DOM + contenteditable + drag doesn't gracefully degrade on phone. |
| **AI privacy** | Local Ollama first; cloud providers are BYO-key with explicit consent dialog. No telemetry of document content, ever. |

## 2. Open risks and unknowns

These are unresolved before v0.1-spike. The spike exists to resolve the load-bearing ones (R1–R4).

| # | Risk | Why it matters | When we'll know |
|---|---|---|---|
| R1 | Outline ↔ canvas selection sync feels janky (cursor jumps, IME glitches) | Killer feature collapses if so | End of v0.1-spike |
| R2 | DOM node performance ceiling lower than expected | Limits target audience; may force Canvas rewrite | Spike benchmark at 500 / 1000 / 2000 nodes |
| R3 | One Tiptap instance *per node* is too expensive | Forces single shared editor + viewport-relative rendering — much harder | v0.1-spike |
| R4 | DOM text rendering under CSS zoom is ugly (subpixel / reflow) | Mind maps are zoomed constantly; kills polish | v0.1-spike |
| R5 | `html-to-image` PNG export has font / CSS-variable / foreignObject bugs | User-facing feature; common XMind workflow | v0.1 mid-development |
| R6 | Y.js migration in v0.3 not actually drop-in (undo / awareness semantics) | Could mean rewriting consumers, not just internals | v0.3 planning |
| R7 | Name "MindForge" conflicts with existing trademark or npm package | Bikeshed but blocking for public release | Before v0.1-release |
| R8 | a11y for canvas is non-trivial (focus model, screen-reader hierarchy) | Public OSS shouldn't ship inaccessible | v0.1 mid-development |
| R9 | Layout algorithm: Reingold-Tilford with left/right split + avoidance harder than 200 LOC | Slips timeline; affects feel | v0.1-spike (basic) + v0.1 (avoidance) |

## 3. v0.1-spike: validate the lynchpin

**Duration:** 2–3 weeks.
**Single goal:** prove outline ↔ canvas bidirectional sync (including selection) feels good.

**In scope:**

- Document model (flat node map, `parentId` + `childIds`, ProseMirror JSON content).
- One Tiptap outline editor (bullet list bound to the doc).
- Canvas: DOM nodes positioned by a simple left/right layout (no subtree avoidance), straight-line edges, pan + zoom.
- Bidirectional sync: typing in either view updates the other; selection / cursor mirrors across.
- One default theme (just enough to not embarrass us).
- Benchmark harness: 100 / 500 / 1000 / 2000 nodes, frame time, typing latency, layout time.

**Out of scope:** themes (beyond one), AI, free arrows, import / export, drag-to-reparent, notes, undo, anything cosmetic.

Detailed execution plan and go / no-go criteria: [`SPIKE_PLAN.zh-CN.md`](./SPIKE_PLAN.zh-CN.md).

**Exit criteria — proceed to v0.1-release if:**

1. Typing in either view feels instant (< 16ms keystroke-to-paint).
2. Selection sync correct in all scroll positions.
3. 1000-node map maintains 60fps during pan / zoom.
4. No fundamental architecture blocker discovered.

**Plan B if spike fails:** documented as fallback ADR drafts before spike starts. Candidates:
- (a) Outline as non-synced separate panel (drop the killer feature).
- (b) Canvas-based rendering instead of DOM (rewrite `render/`, keep `core/`).
- (c) One shared Tiptap with virtualized "node views" decorating each block.

## 4. v0.1-release: MVP scope

Only features without which the product doesn't exist. Built only if the spike validates the model.

**Editing**

- Nodes: add, delete, drag (within siblings, and reparent), collapse / expand, rich text (bold, italic, code, link).
- Per-node: note (popup markdown editor), emoji icon, hyperlink.
- Free edges (relation arrows across nodes).
- Outline view (left drawer, bidirectional sync with canvas including cursor).
- Undo / redo (operation-based).

**View**

- Theme system (at least 5: `default`, `forest`, `ocean`, `sketch`, `mono`; CSS-variable driven).
- Auto layout (classic mind map: left/right split with subtree avoidance).
- Pan / zoom, minimap, fit-to-screen.

**Files**

- Local save (JSON) + LocalStorage autosave.
- Import: Markdown, OPML.
- Export: PNG, SVG, Markdown, JSON.

**AI sidebar** (the differentiator)

- Select node → expand into children.
- Select subtree → restructure (merge similar, split long).
- Whole map → outline summary.
- Any text → reverse into a mind map.

**Out of scope for v0.1:** real-time collaboration, mobile editing, `.xmind` compatibility, desktop shell, custom node shapes, template marketplace.

## 5. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.x | — |
| UI framework | **React 19** + Vite | See [ADR-0003](../adr/0003-react-as-ui-framework.md). React Compiler used only if stable at MVP time; otherwise manual memoization. |
| Rendering | **DOM nodes + SVG edges** | See [ADR-0001](../adr/0001-rendering-dom-plus-svg.md). Perf ceiling and zoom rendering are open risks. |
| State | **Zustand + Immer**, doc shaped CRDT-friendly | See [ADR-0004](../adr/0004-state-zustand-then-yjs.md). Y.js swap in v0.3 is *opinionated*, not drop-in — undo/awareness semantics will shift. |
| Document model | Flat node map + `parentId` / `childIds` | See [ADR-0002](../adr/0002-document-model-flat.md). |
| Layout | Custom **Reingold-Tilford variant** | Budget 2 weeks, not 200 LOC. |
| Outline editor | **Tiptap** (ProseMirror) | Selection sync is a deliberate engineering effort, not a side-effect. |
| AI | **Vercel AI SDK** + OpenAI / Anthropic / Ollama adapters | Streaming-first; provider-agnostic; BYO key for cloud, Ollama default-on for privacy. |
| Styling | **Tailwind v4** + CSS variables for themes | Themes are pure CSS variables; adding a theme doesn't touch Tailwind. |
| Build | Vite + pnpm | Single package — see §6 and [ADR-0005](../adr/0005-single-package.md). |
| Desktop (v0.2+) | **Tauri 2** | Sibling `src-tauri/` directory, not a monorepo split. |
| Testing | Vitest (unit) + Playwright (E2E) | Standard. |

## 6. Repo layout

Single package, internal folders. We split into a monorepo only when there is real external reuse pressure.

```
mindforge/
├── src/
│   ├── core/      # document model, ops (CRUD / move / collapse), undo stack, store
│   ├── layout/    # layout algorithms (mind map; later: org / logic)
│   ├── editor/    # shared Tiptap node editor + selection bridge primitives
│   ├── render/    # React render components (nodes, edges, canvas, minimap)
│   ├── outline/   # Tiptap outline editor + two-way binding to core
│   ├── theme/     # CSS variables + preset themes
│   ├── ai/        # AI provider adapters + prompt templates
│   ├── io/        # import / export (md / opml / json / png / svg)
│   ├── ui/        # generic UI (buttons, popovers, sidebars, menus)
│   └── app.tsx
├── public/
├── examples/      # demo docs
├── docs/
├── adr/
├── index.html
├── package.json
└── vite.config.ts
```

Tauri (v0.2) adds a sibling `src-tauri/` directory using Tauri's standard layout. See [ADR-0005](../adr/0005-single-package.md).

## 7. Data model

```ts
// Flat storage: O(1) CRUD, CRDT-friendly
interface Doc {
  version: 1;
  rootId: string;
  nodes: Record<NodeId, Node>;
  edges: Record<EdgeId, FreeEdge>;  // free arrows (relation lines)
  theme: string;
  meta: { title: string; createdAt: number; updatedAt: number };
}

interface Node {
  id: NodeId;
  parentId: NodeId | null;       // null = root
  childIds: NodeId[];            // explicit order
  content: RichText;             // ProseMirror JSON — same shape as outline
  collapsed?: boolean;
  note?: RichText;
  icon?: string;
  color?: string;                // per-node override; defaults fall back to theme
  side?: 'left' | 'right';       // only used by root's direct children (limitation for future non-classical layouts)
}

interface FreeEdge {
  id: EdgeId;
  fromNodeId: NodeId;
  toNodeId: NodeId;
  label?: string;
  style?: 'solid' | 'dashed';
}
```

**Key decision:** node content is ProseMirror JSON, identical in shape to the outline. Sharing the *doc node* is free; **sharing the cursor / selection is a deliberate engineering effort** using ProseMirror collaboration primitives or transaction patching. See [ADR-0002](../adr/0002-document-model-flat.md).

## 8. Render & state pipeline

```
User input (canvas or outline)
        │
        ▼
Intent / command
        │
        ├──► DocOperation (insertNode / moveNode / editContent / ...)
        │       │
        │       ▼
        │   core.applyDocOp(doc, op, context) ──► doc' (immutable, via Immer)
        │       │
        │       ├──► content undo stack
        │       └──► layout / render / outline update through scoped subscriptions
        │
        └──► ViewOperation (setSelection / setViewport / hover / ...)
                │
                ▼
            ViewState / EditorBridgeState update (not part of content undo)
```

Two render targets (canvas + outline) share one document source of truth (`doc`); `DocOperation` is the only document mutator. Selection / cursor state belongs to `ViewState` and `EditorBridgeState`, not `DocState`. See [`STATE_MODEL.zh-CN.md`](./STATE_MODEL.zh-CN.md) and [`CORE_API.zh-CN.md`](./CORE_API.zh-CN.md).

## 9. Roadmap

Timeline assumes one full-time engineer. With 2–3 engineers v0.1-release lands closer to 8–10 weeks.

| Phase | Duration | Cumulative | Goal |
|---|---|---|---|
| **v0.1-spike** | 2–3 weeks | 3 weeks | Validate outline ↔ canvas sync. Decide go / no-go. |
| **v0.1-release** | 14–17 weeks | ~20 weeks | Full MVP feature list above. Public web release. Target: *prettier than markmap, smoother than XMind Web*. |
| **v0.2** | 6 weeks | ~26 weeks | Tauri desktop; streaming AI; `.xmind` import; benchmark-driven perf pass. |
| **v0.3** | 8–10 weeks | ~36 weeks | Real-time collaboration. Y.js or Loro (decision in v0.2). Self-hosted WebSocket relay; read-only share links. |
| **v0.4+** | — | — | Second layout structure (org or logic chart), driven by user feedback. |

## 10. Architecture decisions

- [ADR-0001 — Rendering: DOM nodes + SVG edges](../adr/0001-rendering-dom-plus-svg.md)
- [ADR-0002 — Document model: flat with `parentId` / `childIds`](../adr/0002-document-model-flat.md)
- [ADR-0003 — UI framework: React 19](../adr/0003-react-as-ui-framework.md)
- [ADR-0004 — State: Zustand now, CRDT later](../adr/0004-state-zustand-then-yjs.md)
- [ADR-0005 — Single package, defer monorepo split](../adr/0005-single-package.md)

## 11. Vibe coding rules

MindForge can be implemented quickly with AI assistance, but agents must not bypass the architecture boundaries:

- [`AGENTS.md`](../AGENTS.md): minimal execution contract for coding agents.
- [`docs/VIBE_CODING_RULES.zh-CN.md`](./VIBE_CODING_RULES.zh-CN.md): full rules covering module boundaries, ops, sync, rendering, AI, tests, and definition of done.

## 12. Execution specs

- [`SPIKE_PLAN.zh-CN.md`](./SPIKE_PLAN.zh-CN.md): v0.1-spike scope, benchmark, selection acceptance, go / no-go.
- [`STATE_MODEL.zh-CN.md`](./STATE_MODEL.zh-CN.md): boundaries between `DocState`, `ViewState`, `EditorBridgeState`, and `HistoryState`.
- [`CORE_API.zh-CN.md`](./CORE_API.zh-CN.md): `DocOperation`, validation, selectors, store adapter, and AI candidate patch boundaries.
