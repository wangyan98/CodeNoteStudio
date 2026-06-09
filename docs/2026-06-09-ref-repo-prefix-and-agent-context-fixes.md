# @ref 引用写入 repo 名 + Agent 上下文修复

日期: 2026-06-09

## 问题 1: 单个 repo 时 @ref() 不写入 repo 名

**现象**: 项目只配置了一个代码仓库时，部分 `@ref()` 引用中缺少 repo 前缀。例如 `@ref(src/main.py:42:func)` 而非 `@ref(myrepo:src/main.py:42:func)`。

**影响范围**: 3 个生成 `@ref()` 的位置：

| 位置 | 问题 |
|------|------|
| Monaco 自动补全 (`monaco-completion.ts`) | 从未写入 repo 前缀 |
| CodeViewport 符号选择器 (`handleSymbolSelect`) | 文件路径未匹配 repo prefix 时省略 repo |
| CodeViewport 拖拽 (`onDragStart`) | 同上 |

**修复**:
- `monaco-completion.ts`: 加载 `codeRepos` 配置，当符号文件属于某个 repo 时自动添加 repo 前缀
- `CodeViewport.tsx`: 当文件路径未匹配任何 repo 但有已配置的 repo 时，回退使用第一个 repo 的名称
- `agent/tools/markdown_tools.py`: 更新 `insert_ref` 工具描述，要求始终写入 repo 前缀

## 问题 2: Agent 未获取 Code Viewport 当前打开文件

**现象**: 用户在 Code Viewport 中打开了某个代码文件，但 Agent 的系统提示中不包含该文件信息，Agent 无法感知用户正在查看的文件。

**修复**: 4 个文件的链式传递：
- `AgentDialog.tsx` → POST body 新增 `active_file` 字段
- `server.py` → 提取 `active_file` 并传递给 `AgentLoop`
- `agent_loop.py` → 接受 `active_file` 参数并传入 `build_system_message`
- `context.py` → 系统模板新增 `Active file in Code Viewport: {active_file}`
