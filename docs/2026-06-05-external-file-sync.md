# 外部文件变更自动同步到 Notes 面板

**日期**: 2026-06-05
**类型**: bugfix

## 问题

在 Finder 或终端中向 workspace 新增、删除或重命名文件后，应用的 Notes 面板不会自动刷新，必须手动切换过滤器才能看到变化。

## 根因

项目中完全没有文件系统监听机制。`NoteDirectory` 组件仅在以下时机刷新 notes 列表：

- 组件首次挂载时
- 切换 note 类型过滤器时
- 通过 UI 手动创建/删除/重命名 note 后

外部对文件系统的任何改动，应用完全感知不到。

## 修复

### 新增 `src/main/services/file-watcher.ts`

使用 Node.js 内置的 `fs.watch` API 递归监听 notes 目录。在 macOS 上底层通过 FSEvents 实现，性能可靠且无需额外依赖。

- 300ms 防抖，避免短时间内多次刷新
- 过滤隐藏文件（`.` 开头）的噪音事件
- `startWatching(notesPath, callback)` / `stopWatching()` 管理监听生命周期

### 修改 `src/main/ipc-handlers.ts`

- workspace 打开时通过 `restartWatcher()` 启动文件监听
- workspace 切换或关闭时停止旧的监听
- 检测到文件变更后，通过 `BrowserWindow.getAllWindows().webContents.send('notes:changed')` 向所有 renderer 窗口推送事件

### 修改 `src/preload/index.ts`

暴露 `onNotesChanged(callback)` 方法，内部使用 `ipcRenderer.on('notes:changed', ...)` 监听主进程推送，返回清理函数用于组件卸载时移除监听。

### 修改 `src/renderer/src/components/NoteDirectory.tsx`

新增 `useEffect` 注册 `notes:changed` 事件监听，收到通知后自动调用 `refreshNotes()`。

### 类型声明

`src/renderer/src/types/electron.d.ts` 添加 `onNotesChanged` 类型。

## 数据流

```
外部文件变更 → fs.watch 检测 → 300ms 防抖
  → main process 推送 IPC 'notes:changed'
  → renderer NoteDirectory 收到事件
  → refreshNotes() → 面板自动刷新
```

## 影响范围

- 外部新增文件：自动出现在 Notes 面板
- 外部删除文件：自动从 Notes 面板移除
- 外部重命名文件：自动更新显示
- 外部新增/删除文件夹：自动刷新目录树
