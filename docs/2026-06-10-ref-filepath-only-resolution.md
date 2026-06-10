# @ref(filePath) 仅文件名跳转支持

日期: 2026-06-10

## 问题

`@ref(repo#path/to/file.tsx)` 格式（只有 repo 名和文件路径，没有行号和符号名）无法被解析，在 `resolveRefs` 中静默丢弃，导致无法跳转。

## 修复

**`src/main/services/ref-resolver.ts`** — 在 `resolveRefs` 新增 **T6 降级层级**：

- 当引用仅包含 `filePath`（可选 `repo`），无 `line` 和 `name` 时，解析到文件起始行（`startLine: 1`）
- 文件在符号索引中时，直接使用索引中的绝对路径
- 文件不在索引中，但能通过 `codeRepos` 配置找到仓库路径时，拼接仓库根目录 + 相对路径
- 仓库和文件均未找到时，静默丢弃（与现有行为一致）

更新 `classifyRef` JSDoc 注释，6 个解析层级从 T1 到 T6。

## 测试

**`tests/main/ref-resolver.test.ts`** — 新增 5 个测试用例：

| 测试 | 场景 |
|------|------|
| T6 repo#filePath (索引中有) | 文件存在于符号索引，跳转到第 1 行 |
| T6 repo#filePath (codeRepos 回退) | 文件不在索引中，通过 codeRepos 配置拼接路径 |
| T6 filePath (无 repo) | 仅文件路径引用，跳转到第 1 行 |
| T6 无匹配 | 仓库和文件均未找到，返回空 |
| parseRefs repo#filePath | 验证 `#` 分隔符能正确解析为 `repo` + `filePath` |
