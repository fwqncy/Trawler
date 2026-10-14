// One fixed WebGL canvas behind the page. Pass 1 paints the cloud sky down to the hero's edge and a
// faint water-light shimmer over the paper. Pass 2 draws the whirlpool into its slot, if one is mounted.

import * as THREE from 'three';
import { createShoal } from './shoal.js';

THREE.ColorManagement.enabled = false; // colours stay in the same sRGB space as the CSS around them

const vertexShader = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uHorizon;
  uniform float uDpr;
  uniform vec2 uRes;
  uniform vec3 uSky0;
  uniform vec3 uSky1;
  uniform vec3 uSky2;
  uniform vec3 uCloud;
  uniform vec3 uOchre;
  uniform vec3 uPaper;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
    return v;
  }
  // Light through moving water, for the paper.
  float caustic(vec2 p, float t) {
    vec2 i = p;
    float c = 1.0;
    float inten = 0.006;
    for (int n = 0; n < 4; n++) {
      float tt = t * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.0);
  }

  void main() {
    vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
    float t = uTime;
    float puff = fbm(vec2(frag.x * 0.005 + t * 0.02, t * 0.025));
    float hem = uHorizon + (puff - 0.4) * 64.0;

    if (frag.y > hem + 48.0) {
      float c = caustic(frag * 0.0065 + vec2(t * 0.02, 0.0), t * 0.22 + 23.0);
      float fade = smoothstep(hem + 48.0, hem + 260.0, frag.y);
      vec3 light = mix(vec3(1.0), uSky2, 0.18);
      gl_FragColor = vec4(light, clamp(c, 0.0, 1.0) * 0.16 * fade);
      return;
    }

    vec2 p = frag * 0.0021;
    vec2 q = vec2(fbm(p + vec2(0.0, t * 0.016)), fbm(p + vec2(5.2, 1.3) - t * 0.012));
    float n = fbm(p * 1.35 + 2.1 * q + vec2(t * 0.018, 0.0));
    float g = clamp(frag.y / max(hem, 1.0), 0.0, 1.0);

    vec3 col = mix(uSky0, uSky1, smoothstep(0.05, 1.0, g * 0.85 + n * 0.45));
    col = mix(col, uSky2, smoothstep(0.52, 0.86, n) * 0.8);
    col = mix(col, uOchre, smoothstep(0.74, 0.95, n) * 0.32 * g);
    float bank = smoothstep(hem - 150.0, hem - 6.0, frag.y + (n - 0.5) * 110.0);
    col = mix(col, uCloud, bank * 0.94);

    // Printed look: stipple, then a light posterise.
    col += (hash(floor(frag * uDpr) + floor(t * 12.0)) - 0.5) * 0.06;
    col = mix(col, floor(col * 9.0 + hash(floor(frag)) * 0.7) / 9.0, 0.22);

    float a = 1.0 - smoothstep(hem - 6.0, hem + 30.0, frag.y + (n - 0.5) * 36.0);
    gl_FragColor = vec4(col, a);
  }
