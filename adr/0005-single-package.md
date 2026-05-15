# ADR-0005 — Single Package, Defer Monorepo Split

**Status:** Accepted · 2026-05-15

---

## Context

### English

The first draft of MindForge proposed a pnpm + Turborepo monorepo with 8 packages (`core`, `layout`, `render`, `outline`, `theme`, `ai`, `io`, `ui`) plus `apps/web` and `apps/desktop`. The structure mirrored markmap's layout for familiarity.

That choice is premature optimization for a v0.1 project with no external consumers.

Observed costs of an early monorepo split:

- Workspace tooling overhead (`pnpm-workspace.yaml`, root `package.json`, per-package `tsconfig.json`, version coordination).
- Type re-exports duplicated at every package boundary.
- Internal API changes require synchronized edits across 3–4 `package.json` files.
- Build orchestration (Turbo cache, dependency graph) adds setup time before the first feature lands.
- Boundaries that have not yet stabilized harden too early; refactoring across packages is more painful than refactoring across folders.

What we get *in exchange* for the cost:

- The ability to publish packages independently to npm — **we have no consumer for this in v0.1**.
- Per-package versioning — **irrelevant for v0.1**.
- Isolated test scopes — **achievable via Vitest workspaces or `describe.skip` patterns within one package**.

References: Tldraw, Excalidraw, and Liveblocks all started as a single package and split only when external reuse pressure was real.

### 中文

MindForge 第一版设计提案是 pnpm + Turborepo 的 monorepo，8 个 package（`core`、`layout`、`render`、`outline`、`theme`、`ai`、`io`、`ui`）+ `apps/web` 和 `apps/desktop`。结构对照 markmap 以方便参照。

对一个还没有外部消费者的 v0.1 项目，这是过早优化。

早期 monorepo 拆分的可观察成本：

- workspace 工具链开销（`pnpm-workspace.yaml`、根 `package.json`、每个 package 的 `tsconfig.json`、版本协调）
- 类型 re-export 在每个包边界重复
- 内部 API 变化要同步改 3–4 个 `package.json`
- 构建编排（Turbo 缓存、依赖图）在第一个功能落地前就要花时间搭
- 还没稳定的边界过早凝固；跨包重构比跨文件夹重构疼得多

**换来**的好处：

- 包独立发布 npm 的能力——**v0.1 没人消费**
- 包独立版本——**v0.1 不相关**
- 隔离的测试作用域——**单包内用 Vitest workspaces 或 `describe.skip` 就够**

参考：Tldraw、Excalidraw、Liveblocks 都是单包起步，真有外部复用压力了才拆。

---

## Decision

### English

**One package.** Internal modularity via `src/` subdirectories:

```
mindforge/
├── src/
│   ├── core/      # document model, ops, undo, store
│   ├── layout/    # layout algorithms
│   ├── render/    # canvas, nodes, edges, minimap
│   ├── outline/   # Tiptap outline + sync
│   ├── theme/     # CSS variables + presets
│   ├── ai/        # provider adapters + prompts
│   ├── io/        # import / export
│   ├── ui/        # generic UI components
│   └── app.tsx
├── public/
├── examples/
├── adr/
├── docs/
├── index.html
├── package.json
└── vite.config.ts
```

**ESLint import boundaries** enforce the same modular discipline a monorepo would: `src/render/` may import from `src/core/` and `src/layout/`, but not the other way around; `src/outline/` may import from `src/core/`; nothing imports from `src/app.tsx`.

**Split criteria** — promote a folder to its own package only when *one* of these is true:

1. A real external user wants to install just that piece from npm.
2. A second app (e.g. Tauri shell) needs to consume `src/core/` with a different build target and ESM-only constraint that the web app doesn't have.
3. The folder reaches >5k LOC and has its own test suite, types, and release cadence.

Tauri (v0.2) does not trigger a split. It adds a sibling `src-tauri/` directory and imports from `src/` via path aliases. Tauri's standard layout is `frontend + src-tauri`, not a monorepo.

### 中文

**单包。** 模块化靠 `src/` 子目录（结构同上代码块）。

**ESLint import 边界**强制 monorepo 同样的模块化纪律：`src/render/` 可以 import `src/core/` 和 `src/layout/`，反向不行；`src/outline/` 可以 import `src/core/`；没人 import `src/app.tsx`。

**拆分标准**——一个目录升级到独立 package 只在以下**任一**为真时：

1. 真实外部用户想从 npm 只装这一块。
2. 第二个 app（如 Tauri 壳）需要消费 `src/core/`，且有 web app 不需要的不同构建目标和 ESM-only 约束。
3. 该目录超过 5k LOC，有自己的测试套件、类型、发布节奏。

Tauri（v0.2）不触发拆分。它加一个同级 `src-tauri/` 目录，通过路径别名从 `src/` import。Tauri 的标准布局是 `前端 + src-tauri`，不是 monorepo。

---

## Consequences

### English

**Pros**

- One `package.json`, one `tsconfig.json`, one Vite config. Refactor is one find-and-replace, not eight.
- New contributors clone, `pnpm install`, `pnpm dev`. No workspace conceptual overhead.
- Cross-cutting refactors (renames, signature changes) are cheap.
- Faster iteration during the spike — every minute saved on tooling lands in the actual product.

**Cons**

- Folder discipline relies on ESLint rules rather than the harder fence of a package boundary. Easier to violate by accident.
- When we *do* split (likely starting with `core` for Tauri or third-party use), there will be a migration cost — but later, when the boundaries are stable.
- npm consumers can't `pnpm add @mindforge/core` until we split. Acceptable: no one is asking.

**Mitigations**

- Strict ESLint `import/no-restricted-paths` rules from day one to enforce module boundaries. The graph that *would* be a monorepo is enforced as a lint-time invariant instead.
- `src/<module>/index.ts` is the only public entry per module. Other files in the module are private even though they're in the same package.
- Revisit this ADR at v0.2 planning. If Tauri shows clear separation pain, split `core` first.

### 中文

**优点**

- 一个 `package.json`、一个 `tsconfig.json`、一个 Vite 配置。重构是一次 find-and-replace，不是八次。
- 新贡献者 clone → `pnpm install` → `pnpm dev`，没有 workspace 心智负担。
- 跨模块重构（重命名、签名变更）很便宜。
- spike 期间迭代更快——每省一分钟在工具上，都落到真产品上。

**缺点**

- 文件夹纪律靠 ESLint 规则，不像包边界那道硬篱笆。意外破坏更容易。
- 真要拆的时候（多半从 `core` 开始，为了 Tauri 或第三方使用），会有迁移成本——但那是边界稳定之后。
- npm 消费者在拆之前不能 `pnpm add @mindforge/core`。可接受，没人在问。

**缓解措施**

- 第一天起严格 `import/no-restricted-paths` 强制模块边界。**「本来要是 monorepo 的依赖图」改用 lint-time 不变量强制**。
- `src/<module>/index.ts` 是每个模块唯一的公开入口。模块内其它文件即使在同包内也是私有。
- v0.2 规划时复审本 ADR。如果 Tauri 暴露明显的解耦痛点，先拆 `core`。
