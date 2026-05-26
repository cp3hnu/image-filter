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
 * invert(amount) — amount 0..1 (0%..100%)
 */
function invertMatrix(amount) {
  const a = amount;
  const t = 1 - 2 * a;
  return [
    t, 0, 0, 0, a,
    0, t, 0, 0, a,
    0, 0, t, 0, a,
    0, 0, 0, 1, 0,
  ];
}

/**
 * sepia(amount) — amount 0..1 (0%..100%)
 */
function sepiaMatrix(amount) {
  const a = amount;
  const inv = 1 - a;
  return [
    inv + 0.393 * a, inv * 0 + 0.769 * a, inv * 0 + 0.189 * a, 0, 0,
    0.349 * a,       inv + 0.686 * a,       0.168 * a,             0, 0,
    0.272 * a,       0.534 * a,             inv + 0.131 * a,       0, 0,
    0,               0,                     0,                     1, 0,
  ];
}

/**
 * contrast(amount) — amount=1 → no change; pivots around 0.5 in [0,1] space
 */
function contrastMatrix(amount) {
  const c = amount;
  const bias = -0.5 * c + 0.5;
  return [
    c, 0, 0, 0, bias,
    0, c, 0, 0, bias,
    0, 0, c, 0, bias,
    0, 0, 0, 1, 0,
  ];
}

/** CSS filter defaults (identity = no effect). */
const FILTER_DEFAULTS = {
  invert: 0,
  sepia: 0,
  saturate: 1,
  hueRotate: 0,
  brightness: 1,
  contrast: 1,
};

const FILTER_RE = /(invert|sepia|saturate|hue-rotate|brightness|contrast)\(([^)]+)\)/gi;

/**
 * Parse a CSS filter value (percent, deg, or number).
 * @param {'invert'|'sepia'|'saturate'|'hue-rotate'|'brightness'|'contrast'} name
 */
function parseFilterAmount(name, raw) {
  const s = String(raw).trim().toLowerCase();
  if (name === 'hue-rotate') {
    const n = parseFloat(s.replace(/deg$/, ''));
    if (Number.isNaN(n)) throw new Error(`invalid hue-rotate: ${raw}`);
    return n;
  }
  if (s.endsWith('%')) {
    const n = parseFloat(s.slice(0, -1));
    if (Number.isNaN(n)) throw new Error(`invalid ${name}: ${raw}`);
    if (name === 'invert' || name === 'sepia') return n / 100;
    return n / 100;
  }
  const n = parseFloat(s);
  if (Number.isNaN(n)) throw new Error(`invalid ${name}: ${raw}`);
  return n;
}

/**
 * Parse a full CSS filter string, preserving declaration order.
 * @returns {{ values: object, steps: { name: string, amount: number }[] }}
 */
function parseFilterString(filterStr) {
  const values = { ...FILTER_DEFAULTS };
  const steps = [];
  let match;
  const re = new RegExp(FILTER_RE.source, 'gi');
  while ((match = re.exec(filterStr)) !== null) {
    const name = match[1].toLowerCase();
    const amount = parseFilterAmount(name, match[2]);
    const key = name === 'hue-rotate' ? 'hueRotate' : name;
    values[key] = amount;
    steps.push({ name, amount });
  }
  return { values, steps };
}

function matrixForStep(name, amount) {
  switch (name) {
    case 'invert': return invertMatrix(amount);
    case 'sepia': return sepiaMatrix(amount);
    case 'saturate': return saturateMatrix(amount);
    case 'hue-rotate': return hueRotateMatrix(amount);
    case 'brightness': return brightnessMatrix(amount);
    case 'contrast': return contrastMatrix(amount);
    default: throw new Error(`unsupported filter: ${name}`);
  }
}

/**
 * Build a combined matrix from filter options or a CSS filter string.
 *
 * Order matters: matches CSS `filter` — left-to-right in the string, or `steps` array.
 * Object form without `steps` uses declaration order:
 *   invert → sepia → saturate → hue-rotate → brightness → contrast
 * (only non-default values are applied).
 */
function buildCombinedMatrix(input = {}) {
  if (typeof input === 'string') {
    return buildCombinedMatrix(parseFilterString(input));
  }

  let steps = input.steps;
  if (!steps) {
    steps = [];
    const add = (name, amount, def) => {
      if (amount !== def) steps.push({ name, amount });
    };
    add('invert', input.invert ?? FILTER_DEFAULTS.invert, FILTER_DEFAULTS.invert);
    add('sepia', input.sepia ?? FILTER_DEFAULTS.sepia, FILTER_DEFAULTS.sepia);
    add('saturate', input.saturate ?? FILTER_DEFAULTS.saturate, FILTER_DEFAULTS.saturate);
    add('hue-rotate', input.hueRotate ?? FILTER_DEFAULTS.hueRotate, FILTER_DEFAULTS.hueRotate);
    add('brightness', input.brightness ?? FILTER_DEFAULTS.brightness, FILTER_DEFAULTS.brightness);
    add('contrast', input.contrast ?? FILTER_DEFAULTS.contrast, FILTER_DEFAULTS.contrast);
  }

  let m = identity();
  for (const { name, amount } of steps) {
    m = multiplyMatrices(matrixForStep(name, amount), m);
  }
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

module.exports = {
  FILTER_DEFAULTS,
  buildCombinedMatrix,
  parseFilterString,
  applyMatrixToPixels,
};
