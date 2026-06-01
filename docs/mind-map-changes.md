# 思维导图 (Mind Map) 功能改动记录

## 1. 分支连线改进

**问题**: 原来的贝塞尔曲线连线从每个子节点直连母节点，连线从节点内部穿过，视觉效果混乱。

**方案**: 改为组织架构图风格的分支连线 (org-chart style branch connectors):
- 母节点右侧 → 水平线 → 弯头 (elbow) → 垂直分布线 → 各子节点水平连线
- 弯头位置设在距母节点 75% 处，确保连线在节点外部清晰可见
- 节点间距从 180px 增加到 240px (Canvas) / 200px (Renderer)

**涉及文件**: `MindMapCanvas.tsx`, `MindMapRenderer.tsx`

---

## 2. 节点拖拽同步移动

**问题**: 拖拽节点时，连线和子节点不会跟随移动，且松手后无法恢复原位。

**方案**:
- 为所有连线添加 `data-orig-x1/y1/x2/y2` 原始坐标属性，拖拽时以此为基准计算偏移（避免累积误差）
- 添加 `data-owner-id` / `data-child-id` / `data-parent-id` / `data-line-type` 属性用于 DOM 查询
- 拖拽过程中: 移动节点 + 子孙节点 + 自有连线 + 子孙连线 + 入边连线，全部同步
- 入边连线保持水平: `y1` 和 `y2` 同步移动，`x1` 固定在弯头处不动
- 母节点垂直分布线: 每帧重新计算所有兄弟节点的当前位置，取 min/max 作为跨度
- 松手后: 调用 `render()` 完整重建 SVG，所有元素回到原始树布局位置

**涉及文件**: `MindMapCanvas.tsx`

---

## 3. 嵌入渲染器缩放/平移

**问题**: 在 MD 文件中嵌入思维导图时，大型导图被截断，无法查看完整内容。

**方案**:
- 添加 d3.zoom 缩放行为 (scale extent: 0.3 - 2.5)
- 初始渲染时自动 zoom-to-fit，将整个树居中显示在容器内
- 支持鼠标滚轮缩放和拖拽平移
- 容器设置 `overflow: hidden` 避免多余滚动条

**涉及文件**: `MindMapRenderer.tsx`, `MdEditor.css`

---

## 4. 单击选中修复

**问题**: 拖拽结束后调用 `render()` 重建 SVG，但 d3.drag 的 `end` 事件在每次 mouseup 时都会触发（包括纯点击无拖拽的情况），导致 click 事件目标元素被销毁，节点无法被点击选中。

**方案**: 添加 `dragged` 标志位，仅在确实发生拖拽移动时 (`on('drag')` 触发过) 才在 `end` 中重建 SVG。纯点击时只恢复 rect 描边样式，保持 DOM 完整，让 click 事件正常触发。

**涉及文件**: `MindMapCanvas.tsx`

---

## 5. 移除 Code Mappings / Embed Refs

**问题**: 思维导图节点的代码引用和笔记嵌入以独立字段 (`codeMappings`, `embedRefs`) 存储，与 MD 文件的内联引用方式不一致。

**方案**:
- 从 `MindMapNode` 类型中删除 `codeMappings` 和 `embedRefs` 字段
- 从 reducer 中删除相关 4 个 action (`ADD_CODE_MAPPING`, `REMOVE_CODE_MAPPING`, `ADD_EMBED_REF`, `REMOVE_EMBED_REF`)
- 从编辑面板 UI 中删除 "Code Mappings" 和 "Embed Refs" 区域
- 代码/笔记引用统一使用 MD 内联语法: `@ref(functionName)` 和 `![[note-path]]`
- Monaco 编辑器保留 `@ref()` 自动补全功能

**涉及文件**: `note-types.ts`, `mindMapReducer.ts`, `NodeEditPanel.tsx`, `mindMapReducer.test.ts`

---

## 关键架构决策

- **选中高亮与渲染解耦**: 选中状态变化通过独立 `useEffect` 直接操作 DOM (`querySelectorAll` + `setAttribute`)，不触发 D3 完整重建，避免黄色边框闪烁
- **拖拽基准坐标**: 使用 `data-orig-*` 属性存储渲染时的原始坐标，拖拽时以 `orig + offset` 计算，避免每帧累加造成的漂移
- **松手重建**: 拖拽不支持实际改变树结构（仅视觉预览），松手后通过 `render()` 完整重建 SVG 恢复到原始布局
