# Code Note Studio — 设计规格

## 概述

Code Note Studio 是一个桌面代码笔记工具，将思维导图、Markdown 笔记、公式推导和源代码浏览深度融合在统一的四栏界面中。核心价值：让开发者在对代码的理解（思维导图/笔记）和代码本身之间建立可追溯的双向映射。

## 四栏布局

```
┌────────────┬──────────────┬──────────────┬────────────┐
│ Panel 1    │ Panel 2      │ Panel 3      │ Panel 4    │
│ 笔记目录    │ 笔记视口      │ 代码视口      │ 代码目录    │
│ ~18%       │ ~32%         │ ~32%         │ ~18%       │
└────────────┴──────────────┴──────────────┴────────────┘
```

### Panel 1 — 笔记目录
- 以文件树展示所有笔记（目录结构即树结构）
- 按笔记类型过滤：思维文档树 / MD / 推导树
- 支持新建、删除、重命名、拖拽排序
- 标题模糊搜索
- 点击 → Panel 2 打开笔记

### Panel 2 — 笔记视口
- **MD 笔记**：Monaco Editor 编辑 + 实时预览（分栏或切换）
- **思维文档树**：D3.js 交互式树图，节点可展开/折叠/拖拽
- **公式推导树**：带自动编号的公式树，KaTeX 渲染
- **嵌入**：内联渲染被嵌入的子笔记（MD 块或子思维导图的缩略视图）
- **代码块**：`@ref` 语法声明的代码块以语法高亮渲染，带跳转按钮 → Panel 3

### Panel 3 — 代码视口
- Monaco Editor 只读模式展示代码文件
- 多 Tab 支持，可同时打开多个文件
- 来自笔记映射的函数/类高亮显示
- 显示当前 git commit SHA
- 支持代码折叠、符号导航

### Panel 4 — 代码目录
- 展示关联代码仓库的文件树
- 有映射关系的文件显示特殊标记
- 点击文件 → Panel 3 打开
- 支持文件类型过滤
- 支持切换多个关联仓库

## 笔记类型

### 1. 思维文档树 (.mind.json)
树形结构存储，每个节点包含：
- `id`: 唯一标识
- `title`: 节点标题
- `content`: 节点正文（支持 Markdown 和 LaTeX）
- `children`: 子节点数组
- `embedRefs`: 嵌入的其他笔记引用（MD 或子思维导图）
- `codeMappings`: 代码函数映射列表

