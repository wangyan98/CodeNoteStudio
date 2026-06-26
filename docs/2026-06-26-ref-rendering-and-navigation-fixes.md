# @ref 渲染与跳转修复 (2026-06-26)

## 问题一：@ref 独占一行 vs 行内渲染

### 现象

`@ref(...)` 在文本中行内出现时，也会渲染出 `<pre>` 代码块，破坏段落流式布局。

### 根因

`markdown-renderer.ts` 中 @ref 替换使用单一正则 `/@ref\(...\)/g`，不区分行首/行内位置，所有匹配项统一追加代码块。

### 修复

拆分为两次替换：

| 替换 | 正则 | 行为 |
|------|------|------|
| 第一遍（独占一行） | `/^@ref\(...\)$/gm` | 蓝色链接 + `<pre>` 代码块 |
| 第二遍（行内） | `/@ref\(...\)/g` | 仅蓝色链接，无代码块 |

### 文件

`src/renderer/src/services/markdown-renderer.ts`

---

## 问题二：@ref 搜索函数时，点击跳转行号不正确

### 现象

`@ref(repo#src/file.ts#150#submitMessage)` 点击后能打开文件，但无法跳转到指定的第 150 行，而是跳转到匹配 symbol 的 `startLine`（函数定义起始行）。

### 根因

两层问题：

#### 1. 解析层：T1/T2 使用 symbol.startLine 丢弃用户指定行号

`ref-resolver.ts` 中 T1（file+line+name）和 T2（file+line）匹配成功时，通过 `toMapping(ref, match)` 取了 symbol 自身的 `startLine`，忽略了用户显式指定的 `ref.line`。

当 T1 的 name 匹配某一个函数失败（比如用户写的 `submitMessage` 不在 symbol 索引
中），回退到 T2 匹配，找到跨越第 150 行的某个大函数（比如 `handleRequest` 从第 10
行到第 300 行），取到 `sym.startLine = 10`，用户的 `#150` 被丢弃。

#### 2. 导航层：dispatch 属性名错误

`useCodeNavigation.ts` 中使用了 JavaScript 对象属性简写：

```typescript
dispatch({ type: 'REVEAL_FILE_IN_TREE', resolvedPath })        // → { resolvedPath: '...' }
dispatch({ type: 'SET_PENDING_SCROLL', resolvedPath, line: startLine })  // → { resolvedPath: '...' }
```

但 action 类型定义和 reducer 读取的是 `filePath`：

```typescript
case 'SET_PENDING_SCROLL':
  return { ...state, pendingScroll: { filePath: action.filePath, line: action.line } }
```

`action.filePath` 始终为 `undefined`，CodeViewport 中的滚动逻辑永远不触发：

```typescript
if (activeFile.path === state.pendingScroll.filePath)  // 'xxx' === undefined → false
```

### 修复

| 层 | 文件 | 变更 |
|----|------|------|
| 解析 | `src/main/services/ref-resolver.ts` | T1、T2 不再通过 `toMapping` 取 symbol.startLine，直接用 `ref.line` |
| 导航 | `src/renderer/src/hooks/useCodeNavigation.ts` | `resolvedPath` 改为显式 `filePath: resolvedPath` |

T1 中 `functionName` 使用 `ref.name ?? match.name`（保留 Class.method 写法），
T2 中 `functionName` 使用 `match.name`（用户名称可能不对，取匹配到的 symbol 名）。

---

## 问题三：@ref 蓝色链接显示原始 @ref(...) 文本

### 现象

渲染预览中 @ref 链接显示完整的 `@ref(repo:src/file.ts:150:name)` 原始字符串，
可读性差。

### 修复

`markdown-renderer.ts` 在遍历 `codeMappings` 时为每个匹配的 ref 构建人类可读标签：

- **仅有文件**（functionName 包含 `/`，为回退路径）→ 仅显示相对路径，如 `src/config.py`
- **有函数名** → `相对路径 函数名`，如 `restored-src/src/QueryEngine.ts submitMessage`
- **未匹配** → 保持原始 `@ref(...)` 不变

相对路径通过 `codeRepos` 参数传入的 repo 前缀从绝对路径中剥离。函数名部分以
暖黄色 (`#e5c07b`) 展示，与蓝色文件路径形成视觉区分。

**CSS**：移除 `.ref-link` 的 `font-family: monospace`，新增 `.ref-fn` 颜色规则。

### 文件

| 文件 | 变更 |
|------|------|
| `src/renderer/src/services/markdown-renderer.ts` | 新增 `labelByRaw` Map + `relativePath()` + `codeRepos` 参数；函数名包裹 `<span class="ref-fn">` |
| `src/renderer/src/components/editors/MdEditor.tsx` | props 新增 `codeRepos`，透传给 `renderMarkdown` |
| `src/renderer/src/components/NoteViewport.tsx` | 传 `state.codeRepos` 给 `MdEditor` |
| `src/renderer/src/components/editors/MdEditor.css` | 新增 `.ref-fn { color: #e5c07b; }` |
