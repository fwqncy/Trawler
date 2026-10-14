// Palettes. Tide and Claret are hand-tuned in CSS; Custom derives every token from one or two
// picked colours in OKLCH, so contrast holds whatever someone chooses on the wheel.

const STORAGE_KEY = 'trawler.theme';

export const TOKEN_KEYS = [
  'sky-0', 'sky-1', 'sky-2', 'cloud', 'ochre', 'star', 'paper', 'paper-2', 'card',
  'ink', 'ink-2', 'ink-3', 'line', 'line-strong', 'accent', 'accent-ink', 'accent-soft',
  'signal', 'signal-soft', 'warn', 'warn-soft', 'good', 'good-soft', 'on-sky', 'on-sky-2',
];

export const PRESETS = [
  { name: 'tide', label: 'Tide', note: 'Navy sky, cream paper', swatch: ['#081233', '#14317f', '#ede6d3', '#f5f2ea', '#1d3e9e'] },
  { name: 'claret', label: 'Claret', note: 'Burgundy & gold', swatch: ['#22050d', '#571322', '#efdcb4', '#f7f0e4', '#c9a13b'] },
];

export const DEFAULT_CUSTOM = { sky: '#1f6f78', accent: '#e0a43a' };

// ---- OKLab / OKLCH <-> sRGB (Björn Ottosson's matrices) ----

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
}

export function rgbToHex(rgb) {
  return '#' + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');
}

function rgbToOklab([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function hexToOklch(hex) {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  const C = Math.hypot(a, b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return [L, C, h];
}

/** OKLCH to hex, pulling chroma in until the colour fits sRGB. */
export function oklchToHex(L, C, h) {
  const rad = (h * Math.PI) / 180;
  let lo = 0;
  let hi = C;
  let best = oklabToLinear([L, 0, 0]);
  for (let i = 0; i < 18; i++) {
    const mid = i === 0 ? C : (lo + hi) / 2;
    const lin = oklabToLinear([L, mid * Math.cos(rad), mid * Math.sin(rad)]);
    const inGamut = lin.every((c) => c >= -0.0005 && c <= 1.0005);
    if (inGamut) { best = lin; lo = mid; if (i === 0) break; } else { hi = mid; }
  }
  return rgbToHex(best.map((c) => toGamma(Math.min(1, Math.max(0, c)))));
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Every token from a sky colour and an optional accent. */
export function derive(skyHex, accentHex) {
  const [, skyC, h] = hexToOklch(skyHex);
  const c = Math.max(skyC, 0.03);
  const t = (L, C, hue = h) => oklchToHex(L, C, hue);
  const [aL, aC, aH] = accentHex ? hexToOklch(accentHex) : [0.45, Math.min(c, 0.16), h];

  const ink = t(0.24, Math.min(c, 0.08));
  const paper = t(0.965, 0.01);
  const card = t(0.985, 0.006);
  // Accent doubles as text and button fill on paper, so keep it dark enough to read.
  let accentL = Math.min(aL, 0.52);
  let accent = t(accentL, aC, aH);
  while (contrast(accent, paper) < 4.6 && accentL > 0.2) {
    accentL -= 0.02;
    accent = t(accentL, aC, aH);
  }
  const onSky = t(0.94, 0.03, 85);

  return {
    'sky-0': t(0.16, Math.min(c, 0.08)),
    'sky-1': t(0.31, Math.min(c, 0.15)),
    'sky-2': t(0.55, Math.min(c, 0.14)),
    cloud: t(0.92, 0.035, 85),
    ochre: t(0.75, 0.11, 85),
    star: accentHex ? t(Math.max(aL, 0.86), Math.min(aC, 0.13), aH) : t(0.95, 0.03, 85),
    paper,
    'paper-2': t(0.925, 0.016),
    card,
    ink,
    'ink-2': t(0.4, Math.min(c, 0.06)),
    'ink-3': t(0.49, Math.min(c, 0.045)),
    line: `color-mix(in oklab, ${ink} 12%, transparent)`,
    'line-strong': `color-mix(in oklab, ${ink} 24%, transparent)`,
    accent,
    'accent-ink': card,
    'accent-soft': t(0.9, Math.min(aC, 0.05), aH),
    signal: '#b8322a',
    'signal-soft': '#f6dcd6',
    warn: '#8f5b0a',
    'warn-soft': '#f3e3c2',
    good: '#2c6e49',
    'good-soft': '#d7eadb',
    'on-sky': onSky,
    'on-sky-2': `color-mix(in oklab, ${onSky} 74%, transparent)`,
  };
}

// ---- State ----

export function savedTheme() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { name: 'tide' };
  } catch {
    return { name: 'tide' };
  }
}

function persist(state, tokens) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, tokens }));
  } catch { /* private mode: the theme still applies for this visit */ }
}

/** Colours the 3D scene needs, read back from whatever is applied. */
export function palette() {
  const style = getComputedStyle(document.documentElement);
  const read = (key) => style.getPropertyValue(`--${key}`).trim();
  return {
    sky0: read('sky-0'), sky1: read('sky-1'), sky2: read('sky-2'), cloud: read('cloud'), ochre: read('ochre'),
    star: read('star'), paper: read('paper'), signal: read('signal'), accent: read('accent'),
  };
}

export function applyTheme(state, { save = true } = {}) {
  const root = document.documentElement;
  TOKEN_KEYS.forEach((key) => root.style.removeProperty(`--${key}`));
  let tokens = null;
  if (state.name === 'custom') {
    tokens = derive(state.sky, state.accent);
    Object.entries(tokens).forEach(([key, value]) => root.style.setProperty(`--${key}`, value));
  }
  root.dataset.theme = state.name;
  const colours = palette();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colours.sky0);
  if (save) persist(state, tokens);
  window.dispatchEvent(new CustomEvent('trawler:theme', { detail: colours }));
  return colours;
}
