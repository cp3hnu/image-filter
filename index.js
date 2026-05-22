#!/usr/bin/env node

'use strict';

const { program } = require('commander');
const { glob } = require('glob');
const path = require('path');
const fs = require('fs');
const { processImage, resolveOutputPath, isExplicitOutputFile, looksLikeOutputFile } = require('./process');

const SUPPORTED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.tif', '.avif']);

/**
 * Collect all image files from a list of inputs (files, directories, or globs).
 * Returns [{ file, rootDir }] where rootDir is used to reconstruct relative paths.
 */
async function collectInputs(inputs) {
  const results = [];

  for (const input of inputs) {
    const absInput = path.resolve(input);

    // Directory: recurse and use the directory itself as rootDir
    if (fs.existsSync(absInput) && fs.statSync(absInput).isDirectory()) {
      const files = await glob('**/*', { cwd: absInput, nodir: true, absolute: true });
      for (const file of files) {
        if (SUPPORTED_EXTS.has(path.extname(file).toLowerCase())) {
          results.push({ file, rootDir: absInput });
        }
      }
      continue;
    }

    // Glob pattern: rootDir is the non-magic prefix of the pattern
    const files = await glob(input, { nodir: true, absolute: true });
    if (files.length > 0) {
      // Derive rootDir as the longest common directory prefix of all matched files
      const rootDir = commonDirPrefix(files);
      for (const file of files) {
        if (SUPPORTED_EXTS.has(path.extname(file).toLowerCase())) {
          results.push({ file, rootDir });
        }
      }
      continue;
    }

    // Literal file path
    if (fs.existsSync(absInput)) {
      results.push({ file: absInput, rootDir: path.dirname(absInput) });
      continue;
    }

    console.error(`✖  No files matched: ${input}`);
  }

  return results;
}

/** Longest common directory prefix across a list of absolute file paths. */
function commonDirPrefix(files) {
  if (files.length === 1) return path.dirname(files[0]);
  const parts = files.map(f => path.dirname(f).split(path.sep));
  const first = parts[0];
  let len = first.length;
  for (let i = 1; i < parts.length; i++) {
    let j = 0;
    while (j < len && j < parts[i].length && first[j] === parts[i][j]) j++;
    len = j;
  }
  return first.slice(0, len).join(path.sep) || path.sep;
}

/** Short path for logs: relative to cwd when possible. */
function displayPath(filePath) {
  const rel = path.relative(process.cwd(), path.resolve(filePath));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return rel;
  return filePath;
}

/** Parse saturate/brightness: number multiplier or CSS-style percentage (50% → 0.5). */
function parseAmount(value) {
  const s = String(value).trim();
  if (s.endsWith('%')) {
    const n = parseFloat(s.slice(0, -1));
    if (Number.isNaN(n)) throw new Error(`invalid amount: ${value}`);
    return n / 100;
  }
  const n = parseFloat(s);
  if (Number.isNaN(n)) throw new Error(`invalid amount: ${value}`);
  return n;
}

program
  .name('image-filter')
  .description('Apply CSS-spec hue-rotate / saturate / brightness filters to images')
  .argument('<input...>', 'Image file(s), director(ies), or glob patterns')
  .option('-H, --hue-rotate <degrees>', 'Hue rotation in degrees (default: 0)', parseFloat, 0)
  .option('-S, --saturate <amount>', 'Saturation multiplier or % (default: 1)', parseAmount, 1)
  .option('-B, --brightness <amount>', 'Brightness multiplier or % (default: 1)', parseAmount, 1)
  .option('-o, --output-dir <path>', 'Output directory (structure preserved), or output file for a single input')
  .option('-s, --suffix <string>', 'Append suffix before extension, e.g. "_filtered"')
  .option('--dry-run', 'Print what would be done without processing')
  .action(async (inputs, opts) => {
    const entries = await collectInputs(inputs);

    if (entries.length === 0) {
      console.error(`✖  No supported image files found (supported: ${[...SUPPORTED_EXTS].join(', ')})`);
      process.exit(1);
    }

    if (opts.outputDir && entries.length > 1 && looksLikeOutputFile(opts.outputDir)) {
      console.error('✖  Output file path (-o with extension) requires exactly one input image');
      process.exit(1);
    }

    const filters = {
      hueRotate: opts.hueRotate,
      saturate: opts.saturate,
      brightness: opts.brightness,
    };

    console.log(`\nimage-filter  ·  ${entries.length} file(s)`);
    console.log(`  hue-rotate : ${filters.hueRotate}°`);
    console.log(`  saturate   : ${filters.saturate}`);
    console.log(`  brightness : ${filters.brightness}`);
    if (opts.outputDir) {
      const label = isExplicitOutputFile(opts.outputDir, entries.length) ? 'output' : 'output-dir';
      console.log(`  ${label.padEnd(11)}: ${opts.outputDir}`);
    }
    if (opts.suffix) console.log(`  suffix     : ${opts.suffix}`);
    console.log('');

    let ok = 0;
    let fail = 0;

    const total = entries.length;

    for (let i = 0; i < entries.length; i++) {
      const { file, rootDir } = entries[i];
      const progress = `[${i + 1}/${total}]`;
      const outPath = resolveOutputPath(file, {
        rootDir,
        outputDir: opts.outputDir,
        suffix: opts.suffix,
      });

      if (opts.dryRun) {
        const arrow = file === outPath ? '(overwritten)' : `→  ${displayPath(outPath)}`;
        console.log(`${progress} [DRY]  ${displayPath(file)}  ${arrow}`);
        continue;
      }

      try {
        await processImage(file, outPath, filters);
        const arrow = file === outPath ? '(overwritten)' : `→  ${displayPath(outPath)}`;
        console.log(`${progress} [OK]  ${displayPath(file)}  ${arrow}`);
        ok++;
      } catch (err) {
        console.error(`${progress} [FAIL]  ${displayPath(file)}  —  ${err.message}`);
        fail++;
      }
    }

    if (!opts.dryRun) {
      console.log(`\nDone: ${ok} succeeded, ${fail} failed.\n`);
      if (fail > 0) process.exit(1);
    }
  });

program.parse();
