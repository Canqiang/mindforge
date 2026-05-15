# MindForge Agent Rules

This file is the execution contract for AI coding agents working in this repo.
Read `docs/DESIGN.zh-CN.md`, `docs/SPIKE_PLAN.zh-CN.md`, `docs/STATE_MODEL.zh-CN.md`, `docs/CORE_API.zh-CN.md`, and the ADRs before making architecture-level changes.

## Current Phase

- The project is pre-alpha.
- Do not build the full v0.1 release before the `v0.1-spike` is validated.
- The spike goal is only: outline <-> canvas bidirectional sync, including selection, plus performance benchmarks.

## Non-Negotiable Rules

1. Keep the repo as one package. Do not introduce a monorepo, Turborepo, or package publishing setup unless ADR-0005 is revised.
2. All document mutations must go through `core.applyDocOp(...)` or `core.applyDocTransaction(...)`. Components, render code, outline code, and AI code must never mutate `doc.nodes`, `doc.edges`, or `childIds` directly.
3. Treat `parentId` and `childIds` as one invariant. Any operation that changes one must update and validate the other.
4. ProseMirror JSON only shares node content. Cursor and selection sync live in ViewState / EditorBridgeState and are explicit engineering work, not a side effect of shared JSON.
5. AI output must become validated candidate operations before it touches the document. Never let model text directly patch the doc.
6. Local-first and privacy are product constraints. Do not add document-content telemetry. Cloud AI calls require BYO key and explicit user action.
7. Layout code must be deterministic and side-effect free. DOM measurement belongs in `render`, not in `layout`.
8. Import/export must validate the document schema and preserve round-trip fixtures.
9. Do not add features outside the current phase just because they are easy. If a change expands scope, update the design doc or add an ADR first.
10. Every behavior change needs a verification path: unit test, Playwright test, benchmark, or a documented manual check.

## Module Boundaries

- `src/core/`: document schema, operations, validation, undo/redo, store. No React UI. Zustand imports are allowed only here.
- `src/layout/`: pure layout algorithms. May import core types/selectors. No DOM, React, Zustand, Tiptap, or AI.
- `src/render/`: canvas, nodes, SVG edges, viewport, measurement, minimap. May consume core/layout/theme/ui.
- `src/outline/`: Tiptap outline and transaction mapping. May consume core. Must tag mirrored transactions with origin.
- `src/ai/`: provider adapters, prompts, structured generation. Produces candidate ops only.
- `src/io/`: import/export, schema migrations, fixture round trips. May consume core validation.
- `src/theme/`: CSS variables and presets. Avoid hardcoded theme colors in components.
- `src/ui/`: generic UI primitives. Do not import app state from core.
- `src/app.tsx`: composition root only.

Each module's `index.ts` is its public entry point. Prefer importing through module entry points over deep private files.

## Testing Expectations

- New operation: unit tests for success, rejection, validation, and undo/redo.
- New layout behavior: deterministic fixtures plus at least one large-doc benchmark when it affects performance.
- New outline/canvas sync behavior: Playwright coverage for typing, selection, scroll offset, and IME-sensitive flows when feasible.
- New import/export behavior: round-trip fixture test.
- New AI behavior: schema validation test and failure-mode test.

## When Unsure

If code pressure conflicts with the design docs, stop and update the design/ADR first. The goal is not to "vibe" into a working demo that cannot survive the next feature.
