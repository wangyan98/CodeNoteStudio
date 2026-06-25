# Agent 对话框 Markdown 格式消息渲染修复

日期: 2026-06-25

## 问题

Agent 对话框中 assistant 角色的消息以纯文本形式显示，所有 Markdown 格式（标题、粗体、斜体、代码块、表格、列表、公式等）均未渲染，可读性差。

**现象**: agent 返回的 Markdown 格式内容在对话框中显示为原始文本，`**bold**`、`# heading`、` ```code``` ` 等语法未被转换为富文本。

## 根因

`AgentDialog.tsx` 的 `renderContent` 函数对 assistant 消息直接返回原始字符串内容，从未调用已有的 `renderMarkdown()` 服务进行 Markdown → HTML 转换。该服务被 `MdEditor`、`MindMapCanvas` 等组件广泛使用，但 AgentDialog 没有集成。

## 修复

### `src/renderer/src/components/AgentDialog.tsx`

1. **引入 `renderMarkdown`**: 从 `../services/markdown-renderer` 导入

2. **新增 `renderAssistantHtml` 函数**: 
   - 将 assistant 消息内容中的原始 doc 路径（`docs/foo.md`）预处理为 Markdown 链接 `[docs/foo.md](doclink://docs/foo.md)`
   - 调用 `renderMarkdown()` 将 Markdown 转为 HTML

3. **Assistant 消息改用 `dangerouslySetInnerHTML` 渲染**: 
   - assistant 消息以 HTML 形式插入 DOM
   - user / tool_call / tool_result / error 消息保持纯文本渲染

4. **Doc 链接点击处理**: 
   - 在消息容器上通过事件委托捕获 `a[href^="doclink://"]` 的点击
   - 拦截默认行为，改为调用 `handleDocClick` 导航到对应文档

### `src/renderer/src/components/AgentDialog.css`

1. 移除 `.agent-message.assistant` 的 `white-space: pre-wrap`（Markdown HTML 自带排版）
2. 新增 assistant 消息内 Markdown 元素的样式：
   - 标题 h1-h4：字体大小、间距、颜色
   - 段落、列表：间距、缩进
   - 行内代码 `code`：深色背景、圆角
   - 代码块 `pre`：深色背景、内边距、横向滚动
   - 引用 `blockquote`：左侧边框、灰色文字
   - 表格：边框、表头背景
   - 链接：蓝色、hover 变绿

## 影响范围

- Agent 对话框 assistant 消息显示
- Markdown 格式：标题、粗体/斜体、代码块、行内代码、列表、引用、表格、链接、图片、KaTeX 公式
- Doc 路径链接点击导航（行为不变，由 `[text](doclink://path)` → HTML `<a>` → 事件委托捕获实现）
