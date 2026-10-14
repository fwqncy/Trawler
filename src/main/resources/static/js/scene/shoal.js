// The whirlpool. Every stock line is a constellation shaped like a fish, circling a funnel.
// Lines at or above par swim wide and slow near the rim; the lower a line runs against par,
// the deeper and faster it's pulled toward the eye. A field of dust spirals in behind them.

const FISH = [
  [1.0, 0.0], [0.55, 0.3], [0.05, 0.36], [-0.42, 0.2], [-0.68, 0.0], [-1.04, 0.36],
  [-1.04, -0.32], [-0.42, -0.2], [0.05, -0.34], [0.55, -0.28], [0.6, 0.08], [-0.06, 0.64],
];
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 4], [4, 7], [7, 8], [8, 9], [9, 0], [2, 11], [11, 3]];
const STAR_SIZE = [1.25, 0.8, 0.9, 0.75, 0.8, 1.0, 1.0, 0.75, 0.9, 0.8, 1.15, 0.85];
const DUST = 1700;
const MAX_FISH = 120;

/** Depth of the funnel at radius r: the eye sits low, the rim high. */
const funnel = (r) => 1.7 - 4.3 / (1 + r * 1.05);

const pointsVertex = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
  }
`;
const pointsFragment = /* glsl */ `
  precision mediump float;
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.16, 0.02, d);
    float glow = exp(-d * d * 22.0) * 0.55;
    float a = (core + glow) * vColor.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, a);
  }
`;
const linesVertex = /* glsl */ `
  attribute vec4 aColor;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const linesFragment = /* glsl */ `
  precision mediump float;
  varying vec4 vColor;
  void main() { gl_FragColor = vColor; }
`;
const dustVertex = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uSpin;
  uniform float uScale;
  varying float vAlpha;
  float funnel(float r) { return 1.7 - 4.3 / (1.0 + r * 1.05); }
  void main() {
    float life = fract(aSeed.x + uTime * (0.012 + aSeed.w * 0.02));
    float r = mix(3.9, 0.12, pow(life, 0.75));
    float angle = aSeed.y * 6.2831 + uTime * (0.12 + 0.75 / (r + 0.35)) + uSpin * (1.0 + 0.6 / (r + 0.5));
    float y = funnel(r) + (aSeed.z - 0.5) * (0.18 + 0.06 * r);
    vec4 mv = modelViewMatrix * vec4(cos(angle) * r, y, sin(angle) * r, 1.0);
    gl_PointSize = (0.6 + aSeed.w * 1.6) * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vAlpha = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.82, 1.0, life)) * (0.16 + aSeed.w * 0.34);
  }
