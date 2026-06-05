# Reference Skills Design

## Problem

当 Agent 调用 skill 修改文件时，很少主动创建以下引用：
- .md 文件中：`![[path/to/file]]` 嵌入引用 和 `@ref(repo#file#line#name)` 代码引用
- 其他文档（.mind.json / .derive.json / .net.json）：节点上的 `codeMapping`

原因是缺少专门的 skill 脚本和 Agent 工具来创建这些引用。

## Design

### Skill 1: markdown 扩展（在现有 skills/markdown/ 下新增 4 个脚本）

| 脚本 | 职责 |
|------|------|
| `insert_embed.py` | 向 .md 文件追加 `![[embed_path]]` 行，重复跳过 |
| `delete_embed.py` | 删除 .md 文件中指定 `![[embed_path]]` 行 |
| `insert_ref.py` | 向 .md 文件追加 `@ref(...)` 行，重复跳过 |
| `delete_ref.py` | 删除 .md 文件中指定 `@ref(...)` 行 |

### Skill 2: code-mapping（新建独立 skill）

```
skills/code-mapping/
├── SKILL.md
├── scripts/
│   ├── set_code_mapping.py     # 对任意文档的节点设置 codeMapping
│   └── delete_code_mapping.py  # 删除节点的 codeMapping
└── tests/
```

**set_code_mapping.py** — 参数：path（文档路径）、node_id、--raw、--function-name、--file-path、--start-line、--end-line。支持 .mind.json / .derive.json / .net.json，根据扩展名自动识别结构。

**delete_code_mapping.py** — 参数：path、node_id。删除指定节点的 codeMapping。

### Agent 工具注册

| 工具 | 注册位置 |
|------|----------|
| insert_embed / delete_embed / insert_ref / delete_ref | markdown_tools.py |
| set_code_mapping / delete_code_mapping | 新文件 code_mapping_tools.py |

### 同步调整

给 add_node / add_step / add_layer / add_block 的 Agent 工具描述中增加提示，引导 Agent 在创建节点后调用 set_code_mapping。

## Open Questions

- embed 和 @ref 的 agent 工具描述中要包含哪些已知 note 文件的提示信息
