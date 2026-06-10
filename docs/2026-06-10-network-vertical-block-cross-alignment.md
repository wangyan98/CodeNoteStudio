# YOLOv5n 纵向 Block 跨 Block 垂直线对齐修复

## 问题

YOLOv5n 网络图中，Neck (FPN) block (`direction: "vertical"`) 的子节点默认使用 dagre TB 布局，所有子节点紧凑地排列在 block 中央。但 Neck 通过 skip 连线（绿色虚线）从 Backbone 的三个不同位置（P3/P4/P5）接收数据：

- **P4**: Backbone `C3(128→128,n=3)` → Neck `Concat([11,6])`
- **P3**: Backbone `C3(64→64,n=2)` → Neck `Concat([15,4])`
- **P5**: Backbone `SPPF(256→256,k5)` → Neck `Concat([21,10])`

期望：绿色 skip 连线应垂直排列，Neck 中每条 column 应对齐 Backbone 源节点的正下方偏右。

## 根因

dagre 的 TB 布局不理解跨 block 的语义对齐需求，将所有子节点堆在一起居中放置，导致 skip 连线呈斜线。

## 修复方案 (`NetworkCanvas.tsx`)

在 `runLayout` 之后的三个处理步骤：

### 1. 列分区 (Column Partitioning)

以 skip 目标节点（Neck 中的 Concat）为锚点，将 Neck 的前向链切分为独立列：

```
P5层: Conv(256→128) → [unassigned, 有2条输出]
P4层: Upsample(×2) → Concat([11,6]) → C3 → Conv → Upsample(×2)
P3层:                   Concat([15,4]) → C3 → Conv → Concat([18,14]) → C3
P5层:                                               Conv(128→128) → Concat([21,10]) → C3
```

- 下游遍历通过 BFS 沿 forward 边进行，在遇到通向其他 skip 目标的节点时停止
- 上游节点（紧邻 skip 目标之前的节点）也纳入同一列

### 2. 列级偏移

对每个列，计算 Backbone 源子节点的全局 x 坐标与 Neck anchor 节点（Concat）当前全局 x 的差值，直接将整列子节点水平移动到目标位置。

首节点 `Conv(256→128)` 有 2 条输出（forward 到 Upsample + skip 到最后一个 Concat），不属于任何单一列。它被放置在 Backbone P4/P5 源节点全局 x 范围的中点上。

### 3. Block 级位置补偿

子节点向右偏移会导致 block 宽度增加。由于 block 以其 dagre 位置为居中锚点，宽度增加会使左边界向左移动 ΔW/2，视觉上抵消一半偏移。

在 bbox 重新计算后，保存旧宽度并与新宽度比较，将整个 Neck block 的 dagre x 坐标向右平移 `ΔW/2`，恢复子节点全局位置的对齐。

## 影响范围

- `src/renderer/src/components/editors/NetworkCanvas.tsx` — 在 `runLayout` 和 bounding box 计算之间新增约 145 行
- 对水平 block 无影响（仅处理 `direction === 'vertical'` 的 block）
- 无 skip 连线的垂直 block 也无影响（`skipTargets.length === 0` 时直接跳过）
