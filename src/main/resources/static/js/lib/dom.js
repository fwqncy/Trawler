// Tiny templating: tagged templates that escape every interpolation unless it's already markup.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

class Markup {
  constructor(text) { this.text = text; }
  toString() { return this.text; }
}

export const raw = (text) => new Markup(String(text));
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

function part(value) {
  if (value == null || value === false || value === true) return '';
  if (value instanceof Markup) return value.text;
  if (Array.isArray(value)) return value.map(part).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Markup(out);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function render(target, markup) {
  target.innerHTML = markup instanceof Markup ? markup.text : String(markup);
  return target;
}

/** Delegated listener; returns a function that removes it. */
export function on(root, type, selector, handler, options) {
  const listener = (event) => {
    const match = event.target.closest?.(selector);
    if (match && root.contains(match)) handler(event, match);
  };
  root.addEventListener(type, listener, options);
  return () => root.removeEventListener(type, listener, options);
}

export const icon = (name, label) => label
  ? html`<svg role="img" aria-label="${label}"><use href="#i-${name}"/></svg>`
  : html`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;

/** Marks a button busy for at least `min` ms so the spinner never flickers. */
export async function busy(button, task, min = 350) {
  if (!button) return task();
  const label = button.getAttribute('aria-label');
  button.setAttribute('aria-busy', 'true');
  button.disabled = true;
  const started = performance.now();
  try {
    return await task();
  } finally {
    const left = min - (performance.now() - started);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    button.removeAttribute('aria-busy');
    button.disabled = false;
    if (label) button.setAttribute('aria-label', label);
  }
}

export function download(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
