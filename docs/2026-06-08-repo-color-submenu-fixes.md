# Repo Color Submenu Fixes

## 问题 1：颜色子菜单项显示相同的圆点，无法区分颜色

**根因：** `WorkspaceToolbar.tsx` 中所有 8 个颜色选项的 `label` 都是 `'●'`（纯文本），`NodeContextMenu` 将 label 渲染为纯文本 `<span>`，因此所有颜色项看起来完全一样。

**修复：**
- `NodeContextMenu.tsx` — `MenuItem` 接口新增 `color?: string` 字段，渲染时在 label 前显示一个彩色圆点 (`<span className="node-context-menu-color-dot" style={{ backgroundColor: entry.color }} />`)
- `ContextMenu.css` — 新增 `.node-context-menu-color-dot` 样式（12×12px 圆形，带半透明边框）
- `WorkspaceToolbar.tsx` — 颜色子菜单项改为 `label: color`（显示十六进制色值）+ `color: color`（显示彩色圆点）
- `WorkspaceToolbar.css` — 移除不再使用的 `.node-context-menu-item .color-dot` 样式

## 问题 2：点击 Change Color 后需要第二次右键才会出现颜色选择菜单

**根因：** `NodeContextMenu` 的点击处理在每次 action 执行后都会调用 `onClose()`，导致 `repoContextMenu` 被置为 null。React 18 会将 `setColorSubmenuRepo(repoPath)` 和 `setRepoContextMenu(null)` 合并为一次渲染，使得颜色子菜单的渲染条件 `colorSubmenuRepo && repoContextMenu` 始终为 false。

**修复：**
- `NodeContextMenu.tsx` — `MenuItem` 接口新增 `disableAutoClose?: boolean` 字段，当设为 true 时跳过 `onClose()` 调用
- `WorkspaceToolbar.tsx` — "Change Color" 菜单项添加 `disableAutoClose: true`

## 问题 3：修改颜色后 Code Viewport 下的文件颜色没有同步更新

**根因：** `CodeViewport.tsx` 中的 `getRepoColorByPath` 函数仅根据 repo 在数组中的索引从 `REPO_COLORS` 取默认颜色，完全忽略了 `repo.color` 自定义颜色。

**修复：** `CodeViewport.tsx` — `getRepoColorByPath` 改为先检查 `repo.color`，仅在未设置自定义颜色时回退到索引默认颜色。
