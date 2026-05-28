# 思维文档编辑功能 — 设计规格

## 概述

为 `.mind.json` 文件实现完整的可视化编辑功能，将现有的只读 `MindMapRenderer` 升级为基于 D3.js 交互式画布的编辑器。用户可以在画布上直接操作节点（增删改拖拽），通过底部面板编辑节点的 Markdown 正文、代码映射和嵌入引用。

## 编辑范式

**纯画布编辑**：D3.js 交互式树图即编辑器。节点操作（选择、编辑标题、添加、删除、拖拽重排）直接在画布上完成。选中节点后，底部弹出编辑面板用于编辑正文内容。

## 组件架构

将现有 `MindMapRenderer` 重构为三层组件结构：

```
MindMapEditor (顶层容器，useReducer 管理文档状态)
├── MindMapCanvas    (D3.js SVG 交互画布)
│   ├── d3.tree() 布局 + 节点/连线渲染
│   ├── 事件: click/dblclick/contextmenu/drag/键盘
│   └── d3.zoom() 缩放和平移
├── NodeContextMenu   (右键菜单，Portal 渲染)
└── NodeEditPanel    (底部可拖拽面板，高度可调)
    ├── 标题输入框
    ├── Monaco Editor (Markdown 正文)
    ├── CodeMappingsList
    └── EmbedRefsList
```

**MindMapEditor** 持有 `MindMapDocument` 状态，协调子组件：
- `MindMapCanvas` 负责渲染和用户交互，向上报告事件
- `NodeContextMenu` 响应右键显示操作菜单
- `NodeEditPanel` 显示/编辑选中节点的完整数据

## 交互行为

### 节点操作

| 操作 | 触发方式 | 行为 |
|------|---------|------|
| 选中节点 | 单击 | 高亮边框，底部面板加载节点数据 |
| 编辑标题 | 双击 | 节点上 overlay `<input>`，Enter 确认 / Esc 取消 |
| 添加子节点 | 右键菜单 "添加子节点" / Tab | 在当前节点下创建空子节点 |
| 添加兄弟节点 | 右键菜单 "添加兄弟节点" / Enter | 在同级下创建空节点 |
| 删除节点 | 右键菜单 / Delete | 删除节点及其子树，需二次确认 |
| 折叠/展开 | 右键菜单 / Space | 切换子树可见性，折叠状态不持久化 |
| 拖拽 reorder | 拖拽到节点间隙 | 调整同级节点顺序 |
| 拖拽 reparent | 拖拽到节点上 | 改变父子关系，目标节点显示高亮 |
| 复制/粘贴 | 右键菜单 | 复制节点为子树模板，粘贴到目标下 |

### 键盘快捷键

| 快捷键 | 操作 |
|--------|------|
| Tab | 添加子节点 |
| Enter | 添加兄弟节点 |
| Delete | 删除选中节点 |
| Space | 折叠/展开选中节点 |
| ↑↓←→ | 在节点间切换选中 |
| F2 | 进入标题编辑模式 |
| Ctrl+S | 立即保存 |

### 画布操作

- **缩放**：滚轮缩放（`d3.zoom()`）
- **平移**：拖拽空白区域
- **右键菜单**：在节点上右键时显示，包含所有节点操作项和快捷键提示

## 底部编辑面板 (NodeEditPanel)

选中节点后从 Panel 2 底部滑出，默认占 35-40% 高度，分界线可拖拽调整。

### 布局

```
┌────────────────────────────────────────┐
│  节点标题  [_________________________]  │
│  正文 (Markdown)                         │
│  ┌──────────────────────────────────┐   │
│  │  Monaco Editor                   │   │
│  │  - @ref 自动补全                  │   │
│  │  - Markdown 语法高亮              │   │
│  │  - LaTeX 语法高亮                 │   │
│  └──────────────────────────────────┘   │
│  ── 代码映射 ────────────────────────   │
│  @ref(partition) → src/sort.c:42  [×]  │
│  [+ 添加映射]                            │
│  ── 嵌入引用 ────────────────────────   │
│  📄 复杂度分析.md               [×]    │
│  [+ 添加嵌入]                            │
│  ✓ 已保存                                │
└────────────────────────────────────────┘
```