`;

export function createSky(canvas, { reducedMotion }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  } catch {
    canvas.remove();
    document.documentElement.classList.add('no-webgl');
    return null;
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);

  const colour = (hex) => new THREE.Color(hex || '#000');
  const uniforms = {
    uTime: { value: 0 },
    uHorizon: { value: 320 },
    uDpr: { value: dpr },
    uRes: { value: new THREE.Vector2(1, 1) },
    uSky0: { value: colour() }, uSky1: { value: colour() }, uSky2: { value: colour() },
    uCloud: { value: colour() }, uOchre: { value: colour() }, uPaper: { value: colour() },
  };
  const skyScene = new THREE.Scene();
  const skyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  skyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthTest: false, depthWrite: false })));

  const shoal = createShoal(THREE, { reducedMotion });
  let slot = null;
  let horizonTween = null;
  let running = false;
  let frame = 0;
  let last = performance.now();
  let elapsed = 7;
  const slow = [];

  // Size from the canvas's own box: on phones window.innerWidth can grow past the screen.
  const viewport = () => [canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight];

  function resize() {
    const [w, h] = viewport();
    renderer.setSize(w, h, false);
    uniforms.uRes.value.set(w * dpr, h * dpr);
  }

  function setColours(p, animate) {
    const pairs = [
      ['uSky0', p.sky0], ['uSky1', p.sky1], ['uSky2', p.sky2],
      ['uCloud', p.cloud], ['uOchre', p.ochre], ['uPaper', p.paper],
    ];
    for (const [key, hex] of pairs) {
      const target = colour(hex);
      if (animate && window.gsap && !reducedMotion.matches) {
        window.gsap.to(uniforms[key].value, { r: target.r, g: target.g, b: target.b, duration: 0.9, ease: 'power2.out', onUpdate: kick });
      } else {
        uniforms[key].value.copy(target);
      }
    }
    shoal.setColours(p, animate);
    kick();
  }

  /** Where the sky ends, in viewport pixels: the bottom of the hero, never above the nav bar. */
  function measureHorizon() {
    const hero = document.querySelector('[data-sky]');
    const nav = document.querySelector('.masthead');
    const navBottom = nav ? nav.getBoundingClientRect().bottom : 64;
    const bottom = hero ? hero.getBoundingClientRect().bottom : navBottom;
    return Math.max(navBottom, bottom);
  }

  function draw(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reducedMotion.matches) elapsed += dt;
    uniforms.uTime.value = elapsed;
    if (!horizonTween) uniforms.uHorizon.value = measureHorizon();

    const [width, height] = viewport();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.clear();
    renderer.render(skyScene, skyCamera);

    if (slot && slot.isConnected) {
      const rect = slot.getBoundingClientRect();
      const visible = rect.bottom > 0 && rect.top < height && rect.width > 0;
      if (visible) {
        const y = height - rect.bottom;
        renderer.setViewport(rect.left, y, rect.width, rect.height);
        renderer.setScissor(rect.left, y, rect.width, rect.height);
        renderer.setScissorTest(true);
        shoal.render(renderer, rect, dt, elapsed);
        renderer.setScissorTest(false);
      }
    }
    adapt(dt);
  }

  // If frames run long on a modest GPU, drop resolution once rather than stutter.
  function adapt(dt) {
    if (dpr <= 1 || reducedMotion.matches) return;
    slow.push(dt);
    if (slow.length < 90) return;
    const average = slow.reduce((a, b) => a + b, 0) / slow.length;
    slow.length = 0;
    if (average > 1 / 40) {
      dpr = 1;
      renderer.setPixelRatio(dpr);
      uniforms.uDpr.value = dpr;
      resize();
    }
  }

  function loop(now) {
    if (!running) return;
    draw(now);
    frame = requestAnimationFrame(loop);
  }

  function start() {
    if (running || document.hidden) return;
    if (reducedMotion.matches) { kick(); return; }
    running = true;
    last = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frame);
  }

  // With reduced motion there's no loop: repaint once whenever something changes.
  let pending = false;
  function kick() {
    if (running || pending) return;
    pending = true;
    requestAnimationFrame((now) => { pending = false; draw(now); });
  }

  window.addEventListener('resize', () => { resize(); kick(); });
  window.addEventListener('scroll', kick, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reducedMotion.addEventListener('change', () => { stop(); start(); });

  resize();

  return {
    start,
    setColours,
    kick,
    /** Glides the sky's edge to the new hero when a page changes, instead of snapping. */
    settle() {
      const from = uniforms.uHorizon.value;
      const to = measureHorizon();
      horizonTween?.kill();
      horizonTween = null;
      if (window.gsap && !reducedMotion.matches && Math.abs(to - from) > 4) {
        const proxy = { value: from };
        horizonTween = window.gsap.to(proxy, {
          value: to,
          duration: 0.9,
          ease: 'expo.out',
          onUpdate: () => { uniforms.uHorizon.value = proxy.value; },
          onComplete: () => { horizonTween = null; },
        });
      } else {
        kick();
      }
    },
    mountShoal(element, handlers) {
      slot = element;
      shoal.attach(element, handlers);
      kick();
      return () => {
        if (slot === element) slot = null;
        shoal.detach();
      };
    },
    setShoalItems(items) { shoal.setItems(items); kick(); },
  };
}
