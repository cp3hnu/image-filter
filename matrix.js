/**
 * CSS Filter color matrix implementation
 * Based on the W3C Filter Effects specification:
 * https://www.w3.org/TR/filter-effects/#feColorMatrixElement
 *
 * Each filter is expressed as a 5x4 (RGBA + bias) matrix operating in linear light.
 * We work in sRGB space like browsers do (no linearization), matching CSS behavior.
 */

/**
 * Multiply two 5x4 matrices (stored as flat 20-element arrays, row-major).
 * Row layout: [R_r, R_g, R_b, R_a, R_bias,
 *              G_r, G_g, G_b, G_a, G_bias,
 *              B_r, B_g, B_b, B_a, B_bias,
 *              A_r, A_g, A_b, A_a, A_bias]
 */
function multiplyMatrices(a, b) {
  // Treat each as a 4x5 matrix for multiplication purposes
  // result[row][col] = sum over k of a[row][k] * b[k][col]
  // We expand: 4 output rows × 5 output cols
  const result = new Array(20).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[row * 5 + k] * b[k * 5 + col];
      }
      // bias column (col=4): add a's bias directly when col=4
      if (col === 4) {
        sum += a[row * 5 + 4];
      }
      result[row * 5 + col] = sum;
    }
  }
  return result;
}

/** Identity matrix */
function identity() {
  return [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/**
 * hue-rotate(angle deg)
 * W3C spec matrix for hue rotation using sRGB luminance weights.
 */
function hueRotateMatrix(angleDeg) {
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Luminance weights (sRGB)
  const lr = 0.213;
  const lg = 0.715;
  const lb = 0.072;

  return [
    lr + cos * (1 - lr) + sin * -lr,       lg + cos * -lg       + sin * -lg,       lb + cos * -lb       + sin * (1 - lb), 0, 0,
    lr + cos * -lr       + sin * 0.143,     lg + cos * (1 - lg)  + sin * 0.140,     lb + cos * -lb       + sin * -0.283,   0, 0,
    lr + cos * -lr       + sin * -(1 - lr), lg + cos * -lg       + sin * lg,         lb + cos * (1 - lb)  + sin * lb,       0, 0,
    0,                                       0,                                       0,                                    1, 0,
  ];
}

/**
 * saturate(amount)
 * amount=1 → no change, amount=0 → grayscale, amount>1 → supersaturate
 */
function saturateMatrix(amount) {
  const lr = 0.213;
  const lg = 0.715;
  const lb = 0.072;
  const s = amount;

  return [
    lr + (1 - lr) * s, lg - lg * s,         lb - lb * s,         0, 0,
    lr - lr * s,        lg + (1 - lg) * s,   lb - lb * s,         0, 0,
    lr - lr * s,        lg - lg * s,         lb + (1 - lb) * s,   0, 0,
    0,                  0,                   0,                   1, 0,
  ];
}

/**
 * brightness(amount)
 * amount=1 → no change, amount=0 → black, amount>1 → brighter
 * CSS spec: linear multiplier on RGB channels.
 */
function brightnessMatrix(amount) {
  return [
    amount, 0,      0,      0, 0,
    0,      amount, 0,      0, 0,
    0,      0,      amount, 0, 0,
    0,      0,      0,      1, 0,
  ];
}

/**
 * Build a combined matrix from filter options.
 * Filters are applied left-to-right (matching CSS filter application order).
 */
function buildCombinedMatrix({ hueRotate = 0, saturate = 1, brightness = 1 } = {}) {
  let m = identity();
  if (brightness !== 1) m = multiplyMatrices(brightnessMatrix(brightness), m);
  if (saturate !== 1)   m = multiplyMatrices(saturateMatrix(saturate), m);
  if (hueRotate !== 0)  m = multiplyMatrices(hueRotateMatrix(hueRotate), m);
  return m;
}

/**
 * Apply a 5x4 color matrix to a raw RGBA pixel buffer (Uint8Array/Buffer).
 * Modifies the buffer in-place.
 */
function applyMatrixToPixels(buffer, matrix) {
  const len = buffer.length;
  for (let i = 0; i < len; i += 4) {
    const r = buffer[i]     / 255;
    const g = buffer[i + 1] / 255;
    const b = buffer[i + 2] / 255;
    const a = buffer[i + 3] / 255;

    const nr = matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4];
    const ng = matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9];
    const nb = matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14];
    const na = matrix[15] * r + matrix[16] * g + matrix[17] * b + matrix[18] * a + matrix[19];

    buffer[i]     = Math.round(Math.min(255, Math.max(0, nr * 255)));
    buffer[i + 1] = Math.round(Math.min(255, Math.max(0, ng * 255)));
    buffer[i + 2] = Math.round(Math.min(255, Math.max(0, nb * 255)));
    buffer[i + 3] = Math.round(Math.min(255, Math.max(0, na * 255)));
  }
  return buffer;
}

module.exports = { buildCombinedMatrix, applyMatrixToPixels };