`;
const dustFragment = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export function createShoal(THREE, { reducedMotion }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 4.6, 9.2);
  camera.lookAt(0, -0.25, 0);

  const additive = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending };
  const colours = { star: new THREE.Color('#f4efe0'), signal: new THREE.Color('#b8322a'), dust: new THREE.Color('#4c77c9') };

  // Dust: positions live entirely on the GPU.
  const dustGeometry = new THREE.BufferGeometry();
  const seeds = new Float32Array(DUST * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
  dustGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const dustUniforms = { uTime: { value: 0 }, uSpin: { value: 0 }, uScale: { value: 300 }, uColor: { value: colours.dust.clone() } };
  const dust = new THREE.Points(dustGeometry, new THREE.ShaderMaterial({ vertexShader: dustVertex, fragmentShader: dustFragment, uniforms: dustUniforms, ...additive }));
  dust.frustumCulled = false;
  scene.add(dust);

  // Fish: rewritten every frame from a small CPU model, which also gives us hit-testing.
  const starGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(MAX_FISH * FISH.length * 3);
  const starColours = new Float32Array(MAX_FISH * FISH.length * 4);
  const starSizes = new Float32Array(MAX_FISH * FISH.length);
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3).setUsage(THREE.DynamicDrawUsage));
  starGeometry.setAttribute('aColor', new THREE.BufferAttribute(starColours, 4).setUsage(THREE.DynamicDrawUsage));
  starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1).setUsage(THREE.DynamicDrawUsage));
  const starUniforms = { uScale: { value: 300 } };
  const stars = new THREE.Points(starGeometry, new THREE.ShaderMaterial({ vertexShader: pointsVertex, fragmentShader: pointsFragment, uniforms: starUniforms, ...additive }));
  stars.frustumCulled = false;

  const lineGeometry = new THREE.BufferGeometry();
  const linePositions = new Float32Array(MAX_FISH * EDGES.length * 2 * 3);
  const lineColours = new Float32Array(MAX_FISH * EDGES.length * 2 * 4);
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
  lineGeometry.setAttribute('aColor', new THREE.BufferAttribute(lineColours, 4).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(lineGeometry, new THREE.ShaderMaterial({ vertexShader: linesVertex, fragmentShader: linesFragment, ...additive }));
  lines.frustumCulled = false;
  scene.add(lines, stars);

  let fish = [];
  let spin = 0;
  let spinVelocity = 0;
  let hovered = -1;
  let focused = -1;
  let element = null;
  let handlers = {};
  let tip = null;
  let live = null;
  let cleanup = [];
  let lastRect = null;

  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const projected = new THREE.Vector3();

  function setItems(items) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const maxValue = Math.max(1, ...items.map((item) => Number(item.value) || 0));
    fish = items.slice(0, MAX_FISH).map((item, i) => {
      const ratio = item.par > 0 ? Math.min(item.onHand / item.par, 1.6) : 1.4;
      const r = 0.45 + ratio * 1.9 + (((i * 37) % 11) / 11 - 0.5) * 0.3;
      const previous = fish.find((f) => f.item.id === item.id);
      return {
        item,
        r,
        phase: previous ? previous.phase : i * golden,
        speed: 0.16 + 0.5 / Math.pow(r, 1.15),
        size: 0.21 + 0.09 * Math.sqrt((Number(item.value) || 0) / maxValue),
        lift: (((i * 53) % 13) / 13 - 0.5) * 0.35,
        wiggle: i * 1.7,
        low: item.status !== 'OK',
        out: item.status === 'OUT',
        appear: previous ? previous.appear : 0,
        glow: 0,
        screen: { x: -999, y: -999, z: 1 },
      };
    });
    fish.sort((a, b) => b.r - a.r);
    const fresh = fish.filter((f) => f.appear < 1);
    if (window.gsap && !reducedMotion.matches) {
      window.gsap.to(fresh, { appear: 1, duration: 1.8, ease: 'expo.out', stagger: { each: 0.025, from: 'end' } });
    } else {
      fresh.forEach((f) => { f.appear = 1; });
    }
    hovered = -1;
    focused = -1;
    if (element) element.setAttribute('aria-label', label());
  }

  function label() {
    const low = fish.filter((f) => f.low).length;
    return `Stock whirlpool: ${fish.length} lines, ${low} below par. Use the arrow keys to step through them & Enter to open one.`;
  }

  function setColours(p, animate) {
    const targets = [[colours.star, p.star], [colours.signal, p.signal], [dustUniforms.uColor.value, p.sky2]];
    for (const [colour, hex] of targets) {
      const next = new THREE.Color(hex);
      if (colour === dustUniforms.uColor.value) next.lerp(new THREE.Color(p.star), 0.35);
      if (animate && window.gsap && !reducedMotion.matches) {
        window.gsap.to(colour, { r: next.r, g: next.g, b: next.b, duration: 0.9, ease: 'power2.out' });
      } else {
        colour.copy(next);
      }
    }
  }

  function render(renderer, rect, dt, time) {
    lastRect = rect;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    // Point sizes are in device pixels at unit depth; scale them with the slot so they read the same at any size.
    const scale = (rect.height / 560) * 100 * renderer.getPixelRatio();
    dustUniforms.uScale.value = scale * 0.55;
    starUniforms.uScale.value = scale * 1.35;

    if (!reducedMotion.matches) {
      spin += spinVelocity * dt;
      spinVelocity *= Math.pow(0.12, dt);
    }
    dustUniforms.uTime.value = time;
    dustUniforms.uSpin.value = spin;

    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);

    let s = 0;
    let l = 0;
    fish.forEach((f, index) => {
      const active = index === hovered || index === focused;
      f.glow += ((active ? 1 : 0) - f.glow) * Math.min(1, dt * 10);
      const r = 0.12 + (f.r - 0.12) * f.appear;
      const angle = f.phase + time * f.speed + spin * (1 + 0.6 / (r + 0.5));
      const bob = Math.sin(time * 0.9 + f.wiggle) * 0.05;
      centre.set(Math.cos(angle) * r, funnel(r) + 0.32 + f.lift * Math.min(1, r / 2) + bob, Math.sin(angle) * r);
      tangent.set(-Math.sin(angle), 0, Math.cos(angle));

      // Billboard the fish to face the camera, nose along its direction of travel, back always up.
      let hx = tangent.dot(right);
      let hy = tangent.dot(up);
      const len = Math.hypot(hx, hy) || 1;
      hx /= len;
      hy /= len;
      const flip = hx < 0 ? -1 : 1;
      const size = f.size * (1 + f.glow * 0.45) * (0.4 + 0.6 * f.appear);
      const tail = Math.sin(time * 5.5 + f.wiggle) * 0.09;

      const pulse = f.out ? 0.65 + 0.35 * Math.sin(time * 3 + f.wiggle) : 1;
      const base = f.low ? colours.signal : colours.star;
      const alpha = Math.min(1, (0.55 + 0.45 * f.glow) * f.appear * pulse + (f.low ? 0.15 : 0));

      const start = s;
      FISH.forEach(([px, py], k) => {
        const wag = k === 5 || k === 6 ? tail : k === 4 ? tail * 0.4 : 0;
        const lx = px;
        const ly = (py + wag) * flip;
        const ox = (lx * hx - ly * hy) * size;
        const oy = (lx * hy + ly * hx) * size;
        const i3 = s * 3;
        starPositions[i3] = centre.x + right.x * ox + up.x * oy;
        starPositions[i3 + 1] = centre.y + right.y * ox + up.y * oy;
        starPositions[i3 + 2] = centre.z + right.z * ox + up.z * oy;
        const i4 = s * 4;
        const twinkle = 0.8 + 0.2 * Math.sin(time * 2.2 + k * 1.3 + f.wiggle);
        starColours[i4] = base.r;
        starColours[i4 + 1] = base.g;
        starColours[i4 + 2] = base.b;
        starColours[i4 + 3] = alpha * twinkle;
        starSizes[s] = STAR_SIZE[k] * (0.9 + f.glow * 0.6) * (f.size / 0.18);
        s++;
      });
      EDGES.forEach(([a, b]) => {
        for (const v of [a, b]) {
          const from = (start + v) * 3;
          const i3 = l * 3;
          linePositions[i3] = starPositions[from];
          linePositions[i3 + 1] = starPositions[from + 1];
          linePositions[i3 + 2] = starPositions[from + 2];
          const i4 = l * 4;
          lineColours[i4] = base.r;
          lineColours[i4 + 1] = base.g;
          lineColours[i4 + 2] = base.b;
          lineColours[i4 + 3] = alpha * (0.32 + f.glow * 0.4);
          l++;
        }
      });

      projected.copy(centre).project(camera);
      f.screen.x = (projected.x * 0.5 + 0.5) * rect.width;
      f.screen.y = (-projected.y * 0.5 + 0.5) * rect.height;
      f.screen.z = projected.z;
    });

    starGeometry.setDrawRange(0, s);
    lineGeometry.setDrawRange(0, l);
    starGeometry.attributes.position.needsUpdate = true;
    starGeometry.attributes.aColor.needsUpdate = true;
    starGeometry.attributes.aSize.needsUpdate = true;
    lineGeometry.attributes.position.needsUpdate = true;
    lineGeometry.attributes.aColor.needsUpdate = true;

    renderer.render(scene, camera);
    placeTip();
  }

  function nearest(x, y) {
    let best = -1;
    let bestDistance = 30;
    fish.forEach((f, i) => {
      const d = Math.hypot(f.screen.x - x, f.screen.y - y);
      if (d < bestDistance) { best = i; bestDistance = d; }
    });
    return best;
  }

  function placeTip() {
    if (!tip) return;
    const index = hovered >= 0 ? hovered : focused;
    const f = fish[index];
    if (!f) { tip.hidden = true; return; }
    tip.style.left = `${f.screen.x}px`;
    tip.style.top = `${f.screen.y}px`;
  }

  function showTip(index) {
    const f = fish[index];
    if (!tip) return;
    if (!f) { tip.hidden = true; return; }
    const { item } = f;
    const state = item.status === 'OUT' ? 'Out of stock' : item.status === 'LOW' ? `${item.shortfall} short of par` : 'At or above par';
    tip.innerHTML = '';
    const sku = document.createElement('strong');
    sku.textContent = item.sku;
    const name = document.createElement('span');
    name.textContent = item.name;
    const level = document.createElement('div');
    level.textContent = `${item.onHand} / ${item.par} ${item.unit} · ${state}`;
    tip.append(sku, name, level);
    tip.hidden = false;
    placeTip();
  }

  function attach(el, nextHandlers) {
    detach();
    element = el;
    handlers = nextHandlers || {};
    tip = el.querySelector('.shoal__tip');
    live = el.querySelector('.shoal__live');
    el.tabIndex = 0;
    el.setAttribute('role', 'application');
    el.setAttribute('aria-roledescription', 'whirlpool');
    el.setAttribute('aria-label', label());

    let dragging = false;
    let lastX = 0;
    let moved = 0;
    const local = (event) => {
      const rect = el.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    const onMove = (event) => {
      if (dragging) {
        const dx = event.clientX - lastX;
        lastX = event.clientX;
        moved += Math.abs(dx);
        spinVelocity = Math.max(-6, Math.min(6, spinVelocity + dx * 0.012));
        return;
      }
      const [x, y] = local(event);
      const index = nearest(x, y);
      if (index !== hovered) {
        hovered = index;
        el.style.cursor = index >= 0 ? 'pointer' : '';
        if (index >= 0) showTip(index); else if (focused < 0) showTip(-1); else showTip(focused);
      }
    };
    const onDown = (event) => {
      if (event.button !== 0) return;
      dragging = true;
      moved = 0;
      lastX = event.clientX;
      el.setPointerCapture?.(event.pointerId);
    };
    const onUp = (event) => {
      if (!dragging) return;
      dragging = false;
      el.releasePointerCapture?.(event.pointerId);
      if (moved < 6) {
        const [x, y] = local(event);
        const index = nearest(x, y);
        if (index >= 0) handlers.select?.(fish[index].item);
      }
    };
    const onLeave = () => {
      if (dragging) return;
      hovered = -1;
      el.style.cursor = '';
      showTip(focused);
    };
    const onKey = (event) => {
      if (!fish.length) return;
      const order = fish.map((f, i) => i).sort((a, b) => fish[a].item.sku.localeCompare(fish[b].item.sku));
      const at = order.indexOf(focused);
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        focused = order[(at + 1) % order.length];
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        focused = order[(at - 1 + order.length) % order.length];
      } else if (event.key === 'Enter' && focused >= 0) {
        handlers.select?.(fish[focused].item);
        return;
      } else if (event.key === 'Escape') {
        focused = -1;
        showTip(-1);
        return;
      } else {
        return;
      }
      event.preventDefault();
      showTip(focused);
      const { item } = fish[focused];
      if (live) live.textContent = `${item.sku}, ${item.name}: ${item.onHand} of ${item.par} ${item.unit}.`;
    };
    const onBlur = () => { focused = -1; if (hovered < 0) showTip(-1); };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('keydown', onKey);
    el.addEventListener('blur', onBlur);
    cleanup = [
      () => el.removeEventListener('pointermove', onMove),
      () => el.removeEventListener('pointerdown', onDown),
      () => el.removeEventListener('pointerup', onUp),
      () => el.removeEventListener('pointercancel', onUp),
      () => el.removeEventListener('pointerleave', onLeave),
      () => el.removeEventListener('keydown', onKey),
      () => el.removeEventListener('blur', onBlur),
    ];
  }

  function detach() {
    cleanup.forEach((fn) => fn());
    cleanup = [];
    element = null;
    tip = null;
    live = null;
    hovered = -1;
    focused = -1;
  }

  return { setItems, setColours, render, attach, detach, get rect() { return lastRect; } };
}
