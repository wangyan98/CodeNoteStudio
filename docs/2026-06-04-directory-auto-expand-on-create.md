# Directory Auto-Expand on File Creation

## Problem

在 Notes 面板中，对一个处于折叠状态的目录右键 → "New Markdown"（或其他文件类型），目录不会自动展开。用户需要手动点击展开目录后才能看到输入框并输入文件名。

## Root Cause

`NoteDirectory.tsx` 的 `TreeItem` 组件中，创建文件的 inline input 渲染在 `{isFolder && expanded && (...)}` 块内（第192行）。每个 `TreeItem` 的 `expanded` 状态是组件本地管理的（`useState(true)`）。

已有的 `useEffect`（原第118行）仅在 `creatingIn === node.path` 时尝试聚焦 input，但未调用 `setExpanded(true)`——如果目录已折叠，input 根本不在 DOM 中，聚焦必然失败。

## Fix

将原来的单个 effect 拆分为两个：

1. **展开 effect**：依赖 `[creatingIn, node.path]`，当 `creatingIn === node.path` 时立即 `setExpanded(true)`，触发重渲染挂载 input 元素。
2. **聚焦 effect**：依赖 `[creatingIn, node.path, creatingType, expanded]`，在目录展开后（`expanded` 变为 `true`）自动聚焦 input 并设置光标位置。

```tsx
// Effect 1: expand folder when creating inside
useEffect(() => {
  if (creatingIn === node.path) {
    setExpanded(true)
  }
}, [creatingIn, node.path])

// Effect 2: focus input after expansion
useEffect(() => {
  if (creatingIn === node.path && expanded && createInputRef.current) {
    const input = createInputRef.current
    input.focus()
    if (creatingType !== 'folder') {
      input.setSelectionRange(0, 0)
    }
  }
}, [creatingIn, node.path, creatingType, expanded])
```

## Files Changed

- `src/renderer/src/components/NoteDirectory.tsx` — 拆分 `TreeItem` 中的创建 effect
