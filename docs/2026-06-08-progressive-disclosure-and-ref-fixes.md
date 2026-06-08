# 渐进式披露与 @ref 跳转修复

> 2026-06-08

## 1. 渐进式披露 — Skill 工具按需加载

**问题**：系统提示词中硬编码了所有工具的详细描述和推导规则（约 30 行），导致每次对话的初始上下文很大。

**修复**：

| 文件 | 改动 |
|------|------|
| `agent/context.py` | 新增 `_parse_frontmatter()` / `load_skills_summary()` / `load_full_skill()` 函数；`build_system_message()` 改为接受动态 `tools_summary` 参数 |
| `agent/tools/registry.py` | `ToolRegistry.register()` 新增 `skill` 参数 |
| `agent/tools/*.py` | 所有工具注册添加 `skill=` 字段（19 个工具 → 5 个 skill） |
| `agent/agent_loop.py` | 新增 `_activate_skills()`：首次使用某 skill 工具后，注入完整 SKILL.md 到对话记忆 |

**效果**：
- 初始系统提示词只含工具名 + 简短描述
- 当 LLM 首次调用某个 skill 的工具时，完整 SKILL.md 自动注入
- 每个 skill 每个对话周期最多注入一次

## 2. 推导树规则迁移到 SKILL.md

**问题**：系统提示词中推导树的详细规则（自顶向下分解、兄弟节点、标题与内容分离、递归停止条件、多文件隔离）在改为渐进式披露后丢失。

**修复**：在 `skills/derive-tree/SKILL.md` 中新增 `## Derivation Rules` 章节，包含全部 5 条规则和完整示例。

## 3. 网络图 list_preset_layers 补充

**问题**：`skills/network-graph/SKILL.md` 的脚本表格缺少 `list_preset_layers.py`。

**修复**：在脚本表格中添加该条目，标注调用 `add_layer` 前应先调用它。

## 4. Agent 对话框 UI 调整

**问题**：Clear 和缩小按钮位置不合理；缩小后窗口变成 40px 的窄条，表现奇怪。

**修复**：
- `AgentDialog.tsx` — 对调 Clear ↔ 缩小按钮顺序
- `AgentDialog.css` — `.minimized` 改为 `height: auto`，自然收缩到 header 高度，不再突兀

## 5. Agent 文档输出路径优化

**问题**：系统提示词中写着 `Output directory: {workspace}/docs`，示例中有 `docs/xxx`，导致 agent 把所有文件往 `docs/` 根目录写。

**修复**：
- 默认 `output_dir` 改为 workspace 根目录
- 提示词改为要求 agent 按话题创建子目录（如 `lighting/`, `resnet/`）
- 去掉所有示例中的 `docs/` 前缀

## 6. @ref 允许重复引用

**问题**：`insert_ref.py` 检测到已存在的引用就拒绝，报 `Reference already exists`。

**修复**：`skills/markdown/scripts/insert_ref.py` 去掉去重检查。

## 7. @ref 无符号匹配时仍可跳转

**问题**：`resolveRefs` 只在符号索引中找到匹配的符号时才返回 CodeMapping。如果文件在索引中但该行没有符号（如头文件、注释行），引用被静默丢弃，点击无效。

**修复**：`src/main/services/ref-resolver.ts`

| 层级 | 原逻辑 | 新逻辑 |
|------|--------|--------|
| T2 (file+line) | 无匹配符号 → 丢弃 | **Fallback A**：文件在索引中 → 用符号的文件路径 + 指定行号生成映射 |
| | | **Fallback B**：文件不在索引中 → 从 repo 根路径拼接绝对路径 |
| T3 (file+name) | 无匹配符号 → 丢弃 | Fallback：导航到文件开头 |

## 8. @ref 在 md 预览中显示为纯文本

**问题**：前端 `markdown-renderer.ts` 匹配 `@ref()` 的正则 `[a-zA-Z0-9._/\-:]` 不包含 `#`，导致 `@ref(Nilou-main#file.h#10)` 无法被识别，始终显示为原始文本。

**修复**：
- `src/renderer/src/services/markdown-renderer.ts` — 正则加 `#`
- `src/renderer/src/services/monaco-completion.ts` — 自动补全触发正则加 `#`
