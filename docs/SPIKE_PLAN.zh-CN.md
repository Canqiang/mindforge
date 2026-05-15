# MindForge — v0.1-spike 计划

> 本文定义 v0.1-spike 的执行范围、验收标准、benchmark 方法和 go / no-go 决策。spike 的目标不是做 MVP，而是验证承重假设。

## 1. Spike 目标

唯一目标：证明“大纲 ↔ 画布双向同步，包括选区 / 光标”在 DOM + SVG 架构下手感可接受。

同时验证四个承重风险：

- R1：大纲 ↔ 画布选区同步是否稳定。
- R2：DOM 节点性能上限是否足够。
- R3：每节点一个 Tiptap 实例是否可承受。
- R4：CSS 缩放下文字渲染是否足够清晰、稳定。

## 2. 范围

### 必须做

- 单包 Vite + React app 骨架。
- `src/core/`：最小 Doc schema、validation、DocOperation。
- `src/outline/`：一个 Tiptap bullet-list 大纲。
- `src/render/`：DOM 节点画布、SVG 直线连边、pan / zoom。
- `src/layout/`：简单 deterministic 左右布局，不做子树避让。
- `src/theme/`：一套默认主题。
- 双向同步：内容同步 + selection bridge。
- benchmark harness：100 / 500 / 1000 / 2000 节点 fixtures。

### 明确不做

- AI。
- 多主题。
- 自由箭头。
- import / export。
- 备注。
- minimap。
- 拖拽改父。
- 完整撤销 / 重做。
- Tauri。
- Canvas fallback 实现。

## 3. 交付物

spike 结束必须留下这些可复查产物：

- `src/` 下可运行原型。
- `examples/benchmark/` 下 100 / 500 / 1000 / 2000 节点 JSON fixtures。
- benchmark 脚本或 Playwright 测试。
- `docs/spike-results/YYYY-MM-DD.md`，记录机器、浏览器、指标、截图/录屏链接、go/no-go 结论。
- 如果失败，新增或草拟对应 fallback ADR。

## 4. Fixtures

benchmark 不只测一棵“好看的树”，至少包含：

| fixture | 目的 |
|---|---|
| `balanced-100` / `balanced-500` / `balanced-1000` / `balanced-2000` | 常规平衡树性能 |
| `wide-500` | root 下大量一级分支，测试左右布局和节点 mount 压力 |
| `deep-300` | 深链路，测试滚动、定位、选区映射 |
| `mixed-text-500` | 长短文本、emoji、code、链接混合 |
| `editing-hotspot-1000` | 1000 节点中连续编辑中心节点和远端节点 |

fixture 生成必须 deterministic：相同 seed 生成相同文档。

## 5. 性能指标

记录 `median`、`p95`、最大值。不要只看平均值。

| 指标 | Go | Conditional | No-go |
|---|---|---|---|
| 活动视图按键到 paint | p95 < 16ms | p95 16-32ms，可定位优化点 | p95 > 32ms 或输入丢帧明显 |
| 镜像视图同步延迟 | p95 < 50ms | p95 50-100ms，但活动视图不被阻塞 | p95 > 100ms 或顺序错乱 |
| 1000 节点 pan / zoom | p95 frame < 16.7ms | 16.7-25ms，能通过 culling 明确修复 | >25ms 或交互明显卡顿 |
| 2000 节点可用性 | 可浏览，可编辑局部节点 | 只能浏览，编辑慢但不崩 | 无法交互或浏览器明显失控 |
| layout 耗时（1000 节点） | p95 < 8ms | 8-20ms，可 memo / worker 化 | >20ms 且阻塞输入 |
| mount 初始耗时（1000 节点） | < 1s | 1-2s | >2s |

机器和浏览器必须写入结果文档。不同机器之间不比较绝对数字，只比较同一机器上的方案差异。

## 6. Selection 验收

至少覆盖这些用例：

- 在 outline 中点击某个节点正文，canvas 对应节点获得镜像 cursor。
- 在 canvas 节点中点击正文，outline 对应位置获得镜像 cursor。
- 普通英文输入、中文 IME composition、快速连续输入都不跳光标。
- 滚动 outline 后再同步 selection，位置仍正确。
- pan / zoom canvas 后再同步 selection，位置仍正确。
- 选中一段 node-local text range，另一侧能映射到同一 node 的同一范围。
- 焦点切换不会产生无限 transaction loop。

spike 阶段不要求跨多个节点的复杂 range selection 完美同步；如果暂不支持，必须在结果文档中明确限制。

## 7. Go / No-go

### Go

- R1-R4 都达到 Go 或可接受的 Conditional。
- Conditional 项有明确、低风险的修复路径。
- `core/`、`layout/`、`render/`、`outline/` 边界没有被打穿。

### No-go

任一情况触发 no-go：

- 活动视图输入被镜像视图或 layout 明显阻塞。
- selection 同步在常见用例下频繁跳光标。
- 1000 节点 pan / zoom 无法接近 60fps，且 culling / memo 没有明确修复路径。
- 每节点 Tiptap 实例导致内存或 mount 时间不可接受。
- DOM 缩放文字质量无法接受，且 pixel rounding / transform 策略无法修复。

### Conditional go

可以进入 v0.1-release，但必须先补一个 hardening milestone：

- viewport culling。
- render memo / selector 修复。
- selection bridge 重构。
- 文字缩放策略调整。

## 8. Plan B 触发后怎么做

- R1 失败：评估“非实时同步 outline”或“单共享 Tiptap editor”方案，并新增 ADR。
- R2 / R4 失败：评估 Canvas render fallback。`core/` 和 `layout/` 保留，`render/` 重写。
- R3 失败：放弃每节点 Tiptap 实例，实验单 editor + node views / decorations。

Plan B 不在 spike 里完整实现，只需要足够验证方向。
