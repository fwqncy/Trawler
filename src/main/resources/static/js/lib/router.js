// History-API router. The URL holds the page, the store and every filter, so any view can be
// linked, refreshed or bookmarked and come back exactly as it was.

import { state, resolveStore } from './state.js';

const routes = [];
let main;
let current = null;
let controller = null;
let onRender = () => {};
let firstRender = true;

export function route(path, load) {
  const keys = [];
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)'; }) + '/?$');
  routes.push({ pattern, keys, load });
}

export const query = () => new URLSearchParams(location.search);

/** A link that carries the current store along. */
export function href(path, params = {}) {
  const search = new URLSearchParams();
  if (state.storeId && params.store !== null) search.set('store', state.storeId);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') search.delete(key);
    else search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Changes query parameters in place, for filters that shouldn't re-render the page. */
export function setQuery(params) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  history.replaceState(history.state, '', url);
}

function scrollKey() {
  return history.state?.key || 'root';
}

function rememberScroll() {
  try { sessionStorage.setItem(`trawler.scroll.${scrollKey()}`, String(window.scrollY)); } catch { /* ignore */ }
}

export function navigate(url, { replace = false } = {}) {
  rememberScroll();
  const state = { key: Math.random().toString(36).slice(2) };
  history[replace ? 'replaceState' : 'pushState'](state, '', url);
  return renderRoute({ restore: false });
}

export const refresh = () => renderRoute({ restore: true, keepScroll: true });

async function renderRoute({ restore, keepScroll = false }) {
  const path = location.pathname;
  let match = null;
  for (const candidate of routes) {
    const found = candidate.pattern.exec(path);
    if (found) {
      match = { load: candidate.load, params: Object.fromEntries(candidate.keys.map((k, i) => [k, decodeURIComponent(found[i + 1])])) };
      break;
    }
  }
  match ||= { load: routes.notFound, params: {} };

  controller?.abort();
  controller = new AbortController();
  current?.cleanup?.();
  current = null;

  resolveStore(query());
  const scrollY = keepScroll ? window.scrollY : 0;
  const view = await match.load();
  const ctx = { main, params: match.params, query: query(), signal: controller.signal };
  try {
    current = await view.default(ctx);
  } catch (error) {
    if (error.name === 'AbortError') return;
    throw error;
  }
  if (ctx.signal.aborted) return;

  document.title = current?.title ? `${current.title} · Trawler` : 'Trawler';
  let saved = null;
  try { saved = restore ? Number(sessionStorage.getItem(`trawler.scroll.${scrollKey()}`)) : null; } catch { /* ignore */ }
  window.scrollTo(0, keepScroll ? scrollY : saved || 0);
  if (!firstRender && !keepScroll) main.querySelector('h1')?.focus({ preventScroll: true });
  firstRender = false;
  onRender(path);
}

export function start(root, { notFound, rendered }) {
  main = root;
  routes.notFound = notFound;
  onRender = rendered;
  history.scrollRestoration = 'manual';
  if (!history.state?.key) history.replaceState({ key: 'root' }, '', location.href);

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target || link.hasAttribute('download') || link.dataset.native !== undefined) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/actuator')) return;
    event.preventDefault();
    if (url.pathname === location.pathname && url.search === location.search) return;
    navigate(url.pathname + url.search + url.hash);
  });
  window.addEventListener('popstate', () => renderRoute({ restore: true }));
  window.addEventListener('pagehide', rememberScroll);
  return renderRoute({ restore: true });
}
