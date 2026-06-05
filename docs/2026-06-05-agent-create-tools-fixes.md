# Agent Create Tools 修复总结

## 1. 大模型起名后缀错误

LLM 调用 `create_*` 工具时偶尔会起错文件后缀。

**修复**: `path` 参数改为 `name`，LLM 只起名不写后缀。CLI 脚本负责剥离错误后缀、拼接正确后缀、返回完整路径。

- `create_network` → 拼接 `.net.json`
- `create_md` → 拼接 `.md`
- `create_derive` → 拼接 `.derive.json`
- `create_mindmap` → 拼接 `.mind.json`

涉及文件:
- `skills/*/scripts/create_*.py`
- `agent/tools/*_tools.py`
- 所有相关测试文件

## 2. 文件创建在错误目录

创建的文件路径是相对路径（如 `hello.md`），实际落在 agent 进程的 CWD 下，用户找不到。

**修复**: CLI 脚本统一 `os.path.abspath()` 返回绝对路径。

## 3. 空目录名崩溃

当 name 不带路径前缀（如 `hello`）时，`os.path.dirname("hello.md")` 返回 `""`，`os.makedirs("")` 崩溃。

**修复**: `file_utils.ensure_dir` 加 `if dir_path:` 保护。

## 4. 未知后缀无法剥离

原 `KNOWN_EXTS` 列表有限，LLM 给了不在列表里的后缀（如 `.json`），导致文件变成 `test.json.md`。

**修复**: `os.path.splitext()` 兜底——先匹配复合后缀（`.net.json` 等），匹配不到就用 `splitext` 剥离任意后缀。

## 5. Workspace 传错

前端 `AgentDialog` 错误地传了 `codeRepoPath` 作为 `workspace`，导致文件创建在代码仓库目录下。

**修复**: `workspace` 改回 `state.workspacePath`（用户打开的工作目录）。

## 6. 双层 docs 目录

LLM 按 workspace 相对路径传 `name: "docs/hello"`，agent_loop 又拼了 `output_dir`（=`workspace/docs`），结果变成 `workspace/docs/docs/hello.md`。

**修复**: agent_loop 改为 `os.path.join(workspace, name)`，不再拼接 `output_dir`。

## 7. Derive 文件隔离

不相关的公式被堆在同一个 `.derive.json` 里。

**修复**: system prompt 明确——`add_step` 不加 `derives_from` 时必须先 `create_derive` 创建新文件。只有共享推导链的步骤才属于同一文件。

## 8. Markdown 分阶段生成

Agent 一次生成最终总结 md，缺乏中间分析过程。

**修复**: system prompt 要求先为每个子主题创建中间 md 文件，最后才汇总生成最终总结。

## 9. 写入文件时缺少后缀导致失败

LLM 调用 `append_section`、`add_step`、`add_node` 等写入工具时，偶尔传不带后缀的 `path`（如 `docs/fft_ocean_math`），导致找不到文件。

**修复**: 新增 `file_utils.resolve_path(path, *extensions)` 共享函数——先检查精确路径，不存在则依次尝试拼接扩展名。所有 15 个写入脚本统一调用：

| 文件类型 | 扩展名 | 脚本 |
|---------|--------|------|
| Markdown | `.md` | `append_section`, `replace_section` |
| Mind Map | `.mind.json` | `add_node`, `update_node`, `delete_node` |
| Derive Tree | `.derive.json` | `add_step`, `update_step`, `delete_step`, `set_derives_from` |
| Network | `.net.json` | `add_layer`, `add_block`, `add_connection`, `update_node`, `delete_node` |
| Seq Diagram | `.seq.mermaid` | `append_participant`, `append_message`, `replace_diagram` |

## 10. create_seq 未统一

`create_seq` 还沿用旧的 `path` 参数（需要带 `.seq.mermaid` 后缀），与其他 `create_*` 工具不一致。

**修复**: 改为接受 `name`（无后缀），自动拼接 `.seq.mermaid`，返回绝对路径。与 `create_md`、`create_network` 等保持一致。
