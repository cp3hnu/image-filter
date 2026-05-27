const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { applyFiltersStepwise } = require('./matrix');

/**
 * Process a single image file with the given filter options.
 *
 * @param {string} inputPath  - Source image path
 * @param {string} outputPath - Destination image path (may equal inputPath for in-place)
 * @param {object|string} filters - CSS filter string, { steps }, or { invert, sepia, saturate, hueRotate, brightness, contrast }
 */
async function processImage(inputPath, outputPath, filters) {
  const image = sharp(inputPath, { failOn: 'none' });
  const metadata = await image.metadata();
  const format = metadata.format;

  // 1) Normalize the working color space to sRGB.
  //    Honors the input ICC profile (if any) and converts pixels into sRGB
  //    so our matrix math matches CSS `filter` (spec: sRGB).
  // 2) ensureAlpha → 4 channels for the matrix.
  const { data, info } = await image
    .pipelineColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  applyFiltersStepwise(data, filters);

  // Re-encode in the same format, declare sRGB and drop any source ICC profile
  // (we already converted pixels into sRGB, so a stale profile would lie).
  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .toColourspace('srgb')
    .withMetadata({ icc: 'srgb' })
    .toFormat(format)
    .toFile(outputPath);
}

/** True when -o path looks like a file (has extension, not an existing directory). */
function looksLikeOutputFile(outputPath) {
  if (!outputPath) return false;
  if (outputPath.endsWith('/') || outputPath.endsWith(path.sep)) return false;

  const abs = path.resolve(outputPath);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return false;

  return Boolean(path.extname(outputPath));
}

function isExplicitOutputFile(outputPath, entryCount) {
  return entryCount === 1 && looksLikeOutputFile(outputPath);
}

/**
 * Resolve the output path for a file, preserving directory structure.
 *
 * @param {string} inputPath  - Absolute path to the source file
 * @param {object} options
 * @param {string} options.rootDir   - The base directory used to compute relative path
 * @param {string} [options.outputDir] - Output directory, or output file when processing one input
 * @param {string} [options.suffix]    - String to append before the file extension
 *
 * Examples (rootDir = /src/images):
 *   input  /src/images/foo/bar.png
 *   no outputDir  → /src/images/foo/bar.png          (overwrite)
 *   outputDir=/out → /out/foo/bar.png                (structure preserved)
 *   outputDir=b.jpg (single input) → absolute path to b.jpg
 *   suffix=_x     → /src/images/foo/bar_x.png
 *   both          → /out/foo/bar_x.png
 */
function resolveOutputPath(inputPath, { rootDir, outputDir, suffix }) {
  if (outputDir && isExplicitOutputFile(outputDir, 1)) {
    const outPath = path.resolve(outputDir);
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    return outPath;
  }

  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  const outFilename = suffix ? `${base}${suffix}${ext}` : `${base}${ext}`;

  let outDir;
  if (outputDir) {
    // Preserve structure: compute relative path from rootDir, replant under outputDir
    const rel = path.relative(rootDir, path.dirname(inputPath));
    outDir = rel ? path.join(outputDir, rel) : outputDir;
  } else {
    outDir = path.dirname(inputPath);
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  return path.join(outDir, outFilename);
}

module.exports = { processImage, resolveOutputPath, isExplicitOutputFile, looksLikeOutputFile };
