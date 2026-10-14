// Motion with GSAP. Everything here checks reduced motion first and leaves the page usable without it.

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const gsap = () => (reducedMotion.matches ? null : window.gsap);

/** Speckled paper grain, generated once so it's crisp at any pixel density. */
export function paintGrain() {
  const size = 220;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const r = Math.random();
    const dark = r < 0.5;
    const shade = dark ? 20 : 255;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = shade;
    image.data[i + 3] = r < 0.18 ? 26 : r > 0.9 ? 18 : 0;
  }
  ctx.putImageData(image, 0, 0);
  document.documentElement.style.setProperty('--grain', `url(${canvas.toDataURL('image/png')})`);
}

// ---- Cloud reveal: a sprite sheet of growing cloud shapes, stepped through as a mask. ----

const FRAMES = 14;
let cloudSheet = null;

function valueNoise(width, height, seed = 7) {
  const grid = 9;
  const rand = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (x, y, freq) => {
    const fx = (x / width) * freq;
    const fy = (y / height) * freq * (height / width);
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const a = rand(ix, iy);
    const b = rand(ix + 1, iy);
    const c = rand(ix, iy + 1);
    const d = rand(ix + 1, iy + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  const field = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0;
      let amp = 0.55;
      let freq = grid / 3;
      for (let o = 0; o < 4; o++) { v += sample(x, y, freq) * amp; amp *= 0.5; freq *= 2; }
      field[y * width + x] = v;
    }
  }
  return field;
}

function cloudMask() {
  if (cloudSheet) return cloudSheet;
  const w = 128;
  const h = 96;
  const field = valueNoise(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w * FRAMES;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w * FRAMES, h);
  for (let f = 0; f < FRAMES; f++) {
    const threshold = (f / (FRAMES - 1)) * 1.25 - 0.1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Clouds bloom from the lower left, like a bank rolling in.
        const bias = ((w - x) / w) * 0.18 + (y / h) * 0.12;
        const n = field[y * w + x] - bias;
        const alpha = Math.max(0, Math.min(1, (threshold - n) / 0.08 + 0.5));
        const i = (y * w * FRAMES + f * w + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = 0;
        image.data[i + 3] = Math.round(alpha * 255);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  cloudSheet = `url(${canvas.toDataURL('image/png')})`;
  return cloudSheet;
}

function setMask(el, frame) {
  const pos = `${(frame / (FRAMES - 1)) * 100}% 0`;
  el.style.webkitMaskPosition = pos;
  el.style.maskPosition = pos;
}

function clearMask(el) {
  for (const prop of ['webkitMaskImage', 'maskImage', 'webkitMaskSize', 'maskSize', 'webkitMaskPosition', 'maskPosition', 'webkitMaskRepeat', 'maskRepeat']) {
    el.style[prop] = '';
  }
}

/** Reveals elements through rolling cloud, the way the sky reveals the page. */
export function cloudReveal(elements, { stagger = 0.06, delay = 0 } = {}) {
  const g = gsap();
  const list = [...elements].filter(Boolean);
  if (!g || !list.length) return;
  const sheet = cloudMask();
  list.forEach((el) => {
    el.style.webkitMaskImage = sheet;
    el.style.maskImage = sheet;
    el.style.webkitMaskSize = `${FRAMES * 100}% 100%`;
    el.style.maskSize = `${FRAMES * 100}% 100%`;
    el.style.webkitMaskRepeat = 'no-repeat';
    el.style.maskRepeat = 'no-repeat';
    setMask(el, 0);
  });
  list.forEach((el, i) => {
    const proxy = { frame: 0 };
    g.to(proxy, {
      frame: FRAMES - 1,
      duration: 0.75,
      delay: delay + i * stagger,
      ease: `steps(${FRAMES - 1})`,
      onUpdate: () => setMask(el, proxy.frame),
      onComplete: () => clearMask(el),
      onInterrupt: () => clearMask(el),
    });
  });
}

/** Page entrance: hero copy lifts in, content arrives through cloud. */
export function enterPage(root) {
  const g = gsap();
  if (!g) return;
  const heroBits = root.querySelectorAll('.hero__copy > *, .hero__inner > :not(.hero__copy):not(.shoal-col)');
  g.killTweensOf(heroBits);
  g.fromTo(heroBits, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'expo.out', stagger: 0.05, clearProps: 'transform,opacity' });
  const display = root.querySelector('.hero .display');
  if (display && window.SplitText) {
    try {
      const split = new window.SplitText(display, { type: 'chars', charsClass: 'char' });
      g.from(split.chars, {
        yPercent: 60, opacity: 0, rotate: 4, duration: 1.1, ease: 'expo.out', stagger: 0.028,
        onComplete: () => split.revert(),
      });
    } catch { /* plain heading is fine */ }
  }
  cloudReveal(root.querySelectorAll('.page .reveal'), { delay: 0.12 });
}

/** Counts a figure up from zero, then leaves the exact formatted text in place. */
export function countUp(el, value, format) {
  const g = gsap();
  if (!g || !el) { if (el) el.textContent = format(value); return; }
  const proxy = { v: 0 };
  g.to(proxy, {
    v: value,
    duration: 1.1,
    ease: 'expo.out',
    onUpdate: () => { el.textContent = format(proxy.v); },
    onComplete: () => { el.textContent = format(value); },
  });
}

export function growMeters(root) {
  const g = gsap();
  const fills = root.querySelectorAll('.meter__fill');
  if (!g || !fills.length) return;
  g.from(fills, { scaleX: 0, duration: 0.9, ease: 'expo.out', stagger: 0.012, clearProps: 'transform' });
}
