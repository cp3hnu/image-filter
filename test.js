#!/usr/bin/env node
/**
 * Correctness test: verify that the matrix math matches manually computed
 * expected values for known pixel inputs.
 */

const { buildCombinedMatrix, applyMatrixToPixels, parseFilterString } = require('./matrix');
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

// --- Integration: file round-trip ---
async function testFileRoundtrip() {
  const tmpIn = path.join(__dirname, '_test_in.png');
  const tmpOut = path.join(__dirname, '_test_out.png');

  // Create a 2x2 test image with known colors
  await sharp({
    create: { width: 2, height: 2, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 1 } },
  }).png().toFile(tmpIn);

  const { processImage } = require('./process');
  await processImage(tmpIn, tmpOut, { hueRotate: 135, saturate: 1.32, brightness: 0.96 });

  const { data } = await sharp(tmpOut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  // Manually compute expected: apply our matrix to [200,100,50,255]
  const m = buildCombinedMatrix({ hueRotate: 135, saturate: 1.32, brightness: 0.96 });
  const ref = Buffer.from([200, 100, 50, 255]);
  applyMatrixToPixels(ref, m);

  assert(
    'file round-trip: hue-rotate(135) saturate(1.32) brightness(0.96)',
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
