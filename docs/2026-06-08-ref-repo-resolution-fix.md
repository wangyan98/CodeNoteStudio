# @ref 跨仓库解析修复

## 问题

`@ref(HPWater#file#42#symbol)` 带有仓库前缀时，文件路径被错误解析到其他仓库（Nilou-main），而不是指定的 HPWater 仓库。

```
@ref(HPWater#Core_Source_Preview/.../HPWaterWaveEquation.compute#42#UpdateWaveEquation)

// 错误路径:
/Engine/Nilou-main/Core_Source_Preview/.../HPWaterWaveEquation.compute

// 正确路径:
/Engine/HPWater/Core_Source_Preview/.../HPWaterWaveEquation.compute
```

## 根因

`src/main/services/ref-resolver.ts` 中的 `getRepoPath()` 函数：

1. 解析 `@ref` 时正确提取了 `repo: 'HPWater'`
2. 在符号索引中搜索 HPWater 的符号时找不到（因为 HPWater 仓库未被索引）
3. **回退到第一个有 `repoPath` 的符号**（即 Nilou-main 的符号），构造了错误的路径

## 修复

1. **`ref-resolver.ts`** — `getRepoPath()` 新增 `codeRepos` 参数。当目标仓库在符号索引中找不到时，通过 notebook 配置中的 `codeRepos`（按 basename 匹配）查找仓库路径。找不到则返回 `undefined`，不再回退到无关仓库。

2. **`ipc-handlers.ts`** — 加载 notebook 配置，将 `config.codeRepos` 传给 `resolveRefs`。

3. **`live-server.ts`** — 同上。

4. **`ref-resolver.test.ts`** — 新增 3 个测试：仓库匹配成功、无 codeRepos 时不回退到错误仓库、通过 codeRepos 配置解析路径。修复了 15 个遗漏 `await` 的异步测试。

## 解析优先级

1. 符号索引中目标仓库的符号
2. 全局符号索引中的目标仓库
3. notebook 配置 `codeRepos`（按 `path.basename` 匹配仓库名）
4. 无目标仓库时 → 第一个有 `repoPath` 的符号 → `activeRepo`
