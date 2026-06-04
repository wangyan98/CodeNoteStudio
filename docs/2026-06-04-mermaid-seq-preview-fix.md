# Mermaid 序列图编辑预览不可见修复

## 问题

打开 `.seq.mermaid` 文件时，分割面板的下半部分预览区域只显示深蓝紫色背景（`#1e1e2e`），mermaid 渲染的 SVG 图不可见。下拉滚动后才能看到图。

## 根因

`.seq-editor-preview` 使用了 `display: flex; justify-content: center;` 布局：

- mermaid 序列图 SVG 通常很高，flex 居中导致图的上半部分被推到可视区域之外
- 初始滚动位置在顶部，用户只能看到 SVG 上方空白的背景色
- 需要手动下拉滚动才能看到图表内容

## 修复

**`SequenceEditor.css`** — 从 `.seq-editor-preview` 移除 `display: flex` 和 `justify-content: center`，让内容自然从左上角开始渲染：

```diff
 .seq-editor-preview {
   flex: 1;
   min-height: 100px;
   overflow: auto;
-  display: flex;
-  justify-content: center;
   padding: 16px;
   background: #1e1e2e;
 }
```

**`SequenceEditor.tsx`** — 防御性修复：`handleChange` 中对 `undefined` 值做保护，避免 Monaco Editor 初始化时意外清空内容：

```diff
 const handleChange = useCallback((val: string | undefined) => {
-  setValue(val || '')
+  if (val !== undefined) {
+    setValue(val)
+  }
 }, [])
```
