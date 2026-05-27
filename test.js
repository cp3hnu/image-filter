#!/usr/bin/env node
/**
 * Correctness test: verify that the matrix math matches manually computed
 * expected values for known pixel inputs.
 */

const {
  buildCombinedMatrix,
  applyMatrixToPixels,
  applyFiltersStepwise,
  parseFilterString,
} = require('./matrix');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function approx(a, b, tol = 2) {
  return Math.abs(a - b) <= tol;
}

function assert(label, got, expected) {
  const ok = got.every((v, i) => approx(v, expected[i]));
  if (ok) {
    console.log(`  ✔  ${label}`);
    passed++;
  } else {
    console.error(`  ✖  ${label}`);
    console.error(`       got:      [${got.join(', ')}]`);
    console.error(`       expected: [${expected.join(', ')}]`);
    failed++;
  }
}

// --- Unit: brightness only ---
{
  const m = buildCombinedMatrix({ brightness: 0.5 });
  const buf = Buffer.from([200, 100, 50, 255]);
  applyMatrixToPixels(buf, m);
  assert('brightness(0.5) on [200,100,50,255]', [...buf], [100, 50, 25, 255]);
}

// --- Unit: saturate(0) → grayscale ---
{
  const m = buildCombinedMatrix({ saturate: 0 });
  const buf = Buffer.from([255, 0, 0, 255]); // pure red
  applyMatrixToPixels(buf, m);
  // luminance of red: 0.213*255 ≈ 54
  const lum = Math.round(0.213 * 255);
  assert('saturate(0) on pure red → grayscale', [...buf], [lum, lum, lum, 255]);
}

// --- Unit: saturate(1) → identity ---
{
  const m = buildCombinedMatrix({ saturate: 1 });
  const buf = Buffer.from([123, 200, 45, 180]);
  const orig = [...buf];
  applyMatrixToPixels(buf, m);
  assert('saturate(1) is identity', [...buf], orig);
}

// --- Unit: hue-rotate(0) → identity ---
{
  const m = buildCombinedMatrix({ hueRotate: 0 });
  const buf = Buffer.from([100, 150, 200, 255]);
  const orig = [...buf];
  applyMatrixToPixels(buf, m);
  assert('hue-rotate(0) is identity', [...buf], orig);
}

// --- Unit: hue-rotate(360) → identity ---
{
  const m = buildCombinedMatrix({ hueRotate: 360 });
  const buf = Buffer.from([100, 150, 200, 255]);
  const orig = [...buf];
  applyMatrixToPixels(buf, m);
  assert('hue-rotate(360) is identity', [...buf], orig);
}

// --- Unit: full CSS filter string (order: invert → sepia → saturate → hue-rotate → brightness → contrast) ---
{
  const css =
    'invert(39%) sepia(74%) saturate(1142%) hue-rotate(346deg) brightness(92%) contrast(106%)';
  const { steps } = parseFilterString(css);
  assert('parseFilterString preserves 6 steps', [steps.length], [6]);

  const m = buildCombinedMatrix({ steps });
  const buf = Buffer.from([180, 90, 40, 255]);
  applyMatrixToPixels(buf, m);

  const mWrongOrder = buildCombinedMatrix({
    steps: [...steps].reverse(),
  });
  const buf2 = Buffer.from([180, 90, 40, 255]);
  applyMatrixToPixels(buf2, mWrongOrder);
  const orderMatters = buf.some((v, i) => !approx(v, buf2[i], 0));
  if (orderMatters) {
    console.log('  ✔  filter order changes result (order matters)');
    passed++;
  } else {
    console.error('  ✖  filter order should change result');
    failed++;
  }
}

// --- Unit: stepwise identity filters ---
{
  const buf = Buffer.from([180, 90, 40, 255]);
  const orig = [...buf];
  applyFiltersStepwise(buf, { saturate: 1, hueRotate: 0, brightness: 1 });
  assert('stepwise identity on opaque pixel', [...buf], orig);
}

// --- Unit: stepwise brightness(0.5) on opaque ---
{
  const buf = Buffer.from([200, 100, 50, 255]);
  applyFiltersStepwise(buf, { brightness: 0.5 });
  assert('stepwise brightness(0.5) on opaque', [...buf], [100, 50, 25, 255]);
}

// --- Unit: stepwise vs combined match for in-range, opaque pixel (single filter) ---
{
  const buf1 = Buffer.from([180, 90, 40, 255]);
  const buf2 = Buffer.from([180, 90, 40, 255]);
  applyFiltersStepwise(buf1, { saturate: 0.5 });
  applyMatrixToPixels(buf2, buildCombinedMatrix({ saturate: 0.5 }));
  assert('stepwise == combined for single in-range filter', [...buf1], [...buf2]);
}

// --- Unit: stepwise preserves alpha edge (transparent pixel stays transparent) ---
{
  const buf = Buffer.from([200, 100, 50, 0]);
  applyFiltersStepwise(buf, { brightness: 2, saturate: 5 });
  assert('stepwise: alpha=0 stays alpha=0', [buf[3]], [0]);
}

// --- Integration: file round-trip (default stepwise mode) ---
async function testFileRoundtrip() {
  const tmpIn = path.join(__dirname, '_test_in_b.png');
  const tmpOut = path.join(__dirname, '_test_out_b.png');

  await sharp({
    create: { width: 2, height: 2, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 1 } },
  }).png().toFile(tmpIn);

  const { processImage } = require('./process');
  await processImage(tmpIn, tmpOut, { hueRotate: 135, saturate: 1.32, brightness: 0.96 });

  const { data } = await sharp(tmpOut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const ref = Buffer.from([200, 100, 50, 255]);
  applyFiltersStepwise(ref, { hueRotate: 135, saturate: 1.32, brightness: 0.96 });

  assert(
    'default-mode round-trip: hue-rotate(135) saturate(1.32) brightness(0.96)',
    [data[0], data[1], data[2], data[3]],
    [ref[0], ref[1], ref[2], ref[3]],
  );

  fs.unlinkSync(tmpIn);
  fs.unlinkSync(tmpOut);
}

testFileRoundtrip()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed.\n`);
    if (failed > 0) process.exit(1);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
