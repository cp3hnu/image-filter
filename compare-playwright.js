#!/usr/bin/env node
'use strict';

/**
 * Ground-truth comparison: render CSS filter in a real Chromium via Playwright,
 * then compare against image-filter's browser-mode and fast-mode outputs.
 *
 * Usage:
 *   node compare-playwright.js <image-path> "<filter-string>"
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const crypto = require('crypto');
const { chromium } = require('playwright');
const sharp = require('sharp');
const { processImage } = require('./process');

const ROOT = __dirname;

function resolveArgs(argv) {
  const args = argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node compare-playwright.js <image-path> "<filter-string>"');
    process.exit(1);
  }

  return { input: path.resolve(args[0]), filter: args.slice(1).join(' ').trim() };
}

const { input: INPUT, filter: FILTER } = resolveArgs(process.argv);

function sha16(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
}

async function renderInBrowser(filter, outPath) {
  const { width, height } = await sharp(INPUT).metadata();
  const imageUrl = pathToFileURL(INPUT).href;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#000}
  img{display:block;width:${width}px;height:${height}px;filter:${filter}}
</style></head>
<body><img id="t" src="${imageUrl}" width="${width}" height="${height}"/></body></html>`;
  const htmlPath = path.join(ROOT, '_pw-temp.html');
  fs.writeFileSync(htmlPath, html);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width, height } });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(htmlPath).href);
    await page.locator('#t').evaluate(el =>
      el.complete ? null : new Promise(res => (el.onload = res)),
    );

    // Give the compositor a frame to apply CSS filter before capture.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const box = await page.locator('#t').boundingBox();
    if (!box) {
      throw new Error('无法获取截图区域（#t bounding box 为空）');
    }
    await page.screenshot({
      path: outPath,
      type: 'png',
      clip: {
        x: Math.max(0, box.x),
        y: Math.max(0, box.y),
        width: Math.max(1, box.width),
        height: Math.max(1, box.height),
      },
    });
    await ctx.close();
  } finally {
    await browser.close();
    fs.unlinkSync(htmlPath);
  }
}

async function stats(a, b) {
  const ia = await sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ib = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (ia.info.width !== ib.info.width || ia.info.height !== ib.info.height) {
    return { error: `size mismatch ${ia.info.width}x${ia.info.height} vs ${ib.info.width}x${ib.info.height}` };
  }
  const n = ia.info.width * ia.info.height;
  let diffPx = 0, gt1 = 0, gt5 = 0, gt20 = 0, max = 0, sum = 0;
  for (let i = 0; i < ia.data.length; i += 4) {
    let m = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(ia.data[i + c] - ib.data[i + c]);
      if (d > m) m = d;
    }
    if (m) { diffPx++; sum += m; if (m > max) max = m; }
    if (m > 1) gt1++;
    if (m > 5) gt5++;
    if (m > 20) gt20++;
  }
  return {
    diffPx,
    diffPct: ((diffPx / n) * 100).toFixed(2) + '%',
    pctGt1: ((gt1 / n) * 100).toFixed(2) + '%',
    pctGt5: ((gt5 / n) * 100).toFixed(2) + '%',
    pctGt20: ((gt20 / n) * 100).toFixed(2) + '%',
    maxChannelDelta: max,
    meanDelta: (sum / n).toFixed(3),
  };
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`输入图片不存在: ${INPUT}`);
    process.exit(1);
  }
  if (!FILTER) {
    console.error('filter 不能为空');
    process.exit(1);
  }

  const inputDir = path.dirname(INPUT);
  const stem = path.basename(INPUT, path.extname(INPUT));

  console.log(`输入  : ${INPUT}`);
  console.log(`filter: ${FILTER}\n`);

  const pwOut = path.join(inputDir, `compare-pw-${stem}.png`);
  const ifBrowserOut = path.join(inputDir, `compare-if-browser-${stem}.png`);
  const ifFastOut = path.join(inputDir, `compare-if-fast-${stem}.png`);

  console.log('1) Playwright 浏览器渲染中…');
  await renderInBrowser(FILTER, pwOut);
  console.log(`   → ${path.basename(pwOut)}  sha=${sha16(pwOut)}\n`);

  console.log('2) image-filter (browser 模式)…');
  await processImage(INPUT, ifBrowserOut, FILTER, { mode: 'browser' });
  console.log(`   → ${path.basename(ifBrowserOut)}  sha=${sha16(ifBrowserOut)}\n`);

  console.log('3) image-filter (fast 模式)…');
  await processImage(INPUT, ifFastOut, FILTER, { mode: 'fast' });
  console.log(`   → ${path.basename(ifFastOut)}  sha=${sha16(ifFastOut)}\n`);

  console.log('=== 与 Playwright 浏览器的对比 ===\n');
  console.log('-- browser 模式 (步进+预乘+sRGB) --');
  console.log(' ', await stats(pwOut, ifBrowserOut));
  console.log('\n-- fast 模式 (合并矩阵)            --');
  console.log(' ', await stats(pwOut, ifFastOut));
  console.log('\n-- browser vs fast                  --');
  console.log(' ', await stats(ifBrowserOut, ifFastOut));
}

main().catch(e => { console.error(e); process.exit(1); });
