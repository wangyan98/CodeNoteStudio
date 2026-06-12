# Network Graph 渲染修复

日期: 2026-06-12

## 修复一：block 连线端口强制上/下

**文件:** `src/renderer/src/components/editors/NetworkCanvas.tsx`

**问题:** `resolveGlobalPos()` 返回 block 内部的 `direction` 作为外部连线的端口方向，导致内部为 horizontal 布局的 block 在顶层连接受影响——连线从左右而非上/下进出。

**修复:** `resolveGlobalPos()` 中顶层节点统一返回 `direction: 'vertical'`，外部连线始终从上（in）、从下（out）进出。Block 内部子节点连线仍沿用 `blockLayout.direction`，不受影响。

```ts
// 修复前
const dir = node?.kind === 'block'
  ? (node.direction ?? blockLayouts.get(nodeId)?.direction ?? 'vertical')
  : 'vertical'

// 修复后
return { ..., direction: 'vertical' }
```

## 修复二：端口索引按 X 坐标排序，消除连线交叉

**文件:** `src/renderer/src/components/editors/NetworkCanvas.tsx`

**问题:** 顶层连线端口索引按 JSON 边遍历顺序分配，与节点实际水平位置无关。当 Text Encoder（左侧）和 FPN Neck（右侧）同时连线到 VL Backbone 时，端口顺序随机，导致连线交叉。

**修复:** 预计算每条边的端口索引——按 source 或 target 节点的 X 坐标排序，左侧节点总是分配到左侧端口。

- 对每个 target，按 source 的 X 坐标升序排列入边
- 对每个 source，按 target 的 X 坐标升序排列出边

## 修复三：顶层节点间距增大

**文件:** `src/renderer/src/components/editors/NetworkCanvas.tsx`

**问题:** 默认 `nodesep=40` 导致 VL Backbone 下方多个节点（Geometry Encoder / Prompt Concatenation / Tracker Module）排布紧凑。

**修复:** `runLayout()` 新增可选参数 `nodesep`、`ranksep`，顶层调用传入 `nodesep=120, ranksep=80`。Block 内部仍用默认值（40/60）。

## 修复四：SAM3 数据文件 direction 统一为 vertical

**文件:** `skills/network-graph/scripts/build_sam3.py`
**文件:** `sam3-direction-aware.net.json`

ViT Backbone 的 `direction` 从 `"horizontal"` → `"vertical"`，其他 block 保持不变。

## 修复五：SKILL.md 规则更新

**文件:** `skills/network-graph/SKILL.md`

- `direction` 属性硬性规则：所有 block 必须使用 `"vertical"`，禁止 `"horizontal"` 和 `null`
- 移除 horizontal 相关的全部文档、示例、对照表
- 脚本参考中仅保留 `--direction vertical`