### 2. Markdown 笔记 (.md)
标准 Markdown 文件，扩展语法：
- `[[embed:path/to/note]]` — 嵌入其他笔记
- ` ```lang @ref functionName ` — 代码块映射到函数
- `$$...$$` / `$...$` — LaTeX 公式（KaTeX 渲染）

### 3. 公式推导树 (.derive.json)
一种特殊的思维导树，每个节点是一个公式步骤：
- 继承思维导图节点的所有字段
- 每个节点额外包含 `stepNumber`（自动编号）
- 节点之间通过 `derivesFrom` / `derivesTo` 关系链接
- 渲染时显示推导箭头和步骤编号

## 嵌入模型

所有笔记类型支持双向嵌入：
- 思维文档树可嵌入：MD 笔记、子思维文档树、推导树
- MD 笔记可嵌入：MD 笔记、思维文档树、推导树
- 推导树可嵌入：MD 笔记、子思维文档树

**嵌入语义**：引用关系（非复制），被嵌入文件独立存在，修改一处处处更新。嵌入时渲染为内联卡片视图。

**循环引用检测**：嵌入操作时沿引用链向上遍历，检测到环则拒绝操作并提示用户。

## 代码集成

### 代码仓库关联
- 笔记项目通过 `notebook.json` 关联一个或多个外部代码仓库
- 每个仓库记录：本地路径、git commit SHA、LSP 配置
- 代码在 Panel 3/4 中只读展示（编辑需在外部 IDE 中进行）

### 函数映射
- 通过 `@ref functionName` 语法在笔记中声明映射
- 映射信息存入 SQLite 索引（`.index.db`）
- C++ 层使用 tree-sitter 解析代码仓库生成符号索引
- LSP Client 保持映射与代码的最新状态同步（函数重命名/移动时跟踪更新）

### 代码块渲染
- 笔记中 `@ref` 声明的代码块在渲染时显示语法高亮
- 代码块头部显示语言标识和跳转按钮
- 底部显示源文件路径和行号
- 思维导图节点和 MD 笔记共用同一套代码块渲染组件

## 技术架构

```
┌──────────────────────────┐
│  UI (Electron Renderer)  │  React + Monaco + D3.js + KaTeX
├──────────────────────────┤
│  Electron 主进程          │  IPC、文件系统、SQLite、HTTP/WS 服务
├──────────────────────────┤
│  C++ Native Addon (N-API)│  tree-sitter、LSP Client、libgit2
└──────────────────────────┘
```

### 前端 (Electron Renderer)
- React 组件树管理四栏布局和状态
- Monaco Editor：MD 编辑 + 代码只读展示
- D3.js：交互式思维导图渲染
- KaTeX：LaTeX 公式渲染
- 通过 Electron contextBridge + IPC 与主进程通信

### 主进程 (Electron Main)
- 窗口管理和应用生命周期
- 文件系统操作（笔记的 CRUD）
- SQLite 读写（better-sqlite3，映射索引）
- Express + WebSocket 服务（Web Live Server 模式）

### C++ Native Addon (N-API)
- tree-sitter：解析代码仓库生成 AST / 符号表
- LSP Client：连接语言服务器，提供函数定义/引用/跳转
- libgit2：读取 git 仓库信息（commit SHA、diff）
- 文件监控：watchman / inotify 监听代码仓库变化

### Web Live Server
- 桌面端启动 HTTP 服务（Express），浏览器访问
- WebSocket 用于 LSP 实时查询（跳转定义、查找引用）
- 浏览器端渲染完全相同的只读 UI
- 不提供编辑功能，但保留 LSP 跳转和代码浏览能力

## 文件存储结构

```
my-notebook/
├── notebook.json          # 项目配置 + 代码仓库引用
├── .index.db              # SQLite（映射关系索引）
├── notes/
│   ├── 算法分析/
│   │   ├── 排序算法.mind.json
│   │   ├── 复杂度分析.md
│   │   └── 主定理推导.derive.json
│   └── ...
└── .git/                  # 可选，笔记本身可用 git 版本管理
```

**notebook.json 结构**：
```json
{
  "name": "my-notebook",
  "codeRepos": [{
    "path": "/home/user/projects/algo",
    "commit": "a1b2c3d4",
    "lsp": { "language": "cpp", "command": "clangd" }
  }]
}
```

## 交互流程

### 流程 1：打开笔记 → 查看代码
Panel 1 选中笔记 → Panel 2 渲染内容 → 点击代码块跳转按钮 → Panel 3 跳转到对应函数 → Panel 4 展开并高亮文件

### 流程 2：浏览代码 → 查找笔记
Panel 4 浏览代码树 → Panel 3 查看代码 → 右键 "查找关联笔记" → Panel 1 高亮关联笔记 → Panel 2 打开

### 流程 3：建立映射
Panel 2 中写 `@ref functionName` → 保存时 C++ 层解析映射 → 自动补全函数名（从 LSP 符号表）→ 映射写入 SQLite

## 边界与限制

- **编辑单向**：代码在外部仓库中编辑，笔记在 Code Note Studio 中编辑，两者不交叉
- **LSP 依赖**：代码跳转和映射同步依赖 LSP Server 正常运行
- **Git 只读**：libgit2 仅用于读取 commit 信息，不做 git 操作
- **单用户**：笔记为本地单用户设计，无多用户协作（可通过 git 间接协作）
- **平台**：初期仅支持 macOS，后续扩展 Windows/Linux

## 非目标（v1 不实现）

- 代码编辑功能（Panel 3 只读）
- 笔记协作/多人编辑
- 云同步
- 插件系统
- 代码仓库内部的文件新建/删除
