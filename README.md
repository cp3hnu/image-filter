# image-filter

对图片批量应用与 CSS 一致的 `filter` 滤镜，输出格式与源文件相同。

支持的滤镜：`invert`、`sepia`、`saturate`、`hue-rotate`、`brightness`、`contrast`。

实现基于 [W3C Filter Effects](https://www.w3.org/TR/filter-effects/#feColorMatrixElement) 的 5×4 颜色矩阵，在 sRGB 空间运算，行为与浏览器 CSS 滤镜对齐。

## 安装

```bash
$ npm install -g image-filter
```

或直接运行（无需全局安装）：

```bash
$ npx image-filter photo.png -H 90
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
| `--invert <amount>` | 反色，0–1 或百分比（`39%` → 0.39） | `0` |
| `--sepia <amount>` | 褐色，0–1 或百分比 | `0` |
| `-S, --saturate <amount>` | 饱和度倍数，或百分比（`150%` → 1.5） | `1` |
| `-H, --hue-rotate <degrees>` | 色相旋转（度） | `0` |
| `-B, --brightness <amount>` | 亮度倍数，或百分比 | `1` |
| `--contrast <amount>` | 对比度倍数，或百分比 | `1` |
| `-o, --output-dir <path>` | 输出目录（保留相对路径结构），或单文件时指定输出文件路径 | 覆盖原文件 |
| `-s, --suffix <string>` | 在扩展名前追加后缀，如 `_filtered` | — |
| `--fast` | 使用合并矩阵（快，但与浏览器差异略大） | 关 |
| `--dry-run` | 只打印将要执行的操作，不写文件 | — |

使用 `-F` 时，不要与单独的滤镜参数混用（以 `-F` 为准）。

### 渲染模式

- **`browser`（默认）**：与 Chrome/Skia 行为对齐
  - 每个滤镜单独一步，步与步之间裁切到 `[0, 1]`（模拟 8 位中间缓冲）
  - 在**预乘 alpha**的 sRGB 上运算（W3C 规范）
  - Sharp 管线先转 sRGB，输出去掉源 ICC 配置，避免色彩配置漂移
- **`--fast`**：把所有滤镜乘成单个 5×4 矩阵，一次性应用
  - 在非预乘 sRGB 上运算
  - 对纯不透明图、单一/温和滤镜，与 `browser` 模式结果非常接近
  - 速度更快，多次链式滤镜下与浏览器差异会变大

### 滤镜顺序

**顺序会影响结果**，与浏览器 `filter` 属性相同。

- **`-F` 字符串**：按从左到右依次应用，例如  
  `hue-rotate(346deg) saturate(1142%) brightness(92%)`  
  与  
  `saturate(1142%) hue-rotate(346deg) brightness(92%)`  
  结果不同。

- **单独参数**（未使用 `-F`）：固定顺序，与命令行书写顺序无关：  
  `invert` → `sepia` → `saturate` → `hue-rotate` → `brightness` → `contrast`  
  仅应用非默认值的项。

### 支持的格式

`.png`、`.jpg`、`.jpeg`、`.webp`、`.tiff`、`.tif`、`.avif`

## 示例

完整 CSS 滤镜链（Instagram 风格等）：

```bash
$ image-filter photo.png -F 'invert(39%) sepia(74%) saturate(1142%) hue-rotate(346deg) brightness(92%) contrast(106%)'
```

单张图片，色相旋转 90°，饱和度 150%，亮度 80%：

```bash
$ image-filter photo.jpg -H 90 -S 1.5 -B 0.8
```

高饱和 + 色相 + 亮度

```bash
$ image-filter photo.png -S 1142% -H 346 -B 92%
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

与真实浏览器（Playwright + Chromium）对照：

```bash
$ npm install --save-dev playwright
$ npx playwright install chromium
$ node compare-playwright.js ./image.jpg 'invert(20%) sepia(60%) hue-rotate(90deg)'
```

脚本会同时生成：
- `compare-pw-<图片名>.png` — 浏览器输出（基准）
- `compare-if-browser-<图片名>.png` — image-filter 默认模式
- `compare-if-fast-<图片名>.png` — `--fast` 合并矩阵模式

并打印像素级差异统计。

## 项目结构

| 文件 | 说明 |
|------|------|
| `index.js` | CLI 入口，参数解析与批量调度 |
| `process.js` | 使用 Sharp 读写像素，sRGB 管线 |
| `matrix.js` | CSS 滤镜矩阵、字符串解析、合并/步进两种应用方式 |
| `test.js` | 矩阵数学、步进、端到端像素校验 |
| `compare-playwright.js` | 真实浏览器（Chromium）对照工具（可选） |

## 依赖

- [sharp](https://sharp.pixelplumbing.com/) — 图片解码/编码
- [commander](https://github.com/tj/commander.js) — CLI
- [glob](https://github.com/isaacs/node-glob) — 路径匹配

## License

[MIT](LICENSE)
