# 行内公式含 `<` `>` `&` 符号渲染失败修复

## 问题

`$c \cdot \Delta t < 1/\sqrt{2}$` 这类含 `<` 符号的行内公式无法渲染，显示为 KaTeX 解析错误。

## 根因

`renderMarkdown()` 的处理顺序：

1. HTML 实体转义（`<` → `&lt;`、`>` → `&gt;`、`&` → `&amp;`）
2. 正则提取 `$...$` 公式内容
3. KaTeX 渲染公式

HTML 转义在先，公式中的 `<` 被转成了 `&lt;`，再传给 KaTeX 时，KaTeX 将 `&` 视为 HTML 实体起始符，解析失败：

```
KaTeX parse error: Expected 'EOF', got '&' at position 18: …c \cdot \Delta t &lt; 1/\sqrt{2}
```

## 修复

`src/renderer/src/services/markdown-renderer.ts` — 新增 `decodeHtmlEntities()` 函数，在公式传给 KaTeX 之前还原 `&lt;` → `<`、`&gt;` → `>`、`&amp;` → `&`，确保 KaTeX 收到原始 LaTeX 源码。
