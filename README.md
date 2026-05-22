# image-filter

对图片批量应用与 CSS 一致的 `hue-rotate`、`saturate`、`brightness` 滤镜，输出格式与源文件相同。

实现基于 [W3C Filter Effects](https://www.w3.org/TR/filter-effects/#feColorMatrixElement) 的 5×4 颜色矩阵，在 sRGB 空间运算，行为与浏览器 CSS 滤镜对齐。

## 安装

```bash
$ npm install
```

全局使用（可选）：

```bash
$ npm link
# 或
$ npm install -g .
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
| `-H, --hue-rotate <degrees>` | 色相旋转（度） | `0` |
| `-S, --saturate <amount>` | 饱和度倍数，或 CSS 百分比（如 `50%` → 0.5） | `1` |
| `-B, --brightness <amount>` | 亮度倍数，或百分比 | `1` |
| `-o, --output-dir <path>` | 输出目录（保留相对路径结构），或单文件时指定输出文件路径 | 覆盖原文件 |
| `-s, --suffix <string>` | 在扩展名前追加后缀，如 `_filtered` | — |
| `--dry-run` | 只打印将要执行的操作，不写文件 | — |

### 支持的格式

`.png`、`.jpg`、`.jpeg`、`.webp`、`.tiff`、`.tif`、`.avif`

## 示例

单张图片，色相旋转 90°，饱和度 150%，亮度 80%：

```bash
$ image-filter photo.jpg -H 90 -S 1.5 -B 0.8
```

输出到新目录，保留子目录结构：

```bash
$ image-filter ./assets -o ./out -H 45
```

使用后缀，不覆盖原图：

```bash
$ image-filter img/*.png -s _filtered -H 180
```

单文件指定输出路径：

```bash
$ image-filter input.png -o result.png -S 120% -B 50%
```

预览计划（不写入）：

```bash
$ image-filter images/ -o out/ --dry-run -H 30
```

## 测试

矩阵运算正确性测试：

```bash
$ node test.js
```

## 项目结构

| 文件 | 说明 |
|------|------|
| `index.js` | CLI 入口，参数解析与批量调度 |
| `process.js` | 使用 Sharp 读写像素并应用矩阵 |
| `matrix.js` | CSS 滤镜矩阵构建与像素变换 |
| `test.js` | 矩阵数学与端到端像素校验 |

## 依赖

- [sharp](https://sharp.pixelplumbing.com/) — 图片解码/编码
- [commander](https://github.com/tj/commander.js) — CLI
- [glob](https://github.com/isaacs/node-glob) — 路径匹配

## License

[MIT](LICENSE)
