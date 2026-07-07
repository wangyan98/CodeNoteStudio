# Network Graph SKILL.md 规则放宽

## 变更日期

2026-07-07

## 变更文件

`skills/network-graph/SKILL.md`

## 变更背景

之前的规则过于严格，导致大模型出现两个问题：
1. 强制要求 layer 必须在 block 内，大模型不理解 block 概念，将 block 当成 layer 使用（给 block 设置 `layerType`、`params`、shapes 等）
2. block 的使用需要声明/注册，导致大模型不敢自由使用 block

## 具体变更

### 1. 放宽 layer-in-block 强制约束（规则 #2 重写）

**之前**：HARD RULE — Every layer MUST be inside a block，顶层 layer 视为 broken diagram。

**之后**：layer 可以在顶层存在，block 是可选的容器。重点改为区分 block 和 layer 的本质差异——block 是容器（有 children/internalEdges），layer 是操作（有 layerType/params/shapes），两者不能混用。

### 2. 移除 block 需要声明的限制

新增明确说明：block 可在任何 `.net.json` 文件中自由创建使用，无需预先声明或注册网络。

### 3. 补充 YOLO 结构概念作为 block 示例

"Architectural stages" 类别中列出 Backbone、Head、Neck 等 YOLO 风格的概念，作为合法的 block 使用场景。

## 关键要求保留

- NEVER write `.net.json` by hand — build scripts only
- Complex networks MUST be split across multiple diagram files
- Block nesting 不超过 2 层
- Label 不超过 ~20 字符
