# Mind Map Node Content Embed Rendering — 设计规格

## 概述

在 mind.json 思维导图节点的 `content` 字段中支持 `[[relative/path]]` 语法引用外部文件，被引用文件的内容在思维导图 Canvas 中以嵌入式卡片形式渲染。仅展开第一层（不递归渲染嵌入文件中的嵌入引用），并检测阻止循环引用。

## 数据流

```
Node content (含 [[path]] 引用)
        │
        ▼
  Parse: 正则提取所有 [[path]] → Array<{rawMatch, relativePath}>
        │
        ▼
  Resolve: 相对路径 → 绝对路径 → IPC readNote() → {path, content, type}
        │  (含循环引用检测: visitedPaths Set 检查)
        │
        ▼
  Render: Canvas 绝对定位 HTML overlay 层 + 切换按钮
        │
        ▼
  Toggle UI: ▶/▼ 按钮，默认折叠
```

关键设计决策：
- **延迟加载**：仅在用户点击展开时才解析和加载嵌入文件（性能优化）
- **内容缓存**：已加载的嵌入内容缓存在 `Map<string, EmbedContent>` 中，避免重复 IPC 调用
- **第一层**：被嵌入文件的内容直接渲染，不解析其内部的 `[[path]]` 引用
- **定位方案**：绝对定位 HTML 层（主方案），SVG foreignObject（备选方案，只记录不实现）

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `MindMapCanvas.tsx` | 主要修改 | 新增 HTML overlay 层、embed 解析/渲染/切换逻辑、位置同步 |
| `MindMapCanvas.css` | 修改 | overlay 定位样式、embed 卡片样式、toggle 按钮样式 |
| `mindMapReducer.ts` | 小改 | 新增 `TOGGLE_EMBED` action 类型 |
| `MdEditor.tsx` | 小改 | 抽取 `renderMarkdown()` 为共享工具函数 |
| `src/renderer/src/services/markdown-renderer.ts` | 新增 | 从 MdEditor 中提取的共享 markdown→HTML 渲染逻辑 |

已有组件（`MindMapRenderer`、`DerivationDagViewer`、`SequenceDiagramViewer`）直接复用，无需修改。

## 语法

节点 `content` 中使用 `[[relative/path]]` 引用文件，沿用 MD 文件 embed 的 wiki-link 风格：

```markdown
关于时间复杂度，详见 [[复杂度分析.md]]
```

路径相对于当前 mind.json 文件所在目录解析。

## 支持的嵌入类型

| 文件类型 | 渲染组件 | 渲染方式 |
|----------|----------|----------|
| `.md` | 共享 `renderMarkdown()` | Markdown → HTML |
| `.mind.json` | `MindMapRenderer` | 只读思维导图 |
| `.derive.json` | `DerivationDagViewer` | 只读推导 DAG |
| `.seq.mermaid` | `SequenceDiagramViewer` | 只读序列图 |

## UI 行为

### 切换按钮

- 每个节点的 content 若包含 `[[path]]` 引用，在节点 rect 下方渲染一个 toggle 指示器
- **默认状态**：折叠（▶），显示文件名
- **展开状态**：显示 ▼ + 文件名 + 嵌入式内容卡片
- 切换状态存储在 `expandedEmbeds: Set<string>` 中（key = `{nodeId}::{path}`）

### 嵌入内容卡片

- 渲染在 Canvas 容器内的绝对定位 `<div class="embed-overlay">` 层中
- 卡片位置跟随对应 SVG 节点的 `getBoundingClientRect()` 计算
- 最大高度限制，超出部分滚动
- 缩放/平移时同步更新位置

### Canvas 渲染示意

```
┌─────────────────────────────────────────────┐
│  ┌──────────┐                               │
│  │ Root Node │                               │
│  └──────────┘                               │
│       │                                      │
│       ├── ▶ 📄 复杂度分析.md                  │  ← 折叠
│       │                                      │
│  ┌──────────┐                               │
│  │ Child 1  │                               │
│  └──────────┘                               │
│       │                                      │
│       ├── ▼ 📄 排序算法.mind.json             │  ← 展开
│       │   ┌──────────────────────────┐       │
│       │   │  [MindMapRenderer 嵌入]   │       │
│       │   └──────────────────────────┘       │
│       │                                      │
│       ├── ⚠ Circular reference: xxx.json     │  ← 循环引用
│                                              │
└─────────────────────────────────────────────┘
```

## 循环引用检测

检测逻辑在 resolve 阶段执行：

```
解析 fileA.mind.json 节点content 中的 [[targetPath]]
    ↓
构建绝对路径 targetAbsPath
    ↓
targetAbsPath === sourceFileAbsolutePath?
    ↓ YES → 标记为循环引用
    ↓ NO  → 正常加载并渲染
```

由于仅展开第一层（被嵌入文件内部的 `[[path]]` 不做解析），循环引用仅可能发生在：
- 节点引用自身所在的 mind.json 文件
- （未来多层级展开场景：A→B→A 的间接循环）

## 错误处理

| 场景 | 表现 |
|------|------|
| 文件不存在 | `⚠ File not found: path` |
| 读取权限错误 | `⚠ Cannot read: path` |
| 循环引用 | `⚠ Circular reference: path` |
| 不支持的文件类型 | `⚠ Unsupported type: path` |
| 其他加载错误 | `⚠ Load error: path` |

所有错误状态仅显示警告文本，不可展开。

## 备选方案 (仅记录，不实现)

**SVG foreignObject**：替代绝对定位 HTML 层，直接在 SVG 节点下使用 `<foreignObject>` 嵌入 HTML 内容。优点是与 SVG 坐标系统天然整合，缺点是某些环境性能和兼容性受限。如绝对定位方案在缩放/平移场景下位置同步问题较多，则切换到 foreignObject 方案。

## 边界

- 仅展开第一层（不递归渲染嵌入中的嵌入）
- 嵌入内容为只读，不可在 mind map 视图中编辑
- 嵌入文件必须与当前 notebook 在同一项目路径下
- 不涉及修改 note-types 数据结构（content 保持为 string，引用通过解析 content 文本获取）
