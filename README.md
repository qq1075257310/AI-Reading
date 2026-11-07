<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1MhRqWx0VbzV1ZAlLyFxD_R5jVI5DJhih

## 阅读与导入

- 支持 TXT（UTF-8、GBK/GB18030）及无 DRM 的 EPUB 2/3（最大 50 MB）。
- EPUB 按阅读顺序导入章节，使用书内目录标题，显示封面和正文中的内嵌图片（含 SVG 包裹的封面）。
- 图片按比例适配屏幕；朗读只读取正文，自动跳过纯插图章节。
- 文件在浏览器中本地解析，不上传书籍。不会加载书内脚本、外部图片或出版方样式；复杂排版、固定版式和数学公式不保证原样呈现。
- 阅读页右上角的上传按钮可以更换书籍。
- 首页和阅读页都支持直接拖入一个 TXT 或 EPUB 文件，导入后自动保存到本地书架。
- 本地书架使用 IndexedDB 保存原始 TXT/EPUB 文件及阅读进度，刷新后可重新打开；EPUB 插图会从原文件重新提取。兼容旧线上版 `zenreader-bookshelf` 中的 TXT 记录，不清空旧数据库。
- 阅读页可返回书架；只有点击书籍的删除按钮并确认才会主动删除记录。浏览器清理网站数据、无痕模式或存储空间不足仍可能影响本地保存，原文件请另行保留。

检查：`npm test`、`npm run typecheck`、`npm run build`。

## 本地启动

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`