### 功能细节

- **Monaco Editor**：复用 `@ref` 自动补全（`registerRefCompletionProvider`），支持 Markdown 和 LaTeX 语法高亮
- **代码映射列表**：显示 `@ref(name) → 文件:行号`，每项可点击跳转 Panel 3，支持删除
- **嵌入引用**：显示笔记路径，支持删除，添加时从笔记目录选择
- **保存指示器**：底部显示当前保存状态（"✓ 已保存" / "● 保存中..." / "✗ 保存失败"）

## 状态管理

在 `MindMapEditor` 中使用 `useReducer`：

```typescript
type MindMapAction =
  | { type: 'SELECT_NODE'; nodeId: string }
  | { type: 'UPDATE_TITLE'; nodeId: string; title: string }
  | { type: 'UPDATE_CONTENT'; nodeId: string; content: string }
  | { type: 'ADD_CHILD'; parentId: string }
  | { type: 'ADD_SIBLING'; nodeId: string }
  | { type: 'DELETE_NODE'; nodeId: string }
  | { type: 'REPARENT'; nodeId: string; newParentId: string; index?: number }
  | { type: 'REORDER'; nodeId: string; newIndex: number }
  | { type: 'TOGGLE_COLLAPSE'; nodeId: string }
  | { type: 'ADD_CODE_MAPPING'; nodeId: string; mapping: CodeMapping }
  | { type: 'REMOVE_CODE_MAPPING'; nodeId: string; index: number }
  | { type: 'ADD_EMBED_REF'; nodeId: string; ref: string }
  | { type: 'REMOVE_EMBED_REF'; nodeId: string; index: number }
  | { type: 'SET_DOCUMENT'; document: MindMapDocument }
```

**折叠状态**使用外层 `Set<string>`，不持久化到 `.mind.json`。

## 自动保存

- `useEffect` 监听 `document` 变化 → 300ms debounce → `onSave(doc)` → IPC `notes:update`
- 底部面板显示保存状态指示器
- `Ctrl+S` 触发立即保存（跳过 debounce）

## 循环引用检测

`REPARENT` 和 `ADD_EMBED_REF` 时执行：
- 沿树向上遍历检查目标节点是否为操作节点的祖先
- 检测到环 → 拒绝操作 + toast 提示 "无法执行：会产生循环引用"

## 涉及文件变更

### 新建
- `src/renderer/src/components/editors/MindMapEditor.tsx` — 顶层容器
- `src/renderer/src/components/editors/MindMapCanvas.tsx` — D3.js 画布
- `src/renderer/src/components/editors/NodeContextMenu.tsx` — 右键菜单
- `src/renderer/src/components/editors/NodeEditPanel.tsx` — 底部面板
- `src/renderer/src/components/editors/NodeEditPanel.css`
- `src/renderer/src/components/editors/mindMapReducer.ts` — reducer 逻辑

### 修改
- `src/renderer/src/components/editors/MindMapRenderer.tsx` — 重构成导出 MindMapEditor
- `src/renderer/src/components/NoteViewport.tsx` — 路由到 MindMapEditor 而非 MindMapRenderer
- `src/renderer/src/components/editors/MindMapRenderer.css` — 扩展样式

### 复用
- `src/renderer/src/services/monaco-completion.ts` — @ref 自动补全
- `src/main/schemas/note-types.ts` — 数据模型（无需改动）
- `src/main/services/note-service.ts` — 后端 CRUD（无需改动）

## 边界与限制

- 撤销/重做（Ctrl+Z）v1 不做
- 节点折叠状态不持久化（打开文件时全部展开）
- 拖拽 reorder 限定在同级节点范围内
- 拖拽 reparent 不允许产生循环引用
- 嵌入引用仅存储路径，不验证目标是否存在（和 MD 编辑器行为一致）

## 非目标（v1）

- 撤销/重做
- 多节点同时选中/批量操作
- 主题/样式切换
- 导出为图片/PDF
- 从 MD 笔记中拖入节点
