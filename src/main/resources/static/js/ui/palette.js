// ⌘K: jump to any page, SKU, order or supplier, or run a common action, without the mouse.

import { html, render, icon, esc } from '../lib/dom.js';
import { get } from '../lib/api.js';
import { state } from '../lib/state.js';
import { href, navigate } from '../lib/router.js';
import { reducedMotion } from '../lib/motion.js';

const PAGES = [
  ['Overview', '/', 'fish'], ['Stock', '/stock', 'clipboard'], ['Below Par', '/stock?status=LOW', 'alert'],
  ['Orders', '/orders', 'truck'], ['Stock-Takes', '/stocktakes', 'clipboard'], ['Suppliers', '/suppliers', 'truck'],
  ['Products', '/products', 'clipboard'], ['Ledger', '/movements', 'arrows'], ['Settings & Themes', '/settings', 'palette'],
];

let cache = { storeId: null, at: 0, data: null };

async function sources() {
  if (cache.data && cache.storeId === state.storeId && Date.now() - cache.at < 30000) return cache.data;
  const [items, orders, suppliers] = await Promise.all([
    get(`/inventory?storeId=${state.storeId}`),
    get(`/orders?storeId=${state.storeId}`),
    get('/suppliers'),
  ]);
  cache = { storeId: state.storeId, at: Date.now(), data: { items, orders: orders.slice(0, 40), suppliers } };
  return cache.data;
}

export function openPalette(actions = []) {
  if (document.querySelector('.palette[open]')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'palette';
  dialog.setAttribute('aria-label', 'Search & commands');
  render(dialog, html`
    <div class="modal__panel">
      <div class="palette__input">
        ${icon('search')}
        <input type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list"
               aria-label="Search pages, SKUs, orders & suppliers" placeholder="Search SKUs, orders, suppliers…"
               autocomplete="off" spellcheck="false">
        <kbd class="kbd" style="color:var(--ink-3);border-color:var(--line-strong)">esc</kbd>
      </div>
      <ul class="palette__list" id="palette-list" role="listbox" aria-label="Results"></ul>
    </div>`);
  document.body.append(dialog);
  const input = dialog.querySelector('input');
  const list = dialog.querySelector('ul');
  let results = [];
  let active = 0;
  let data = null;

  function score(text, q) {
    const t = text.toLowerCase();
    if (!q) return 1;
    if (t.startsWith(q)) return 3;
    if (t.includes(q)) return 2;
    let i = 0;
    for (const ch of t) if (ch === q[i]) i++;
    return i === q.length ? 1 : 0;
  }

  function build() {
    const q = input.value.trim().toLowerCase();
    let groups = [];
    const add = (label, entries) => {
      const ranked = entries
        .map((e) => ({ ...e, s: Math.max(score(e.label, q), score(e.hint || '', q) * 0.9) }))
        .filter((e) => e.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, q ? 8 : 5);
      if (ranked.length) groups.push([label, ranked]);
    };
    add('Actions', actions.map((a) => ({ label: a.label, hint: a.hint, icon: a.icon || 'sparkle', run: a.run })));
    add('Pages', PAGES.map(([label, path, ic]) => ({ label, icon: ic, run: () => navigate(href(path.split('?')[0], Object.fromEntries(new URLSearchParams(path.split('?')[1] || '')))) })));
    if (data) {
      add('Stock', data.items.map((item) => ({
        label: item.name, hint: item.sku, meta: `${item.onHand}/${item.par}`, icon: item.status === 'OK' ? 'check' : 'alert',
        run: () => navigate(href('/stock', { item: item.id })),
      })));
      add('Orders', data.orders.map((order) => ({
        label: `${order.reference} · ${order.supplierName}`, hint: order.status.replace('_', ' ').toLowerCase(), icon: 'truck',
        run: () => navigate(href(`/orders/${order.id}`)),
      })));
      add('Suppliers', data.suppliers.map((s) => ({ label: s.name, hint: s.email, icon: 'truck', run: () => navigate(href('/suppliers', { q: s.name })) })));
    }
    if (q) {
      // Real substring matches beat loose letter-order matches; the best group leads.
      const strong = groups.some(([, entries]) => entries.some((e) => e.s >= 1.8));
      if (strong) groups = groups.map(([label, entries]) => [label, entries.filter((e) => e.s >= 1.8)]).filter(([, entries]) => entries.length);
      groups.sort((a, b) => b[1][0].s - a[1][0].s);
    }
    results = groups.flatMap(([, entries]) => entries);
    active = Math.min(active, Math.max(0, results.length - 1));
    let index = 0;
    list.innerHTML = groups.length ? groups.map(([label, entries]) => `
      <li role="presentation" class="palette__group">${esc(label)}</li>
      ${entries.map((e) => {
        const i = index++;
        return `<li role="option" id="palette-opt-${i}" class="palette__item" data-index="${i}" aria-selected="${i === active}">
          <svg aria-hidden="true" width="18" height="18"><use href="#i-${esc(e.icon)}"/></svg>
          <span>${esc(e.label)}</span>
          ${e.hint ? `<span class="mono">${esc(e.hint)}</span>` : ''}
          ${e.meta ? `<small>${esc(e.meta)}</small>` : ''}
        </li>`;
      }).join('')}`).join('') : `<li class="palette__empty" role="presentation">Nothing matches “${esc(input.value)}”.</li>`;
    input.setAttribute('aria-activedescendant', results.length ? `palette-opt-${active}` : '');
  }

  function move(step) {
    if (!results.length) return;
    active = (active + step + results.length) % results.length;
    list.querySelectorAll('[role="option"]').forEach((el) => el.setAttribute('aria-selected', String(Number(el.dataset.index) === active)));
    input.setAttribute('aria-activedescendant', `palette-opt-${active}`);
    list.querySelector(`#palette-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }

  function close() {
    dialog.close();
    dialog.remove();
  }

  function run(index) {
    const entry = results[index];
    if (!entry) return;
    close();
    entry.run();
  }

  input.addEventListener('input', () => { active = 0; build(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter') { event.preventDefault(); run(active); }
  });
  list.addEventListener('click', (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) run(Number(option.dataset.index));
  });
  list.addEventListener('pointermove', (event) => {
    const option = event.target.closest('[role="option"]');
    if (option && Number(option.dataset.index) !== active) move(Number(option.dataset.index) - active);
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => dialog.remove());

  dialog.showModal();
  build();
  input.focus();
  if (window.gsap && !reducedMotion.matches) {
    window.gsap.from(dialog.querySelector('.modal__panel'), { y: -10, opacity: 0, scale: 0.98, duration: 0.35, ease: 'expo.out' });
  }
  sources().then((loaded) => { data = loaded; if (dialog.isConnected) build(); }).catch(() => {});
}
