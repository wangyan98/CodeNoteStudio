# 思维导图 @ref 跳转相对路径修复

> 2026-06-08

## 问题

在思维导图中，节点上的 → 跳转图标点击后报 `ENOENT: no such file or directory`，原因是 `codeMapping.filePath` 存储的是相对路径（如 `Engine/Source/Runtime/.../GLFWApplication.cpp`）而非绝对路径。

虽然下方的 CodeMappingField 可以正常解析并跳转（因为它走 `resolveRefs` 实时解析），但节点上渲染的跳转图标直接读取已保存的 `codeMapping.filePath`，一旦历史数据中存入了相对路径就会失败。

## 根因分析

### 1. `getRepoPath` 回退搜索使用了错误的符号列表

`resolveRefs` 的 T2/T3 Fallback B 路径在构造绝对路径时需要 repo 根路径：

```typescript
// 旧代码
const any = symbols.find((s) => s.repoPath)  // symbols = 候选符号（可能为空！）
```

当 targetRepo 过滤后的 `candidateSymbols` 为空时，这个最后兜底搜索永远返回 `undefined`，导致无法拼接绝对路径。

### 2. C++ `::` 命名空间分隔符与 `:` 分割符冲突

使用 `:` 作为 @ref 分隔符时，C++ 的 `::`（如 `GLFWApplication::Initialize`）会被错误切割。添加了 `findLastNameSeparator` 辅助函数，同时支持 `.` 和 `::` 两种父子分隔符。

### 3. 历史数据可能已存入相对路径

即使修复了所有路径构造逻辑，已保存的 mindmap JSON 中仍可能残留相对路径的 `codeMapping.filePath`。

## 修复

| 文件 | 改动 |
|------|------|
| `src/main/services/ref-resolver.ts` | **`getRepoPath`**：最后兜底搜索改为 `allSymbols.find(s => s.repoPath)` 而非 `symbols.find(...)` |
| | **`findLastNameSeparator`**：新增辅助函数，同时处理 `.` 和 `::` 父子分隔符 |
| | **`symbolMatchesName` / `findSymbolByName`**：使用 `findLastNameSeparator` 替代仅支持 `.` 的逻辑 |
| | **`classifyRef`**：`:` 分隔符模式下，先用占位符保护 `::` 避免错误切割 |
| | **`toMapping`**：保留 `::` 在 displayName 中的展示 |
| `src/renderer/src/components/editors/MindMapCanvas.tsx` | **新增 `handleCodeJump`**：跳转前检查 `filePath` 是否为绝对路径；如果是相对路径且有 `raw` 引用文本，自动调用 `resolveRefs` 重新解析后再跳转。→ 图标点击和双击跳转均使用此辅助函数 |

## 效果

- 新建的 codeMapping 在所有解析层级（T1–T5 及 Fallback A/B）均返回绝对路径
- 已存在相对路径的历史 mindmap JSON 在跳转时自动重新解析为绝对路径
- C++ `::` 命名空间语法在 `:` 和 `#` 两种分隔符下均可正确解析
