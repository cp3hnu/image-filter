# images-filter

English | [简体中文](./README.zh-CN.md)

Apply CSS-compatible `filter` effects to images in batch. Output format matches the source file.

Supported filters: `invert`, `sepia`, `saturate`, `hue-rotate`, `brightness`, `contrast`.

Implementation follows the [W3C Filter Effects](https://www.w3.org/TR/filter-effects/#feColorMatrixElement) 5×4 color matrix in sRGB space, aligned with browser CSS filter behavior.

## Install

```bash
$ npm install -g images-filter
```

Or run without a global install:

```bash
$ npx images-filter photo.png -F 'hue-rotate(90deg)'
```

Local development:

```bash
$ npm install
$ npm link
```

## Usage

```bash
$ images-filter <input...> [options]
```

`<input...>` can be:

- One or more image files
- A directory (recursively processes supported images inside)
- Glob patterns (e.g. `images/**/*.png`)

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-F, --filter <css>` | Full CSS `filter` string; filters apply in string order | — |
| `-o, --output-dir <path>` | Output directory (preserves relative paths), or output file path for a single input | Overwrite source |
| `-s, --suffix <string>` | Append suffix before extension, e.g. `_filtered` | — |
| `--dry-run` | Print planned operations without writing files | — |

### Filter order

**Order matters**, same as the browser `filter` property.

- **`-F` string**: Applied left to right. For example,  
  `hue-rotate(346deg) saturate(1142%) brightness(92%)`  
  differs from  
  `saturate(1142%) hue-rotate(346deg) brightness(92%)`.

### Supported formats

`.png`, `.jpg`, `.jpeg`, `.webp`, `.tiff`, `.tif`, `.avif`

## Examples

Full CSS filter chain (Instagram-style presets):

```bash
$ images-filter photo.png -F 'invert(39%) sepia(74%) saturate(1142%) hue-rotate(346deg) brightness(92%) contrast(106%)'
```

Single image: 90° hue rotate, 150% saturation, 80% brightness:

```bash
$ images-filter photo.jpg -F 'hue-rotate(90deg) saturate(150%) brightness(80%)'
```

High saturation + hue + brightness:

```bash
$ images-filter photo.png -F 'saturate(1142%) hue-rotate(346deg) brightness(92%)'
```

Output to a new directory, preserving subdirectory structure:

```bash
$ images-filter ./assets -o ./out -F 'hue-rotate(45deg)'
```

Use a suffix instead of overwriting originals:

```bash
$ images-filter img/*.png -s _filtered -F 'hue-rotate(180deg)'
```

Single file with explicit output path:

```bash
$ images-filter input.png -o result.png -F 'saturate(120%) brightness(50%)'
```

Preview plan (no writes):

```bash
$ images-filter images/ -o out/ --dry-run -F 'hue-rotate(30deg)'
```

## Testing

Matrix correctness:

```bash
$ node test.js
```

Compare against a real browser (Playwright + Chromium):

```bash
$ npm install --save-dev playwright
$ npx playwright install chromium
$ node compare-playwright.js ./image.jpg 'invert(20%) sepia(60%) hue-rotate(90deg)'
```

The script produces:

- `compare-pw-<name>.png` — browser output (reference)
- `compare-if-browser-<name>.png` — images-filter output

It also prints per-pixel difference statistics.

## Project structure

| File | Description |
|------|-------------|
| `index.js` | CLI entry, argument parsing, batch scheduling |
| `process.js` | Sharp read/write (sRGB + premultiplied alpha + stepped filters) |
| `matrix.js` | CSS filter matrices, string parsing, per-pixel transforms |
| `test.js` | Matrix math, stepping, end-to-end pixel checks |
| `compare-playwright.js` | Chromium comparison tool (optional) |

## Dependencies

- [sharp](https://sharp.pixelplumbing.com/) — image decode/encode
- [commander](https://github.com/tj/commander.js) — CLI
- [glob](https://github.com/isaacs/node-glob) — path matching

## License

[MIT](LICENSE)
