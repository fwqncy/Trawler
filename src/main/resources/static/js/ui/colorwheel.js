// An HSV colour wheel: hue around the rim, saturation toward it, brightness on a slider.
// The thumb is a keyboard slider too, and a hex field takes exact values.

import { html, render } from '../lib/dom.js';

function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

export function hsvToHex(h, s, v) {
  return '#' + hsvToRgb(h, s, v).map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

export function hexToHsv(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [((h * 60) + 360) % 360, max ? d / max : 0, max];
}

let uid = 0;

export function colorWheel(container, { value = '#1f6f78', label = 'Colour', onInput }) {
  const id = `wheel-${++uid}`;
  render(container, html`
    <div class="wheel">
      <div class="wheel__stage">
        <canvas aria-hidden="true"></canvas>
        <button type="button" class="wheel__thumb" role="slider" aria-label="${label}: hue & saturation"
                aria-valuemin="0" aria-valuemax="360"></button>
      </div>
      <div class="field wheel__light">
        <label class="field__label" for="${id}-v">Brightness</label>
        <input id="${id}-v" type="range" min="18" max="100" step="1">
      </div>
      <div class="field wheel__light">
        <label class="field__label" for="${id}-hex">Hex</label>
        <input id="${id}-hex" class="input input--mono" type="text" inputmode="text" autocomplete="off" spellcheck="false" maxlength="7">
      </div>
    </div>`);

  const stage = container.querySelector('.wheel__stage');
  const canvas = container.querySelector('canvas');
  const thumb = container.querySelector('.wheel__thumb');
  const brightness = container.querySelector('input[type="range"]');
  const hexInput = container.querySelector(`#${id}-hex`);
  let [h, s, v] = hexToHsv(value);
  let paintedV = -1;
  let frame = 0;

  function paint() {
    const size = Math.round(stage.clientWidth * Math.min(window.devicePixelRatio || 1, 2)) || 560;
    if (paintedV === v && canvas.width === size) return;
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(size, size);
    const half = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - half;
        const dy = y - half;
        const r = Math.hypot(dx, dy) / half;
        const i = (y * size + x) * 4;
        if (r > 1) { image.data[i + 3] = 0; continue; }
        const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const [red, green, blue] = hsvToRgb(hue, r, v);
        image.data[i] = red * 255;
        image.data[i + 1] = green * 255;
        image.data[i + 2] = blue * 255;
        image.data[i + 3] = r > 0.985 ? Math.round((1 - r) / 0.015 * 255) : 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    paintedV = v;
  }

  function sync(emit = true) {
    const hex = hsvToHex(h, s, v);
    const angle = (h * Math.PI) / 180;
    thumb.style.left = `${50 + Math.cos(angle) * s * 50}%`;
    thumb.style.top = `${50 + Math.sin(angle) * s * 50}%`;
    thumb.style.setProperty('--thumb', hex);
    thumb.setAttribute('aria-valuenow', String(Math.round(h)));
    thumb.setAttribute('aria-valuetext', `Hue ${Math.round(h)}°, saturation ${Math.round(s * 100)}%, ${hex}`);
    brightness.value = String(Math.round(v * 100));
    if (document.activeElement !== hexInput) hexInput.value = hex;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      paint();
      if (emit) onInput?.(hex);
    });
  }

  function pick(event) {
    const rect = stage.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    s = Math.min(1, Math.hypot(dx, dy) / (rect.width / 2));
    sync();
  }

  stage.addEventListener('pointerdown', (event) => {
    stage.setPointerCapture(event.pointerId);
    pick(event);
    thumb.focus({ preventScroll: true });
    const move = (e) => pick(e);
    const up = () => { stage.removeEventListener('pointermove', move); stage.removeEventListener('pointerup', up); };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
  });
  thumb.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 15 : 3;
    if (event.key === 'ArrowLeft') h = (h - step + 360) % 360;
    else if (event.key === 'ArrowRight') h = (h + step) % 360;
    else if (event.key === 'ArrowUp') s = Math.min(1, s + (event.shiftKey ? 0.1 : 0.03));
    else if (event.key === 'ArrowDown') s = Math.max(0, s - (event.shiftKey ? 0.1 : 0.03));
    else return;
    event.preventDefault();
    sync();
  });
  brightness.addEventListener('input', () => { v = Number(brightness.value) / 100; sync(); });
  hexInput.addEventListener('input', () => {
    const text = hexInput.value.trim();
    const hex = text.startsWith('#') ? text : `#${text}`;
    if (/^#[0-9a-f]{6}$/i.test(hex)) { [h, s, v] = hexToHsv(hex); sync(); }
  });
  hexInput.addEventListener('blur', () => { hexInput.value = hsvToHex(h, s, v); });

  const resize = new ResizeObserver(() => { paintedV = -1; paint(); });
  resize.observe(stage);
  sync(false);

  return {
    set(hex) { [h, s, v] = hexToHsv(hex); sync(false); },
    destroy() { resize.disconnect(); },
  };
}
