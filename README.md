<h1 align="center">MindForge</h1>

<p align="center">An open, beautiful, AI-native mind map editor.</p>

<p align="center">
  <a href="./README.zh-CN.md">中文</a> ·
  <a href="./docs/DESIGN.md">Design Doc</a> ·
  <a href="./adr">ADRs</a>
</p>

> **Status:** Pre-alpha. Designing in the open. Code coming soon.

## What is MindForge

MindForge is an open-source mind map editor that aims to:

- **Look good by default** — themeable, CSS-variable driven, no D3-default ugliness.
- **Edit both ways** — outline view ↔ canvas view over one document model; cursor / selection sync is the load-bearing spike.
- **Work with AI natively** — expand, restructure, summarize, reverse-outline; OpenAI / Anthropic / local Ollama.
- **Stay local-first** — your documents are JSON files on your disk; no account required.
- **Be hackable** — clear internal layers for model / layout / render / outline / theme; one package first, split only when reuse pressure is real.

## Why not just use ...

- **markmap** is a renderer, not an editor — you can't drag nodes, can't draw free arrows, can't theme it.
- **XMind** is closed-source, paywalled, and the UI hasn't aged well. We don't try to replicate every chart type — just the parts people actually use daily.
- **Whimsical / Miro** are SaaS-only and expensive at scale.

## Tech stack

TypeScript · React 19 · Vite · Tiptap (ProseMirror) · Zustand (→ CRDT later) · Tailwind v4 · Tauri 2 (desktop) · single-package Vite app.

See [`docs/DESIGN.md`](./docs/DESIGN.md) for the full architecture, decisions, and roadmap. AI / vibe coding rules live in [`AGENTS.md`](./AGENTS.md) and [`docs/VIBE_CODING_RULES.zh-CN.md`](./docs/VIBE_CODING_RULES.zh-CN.md).

## Roadmap

| Phase | Goal |
|---|---|
| v0.1-spike (2–3 wk) | Validate outline ↔ canvas selection sync — the load-bearing assumption |
| v0.1-release (~20 wk) | Web MVP — editing, themes, outline sync, basic AI |
| v0.2 (~26 wk) | Tauri desktop, AI streaming, `.xmind` import |
| v0.3 (~36 wk) | Real-time collaboration (Y.js or Loro) |
| v0.4+ | Additional layout types (org chart, logic chart) |

Numbers assume one full-time engineer. See [`docs/DESIGN.md`](./docs/DESIGN.md) for the open risks list.

## License

MIT (planned).
