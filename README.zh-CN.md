# image-filter

[English](./README.md) | 简体中文

对图片批量应用与 CSS 一致的 `filter` 滤镜，输出格式与源文件相同。

支持的滤镜：`invert`、`sepia`、`saturate`、`hue-rotate`、`brightness`、`contrast`。

实现基于 [W3C Filter Effects](https://www.w3.org/TR/filter-effects/#feColorMatrixElement) 的 5×4 颜色矩阵，在 sRGB 空间运算，行为与浏览器 CSS 滤镜对齐。

## 安装

```bash
$ npm install -g image-filter
```

或直接运行（无需全局安装）：

```bash
$ npx image-filter photo.png -F 'hue-rotate(90deg)'
```

本地开发：

```bash
$ npm install
$ npm link
```

## 用法

```bash
$ image-filter <input...> [options]
```

`<input...>` 可以是：

- 单个或多个图片文件
- 目录（递归处理其中支持的图片）
- Glob 模式（如 `images/**/*.png`）

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-F, --filter <css>` | 完整 CSS `filter` 字符串，顺序与字符串一致 | — |
| `-o, --output-dir <path>` | 输出目录（保留相对路径结构），或单文件时指定输出文件路径 | 覆盖原文件 |
| `-s, --suffix <string>` | 在扩展名前追加后缀，如 `_filtered` | — |
| `--dry-run` | 只打印将要执行的操作，不写文件 | — |

### 滤镜顺序

**顺序会影响结果**，与浏览器 `filter` 属性相同。

- **`-F` 字符串**：按从左到右依次应用，例如  
  `hue-rotate(346deg) saturate(1142%) brightness(92%)`  
  与  
  `saturate(1142%) hue-rotate(346deg) brightness(92%)`  
  结果不同。

### 支持的格式

`.png`、`.jpg`、`.jpeg`、`.webp`、`.tiff`、`.tif`、`.avif`

## 示例

完整 CSS 滤镜链（Instagram 风格等）：

```bash
$ image-filter photo.png -F 'invert(39%) sepia(74%) saturate(1142%) hue-rotate(346deg) brightness(92%) contrast(106%)'
```

单张图片，色相旋转 90°，饱和度 150%，亮度 80%：

```bash
$ image-filter photo.jpg -F 'hue-rotate(90deg) saturate(150%) brightness(80%)'
```

高饱和 + 色相 + 亮度：

```bash
$ image-filter photo.png -F 'saturate(1142%) hue-rotate(346deg) brightness(92%)'
```

输出到新目录，保留子目录结构：

```bash
$ image-filter ./assets -o ./out -F 'hue-rotate(45deg)'
```

使用后缀，不覆盖原图：

```bash
$ image-filter img/*.png -s _filtered -F 'hue-rotate(180deg)'
```

单文件指定输出路径：

```bash
$ image-filter input.png -o result.png -F 'saturate(120%) brightness(50%)'
```

预览计划（不写入）：

```bash
$ image-filter images/ -o out/ --dry-run -F 'hue-rotate(30deg)'
```

## 测试

矩阵运算正确性测试：

```bash
$ node test.js
```

与真实浏览器（Playwright + Chromium）对照：

```bash
$ npm install --save-dev playwright
$ npx playwright install chromium
$ node compare-playwright.js ./image.jpg 'invert(20%) sepia(60%) hue-rotate(90deg)'
```

脚本会同时生成：

- `compare-pw-<图片名>.png` — 浏览器输出（基准）
- `compare-if-browser-<图片名>.png` — image-filter 输出

并打印像素级差异统计。

## 项目结构

| 文件 | 说明 |
|------|------|
| `index.js` | CLI 入口，参数解析与批量调度 |
| `process.js` | 使用 Sharp 读写像素（sRGB + 预乘 alpha + 步进式 filter） |
| `matrix.js` | CSS 滤镜矩阵与字符串解析、步进式像素变换 |
| `test.js` | 矩阵数学、步进、端到端像素校验 |
| `compare-playwright.js` | 真实浏览器（Chromium）对照工具（可选） |

## 依赖

- [sharp](https://sharp.pixelplumbing.com/) — 图片解码/编码
- [commander](https://github.com/tj/commander.js) — CLI
- [glob](https://github.com/isaacs/node-glob) — 路径匹配

## License

[MIT](LICENSE)
