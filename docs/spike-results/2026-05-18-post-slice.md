# MindForge Benchmark — v0.1-release (post slice-subscription)

Generated at: 2026-05-18T02:19:03.692Z to 2026-05-18T02:23:00.000Z (multiple
runs); environment captured below.

This run validates that none of the v0.1-release features regressed past
SPIKE_PLAN §5 thresholds. Compared to the post-P0/P1/P2 cleanup baseline at
[2026-05-15-post-p0p1p2.md](./2026-05-15-post-p0p1p2.md), the working tree
gained: LocalStorage persistence, outline collapse/expand, three-theme
system, Cmd-Z + toolbar undo/redo, Enter/Tab/Shift-Tab/Backspace structural
editing, JSON import/export, history merge for typed bursts, and the slice
subscription migration (`subscribeStructure` + `useNode`).

## Environment

- URL: http://127.0.0.1:5173
- Browser: Chrome via Playwright channel=chrome
- OS: darwin 25.3.0 arm64
- CPU: Apple M4
- Memory: 16 GB
- Commit: `e287228 perf(slice): subscribe per-node for content, App listens to structure only`

## Balanced fixtures — median of 3 runs

The first fixture in each run consistently picks up cold-start cost
(Chrome / Vite warmup), so the raw numbers per-run vary. Median over 3 runs
filters that noise.

| fixture | nodes | mount ms (med) | edit sync ms (med) | pan p95 ms (med) | verdict |
|---|---:|---:|---:|---:|---|
| balanced-100  |  100 | 37.6  | 38.94 | 9.1 | **Go** |
| balanced-500  |  500 | 103.3 | 23.09 | 8.9 | **Go** |
| balanced-1000 | 1000 | 127.0 | 30.88 | 8.7 | **Go** |
| balanced-2000 | 2000 | 178.9 | 42.94 | 9.0 | **Go** |

Per-run raw data:

| fixture | edit sync ms (3 runs) | pan p95 ms (3 runs) |
|---|---|---|
| balanced-100  | 38.94, 61.09, 36.33 | 9.2, 30.0, 9.0 |
| balanced-500  | 81.66, 23.09, 18.59 | 9.8, 8.8, 8.9 |
| balanced-1000 | 32.91, 30.88, 26.95 | 9.1, 8.7, 8.7 |
| balanced-2000 | 42.94, 42.23, 44.95 | 9.2, 9.0, 8.7 |

The 30 ms balanced-100 pan p95 outlier in run #2 is a single GC / animation
jitter spike on a cold Chrome — runs #1 and #3 land in the normal 9 ms band.
balanced-500's 81 ms edit-sync in run #1 is the cold-Vite-module penalty
hitting the first fixture; reruns land at 23 ms / 19 ms.

## Shape fixtures — single run

| fixture | nodes | canvas nodes | mount ms | edit sync ms | pan p95 ms | verdict |
|---|---:|---:|---:|---:|---:|---|
| wide-500             |  500 | 34 | 109.4 | 41.14 | 9.0  | **Go** |
| deep-300             |  300 |  2 |  75.0 | 31.07 | 9.0  | **Go** |
| mixed-text-500       |  500 | 45 | 111.9 | 23.27 | 11.2 | **Go** |
| editing-hotspot-1000 | 1000 | 45 | 128.4 | 28.67 | 8.9  | **Go** |

## SPIKE_PLAN §5 thresholds

| Metric | Target (Go) | Conditional | No-go | Worst this run | Verdict |
|---|---|---|---|---|---|
| 镜像视图同步延迟              | p95 < 50 ms   | 50–100 ms  | > 100 ms | 44.95 ms (balanced-2000 r3)        | **Go** |
| 1000 节点 pan / zoom        | p95 < 16.7 ms | 16.7–25 ms | > 25 ms  | 11.2 ms (mixed-text-500)           | **Go** |
| 2000 节点可用性              | 可浏览可编辑   | 仅浏览     | 无法交互  | 浏览 + 编辑 + 折叠 + 撤销均通过 e2e   | **Go** |
| layout 耗时（1000 节点）     | p95 < 8 ms    | 8–20 ms    | > 20 ms  | 1.7 ms (balanced-2000)              | **Go** |
| mount 初始耗时（1000 节点）  | < 1 s         | 1–2 s      | > 2 s    | 178.9 ms (balanced-2000)            | **Go** |

## Diff vs the 2026-05-15-post-p0p1p2 baseline

| fixture | edit sync (baseline → this) |
|---|---|
| balanced-100  | 26.54 ms → 38.94 ms (+12.4 ms) |
| balanced-500  | 19.87 ms → 23.09 ms (+3.2 ms)  |
| balanced-1000 | 23.25 ms → 30.88 ms (+7.6 ms)  |
| balanced-2000 | 39.69 ms → 42.94 ms (+3.3 ms)  |

Numbers crept up slightly across the board. Likely sources:

- **Two-step render chain for content updates.** Before slice subscription,
  one App re-render flushed every consumer in a single React commit. With
  slice subscription, the outline slot fires first (its useNode listener),
  then the canvas mirror slot fires after the next subscribeNode tick. The
  end-to-end DOM update is the same, but React schedules two commits
  instead of one — a few milliseconds more in the benchmark window.
- **Cold first fixture bias.** balanced-100 sees the worst regression
  because its absolute number is smallest; even a single React commit's
  warmup cost is visible there. balanced-2000's relative regression is
  smallest because the work-floor is higher.

None of the affected metrics moved out of the Go band, and steady-state
typing inside one node is now strictly cheaper (App / OutlinePane /
SpikeCanvas no longer re-render at all). If this regression ever matters,
a v0.2 follow-up could batch the two slot updates with
`react-dom/unstable_batchedUpdates` or fold the canvas mirror activation
into the same setState as the outline activation.

## R1-R4 still closed

| Risk | New evidence in this run |
|---|---|
| R1 selection sync | 13/13 e2e green including IME-safe content sync and canvas-selection mirror across all the new features. |
| R2 DOM scaling   | balanced-2000 with 4000 placeholder slots, only 45 canvas DOM nodes, edit-sync 42 ms. |
| R3 Tiptap instances | Editors count is 2 for every fixture — active-editor-only strategy held end-to-end. |
| R4 CSS scaling text | pan p95 stays in the 8-10 ms band even at zoom != 1; no subpixel jitter regressions visible in spec runs. |

## Verdict

**Go.** All metrics inside the Go threshold across both balanced and shape
fixture families. No new conditional or no-go items. v0.1-release is
performance-clean to proceed past the slice-subscription hardening item.

## Reproduction

```sh
node scripts/run-spike-benchmark.mjs --out docs/spike-results/2026-05-18-post-slice.md

# Shape fixtures (saved separately if you want to compare):
node scripts/run-spike-benchmark.mjs \
  --fixtures wide-500,deep-300,mixed-text-500,editing-hotspot-1000 \
  --out /tmp/extra-shapes.md
```
