import { html, render, icon, raw, $, on } from '../lib/dom.js';
import { get, post, patch } from '../lib/api.js';
import { state, currentStore } from '../lib/state.js';
import { href, setQuery, query } from '../lib/router.js';
import { money, num, dec, plural, stamp, signed, REASONS, qty } from '../lib/format.js';
import { hero, level, stockPill, empty, failure, tabs, skeletonRows, balanceChart, storeOptions } from '../ui/components.js';
import { openDialog, field } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { growMeters } from '../lib/motion.js';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'LOW', label: 'Below Par' },
  { key: 'OUT', label: 'Out' },
  { key: 'OK', label: 'At Par' },
];

const SORTS = {
  sku: (a, b) => a.sku.localeCompare(b.sku),
  name: (a, b) => a.name.localeCompare(b.name),
  level: (a, b) => ratio(a) - ratio(b),
  short: (a, b) => a.shortfall - b.shortfall,
  cover: (a, b) => (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity),
  value: (a, b) => a.value - b.value,
};
const ratio = (item) => (item.par ? item.onHand / item.par : 2);

export default async function stock({ main, signal }) {
  const store = currentStore();
  render(main, html`
    ${hero({
      crumbs: [['Overview', href('/')], ['Stock']],
      title: 'Stock',
      lede: html`<span data-lede>Live on-hand against par at ${store?.name ?? 'this store'}.</span>`,
      actions: html`
        <button type="button" class="btn btn--sky btn--primary" data-action="adjust">${icon('edit')}Record Usage or Waste</button>
        <button type="button" class="btn btn--sky" data-action="transfer">${icon('arrows')}Transfer</button>
        <a class="btn btn--sky" href="/api/inventory/export?storeId=${state.storeId}" download>${icon('download')}Export CSV</a>
        <button type="button" class="btn btn--sky" data-action="print">${icon('print')}Print Count Sheet</button>`,
    })}
    <div class="page"><div class="wrap">
      <p class="print-only"><strong>${store?.name}</strong> count sheet · ${state.meta.today}</p>
      <div class="card card--flush reveal" data-card>${skeletonRows(8, 7)}</div>
    </div></div>`);

  const card = $('[data-card]', main);
  let items;
  try {
    items = await get(`/inventory?storeId=${state.storeId}`, { signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    render(card, failure(error));
    return { title: 'Stock' };
  }

  const categories = [...new Set(items.map((i) => i.category))].sort();
  const value = items.reduce((sum, i) => sum + Number(i.value), 0);
  const lowCount = items.filter((i) => i.status !== 'OK').length;
  render($('[data-lede]', main), html`${store.name}: ${plural(items.length, 'line')}, <strong>${num(lowCount)} below par</strong>, ${money(value)} on hand.`);

  const view = () => {
    const q = query();
    return { status: q.get('status') || '', search: q.get('q') || '', category: q.get('cat') || '', sort: q.get('sort') || 'sku', dir: q.get('dir') || 'asc' };
  };

  function rows() {
    const v = view();
    const needle = v.search.trim().toLowerCase();
    const filtered = items.filter((item) =>
      (!v.status || (v.status === 'LOW' ? item.status !== 'OK' : item.status === v.status))
      && (!v.category || item.category === v.category)
      && (!needle || `${item.sku} ${item.name} ${item.supplier} ${item.bin ?? ''}`.toLowerCase().includes(needle)));
    const sorter = SORTS[v.sort] || SORTS.sku;
    filtered.sort((a, b) => sorter(a, b) * (v.dir === 'desc' ? -1 : 1));
    return filtered;
  }

  function header(key, label, className = '') {
    const v = view();
    const sorted = v.sort === key;
    return html`<th scope="col" class="${className}" ${sorted ? raw(`aria-sort="${v.dir === 'desc' ? 'descending' : 'ascending'}"`) : ''}>
      <button type="button" data-sort="${key}">${label}</button></th>`;
  }

  function draw({ keepFocus } = {}) {
    const v = view();
    const list = rows();
    const count = (key) => items.filter((item) => (!key ? true : key === 'LOW' ? item.status !== 'OK' : item.status === key)).length;
    const focusedName = keepFocus ? document.activeElement?.name : null;
    render(card, html`
      ${tabs(FILTERS.map((f) => ({ ...f, count: count(f.key), href: href('/stock', { status: f.key || null, q: v.search || null, cat: v.category || null }), current: f.key === v.status })), 'Filter stock')}
      <div class="toolbar">
        <label class="search">
          <span class="visually-hidden">Search stock</span>
          ${icon('search')}
          <input class="input" type="search" name="q" value="${v.search}" placeholder="Search SKU, item, supplier or bin…" autocomplete="off" spellcheck="false" data-page-search>
        </label>
        <label>
          <span class="visually-hidden">Category</span>
          <select class="select select--inline" name="cat">
            <option value="">All categories</option>
            ${categories.map((c) => html`<option ${c === v.category ? raw('selected') : ''}>${c}</option>`)}
          </select>
        </label>
        <span class="toolbar__note" aria-live="polite">Showing ${num(list.length)} of ${num(items.length)}</span>
      </div>
      ${list.length ? html`<div class="table-wrap"><table class="table">
        <caption class="visually-hidden">Stock at ${store.name}</caption>
        <thead><tr>
          ${header('sku', 'SKU', 'hide-sm')}${header('name', 'Item')}<th scope="col" class="hide-sm">Bin</th>${header('level', 'On Hand / Par')}
          ${header('short', 'Short', 'num')}<th scope="col" class="num hide-sm">On Order</th>${header('cover', 'Cover', 'num hide-sm')}
          ${header('value', 'Value', 'num hide-sm')}<th scope="col">Status</th>
        </tr></thead>
        <tbody>${list.map((item) => html`<tr class="clickable" data-id="${item.id}">
          <td class="mono hide-sm">${item.sku}</td>
          <td><span class="item-name"><a class="row-link" href="${href('/stock', { ...Object.fromEntries(query()), item: item.id })}" data-open="${item.id}">${item.name}</a><small>${item.category} · ${item.supplier}</small></span></td>
          <td class="shrink hide-sm">${item.bin ?? html`<span class="muted">—</span>`}</td>
          <td>${level(item)}</td>
          <td class="num">${item.shortfall ? num(item.shortfall) : html`<span class="muted">—</span>`}</td>
          <td class="num hide-sm">${item.onOrder ? num(item.onOrder) : html`<span class="muted">—</span>`}</td>
          <td class="num hide-sm">${item.daysOfCover == null ? html`<span class="muted">—</span>` : `${dec(item.daysOfCover)} d`}</td>
          <td class="num hide-sm">${money(item.value)}</td>
          <td>${stockPill(item.status)}</td>
        </tr>`)}</tbody></table></div>`
        : empty({ title: 'No Matching Stock', body: v.search ? `Nothing matches “${v.search}”.` : 'No lines in this view.', action: html`<a class="btn" href="${href('/stock')}">Clear Filters</a>` })}`);
    if (focusedName) card.querySelector(`[name="${focusedName}"]`)?.focus();
    const input = card.querySelector('[name="q"]');
    if (focusedName === 'q' && input) input.setSelectionRange(input.value.length, input.value.length);
  }

  draw();
  growMeters(card);

  let typing;
  const offs = [
    on(card, 'input', '[name="q"]', (event) => {
      clearTimeout(typing);
      typing = setTimeout(() => { setQuery({ q: event.target.value.trim() || null }); draw({ keepFocus: true }); }, 140);
    }),
    on(card, 'change', '[name="cat"]', (event) => { setQuery({ cat: event.target.value || null }); draw({ keepFocus: true }); }),
    on(card, 'click', '[data-sort]', (event, button) => {
      const v = view();
      const key = button.dataset.sort;
      setQuery({ sort: key, dir: v.sort === key && v.dir === 'asc' ? 'desc' : 'asc' });
      draw();
      card.querySelector(`[data-sort="${key}"]`)?.focus();
    }),
    on(card, 'click', '[data-tab]', (event, tab) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      setQuery({ status: tab.dataset.tab || null });
      draw();
      card.querySelector(`[data-tab="${tab.dataset.tab}"]`)?.focus();
    }),
    on(card, 'click', 'tr.clickable', (event, row) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      openItem(Number(row.dataset.id));
    }),
  ];

  async function reload() {
    items = await get(`/inventory?storeId=${state.storeId}`);
    draw();
  }

  async function openItem(id) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setQuery({ item: id });
    await itemDrawer(item, { onChange: reload });
    setQuery({ item: null });
  }

  main.querySelector('[data-action="adjust"]').addEventListener('click', () => adjustDialog(items, { onDone: reload }));
  main.querySelector('[data-action="transfer"]').addEventListener('click', () => transferDialog(items, { onDone: reload }));
  main.querySelector('[data-action="print"]').addEventListener('click', () => window.print());

  const linked = Number(query().get('item'));
  if (linked) openItem(linked);

  return { title: 'Stock', cleanup: () => offs.forEach((off) => off()) };
}

async function itemDrawer(item, { onChange }) {
  let current = item;
  const { dialog, closed } = openDialog({
    drawer: true,
    footer: false,
    title: item.name,
    description: `${item.sku} · ${item.supplier} · ${item.bin ?? 'No bin'}`,
    body: html`<div data-drawer>${skeletonRows(4, 3)}</div>`,
  });
  const box = $('[data-drawer]', dialog);

  async function draw() {
    let history;
    try {
      [current, history] = await Promise.all([get(`/inventory/${item.id}`), get(`/inventory/${item.id}/movements`)]);
    } catch (error) {
      render(box, failure(error));
      return;
    }
    render(box, html`
      <div class="grid" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">
        ${[['On hand', num(current.onHand)], ['Par', num(current.par)], ['On order', num(current.onOrder)], ['Cover', current.daysOfCover == null ? '—' : `${dec(current.daysOfCover)} d`]]
          .map(([label, value]) => html`<div><div class="muted" style="font-size:12.5px">${label}</div><div style="font-size:22px;font-weight:600">${value}</div></div>`)}
      </div>
      ${level(current)}
      <p class="row">${stockPill(current.status)}<span class="muted">Using about ${dec(current.dailyUsage)} ${current.unit} a day over the last 14 days.</span></p>
      ${balanceChart(history, current.par)}

      <form class="card" data-move style="padding:14px;display:grid;gap:12px">
        <h3 class="h3">Record a Movement</h3>
        <div class="segmented" role="group" aria-label="Reason">
          ${[['USAGE', 'Usage'], ['WASTE', 'Waste'], ['ADJUSTMENT', 'Adjust']].map(([key, label], i) => html`
            <button type="button" data-reason="${key}" aria-pressed="${i === 0}">${label}</button>`)}
        </div>
        <div class="fields">
          ${field({ label: 'Quantity', name: 'quantity', type: 'number', value: '1', hint: 'Usage & waste take stock away. Adjust takes a signed amount.', attrs: 'inputmode="numeric" step="1"' })}
          ${field({ label: 'Note', name: 'note', hint: 'Optional', attrs: 'autocomplete="off" maxlength="255"' })}
        </div>
        <div class="row"><button type="submit" class="btn btn--primary">Record</button><span class="muted" data-move-note></span></div>
      </form>

      <form class="card" data-level style="padding:14px;display:grid;gap:12px">
        <h3 class="h3">Par & Bin</h3>
        <div class="fields">
          ${field({ label: 'Par', name: 'par', type: 'number', value: current.par, hint: `Ordered in cases of ${current.packSize}`, attrs: 'inputmode="numeric" min="0" step="1"' })}
          ${field({ label: 'Bin', name: 'bin', value: current.bin ?? '', attrs: 'autocomplete="off" maxlength="40"' })}
        </div>
        <div><button type="submit" class="btn">Save Par & Bin</button></div>
      </form>

      <div class="stack">
        <h3 class="h3">History</h3>
        ${history.length ? html`<div class="table-wrap"><table class="table">
          <thead><tr><th scope="col">When</th><th scope="col">Reason</th><th scope="col" class="num">Change</th><th scope="col" class="num">Balance</th><th scope="col">Ref</th></tr></thead>
          <tbody>${history.slice(0, 20).map((m) => html`<tr>
            <td>${stamp(m.occurredAt)}</td><td><span class="pill">${REASONS[m.reason]}</span></td>
            <td class="num ${m.delta > 0 ? 'delta--up' : ''}">${signed(m.delta)}</td><td class="num">${num(m.balanceAfter)}</td>
            <td class="mono">${m.reference ?? ''}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No movements yet.</p>`}
      </div>`);

    let reason = 'USAGE';
    const moveForm = $('[data-move]', box);
    moveForm.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-reason]');
      if (!choice) return;
      reason = choice.dataset.reason;
      moveForm.querySelectorAll('[data-reason]').forEach((b) => b.setAttribute('aria-pressed', String(b === choice)));
    });
    moveForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(moveForm);
      const amount = Math.trunc(Number(data.get('quantity')));
      const delta = reason === 'ADJUSTMENT' ? amount : -Math.abs(amount);
      const button = event.submitter;
      button.setAttribute('aria-busy', 'true');
      try {
        await post('/inventory/adjustments', { storeId: current.storeId, sku: current.sku, delta, reason, note: data.get('note') });
        toast(`${REASONS[reason]} of ${qty(Math.abs(delta), current.unit)} recorded for ${current.sku}.`, {
          action: {
            label: 'Undo',
            run: async () => {
              try {
                await post('/inventory/adjustments', { storeId: current.storeId, sku: current.sku, delta: -delta, reason: 'ADJUSTMENT', note: `Undo ${REASONS[reason].toLowerCase()}` });
                toast('Undone.');
                await onChange();
                if (dialog.isConnected) draw();
              } catch (error) { toastError(error); }
            },
          },
        });
        await onChange();
        await draw();
      } catch (error) {
        toastError(error);
        button.removeAttribute('aria-busy');
      }
    });

    const levelForm = $('[data-level]', box);
    levelForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(levelForm);
      const button = event.submitter;
      button.setAttribute('aria-busy', 'true');
      try {
        await patch(`/inventory/${current.id}`, { par: Number(data.get('par')), bin: data.get('bin') });
        toast(`Par for ${current.sku} is now ${num(Number(data.get('par')))}.`);
        await onChange();
        await draw();
      } catch (error) {
        toastError(error);
        button.removeAttribute('aria-busy');
      }
    });
  }

  draw();
  return closed;
}

function adjustDialog(items, { onDone }) {
  openDialog({
    title: 'Record Usage or Waste',
    description: 'Takes stock off the shelf & writes it to the ledger.',
    submitLabel: 'Record',
    body: html`<div class="fields">
      ${field({ label: 'Item', name: 'sku', wide: true, input: html`<select class="select" id="__ID__" name="sku" required>${items.map((i) => html`<option value="${i.sku}">${i.sku} · ${i.name} (${i.onHand} ${i.unit})</option>`)}</select>` })}
      ${field({ label: 'Reason', name: 'reason', input: html`<select class="select" id="__ID__" name="reason"><option value="USAGE">Usage</option><option value="WASTE">Waste</option><option value="ADJUSTMENT">Adjustment (signed)</option></select>` })}
      ${field({ label: 'Quantity', name: 'delta', type: 'number', value: '1', required: true, attrs: 'inputmode="numeric" step="1"' })}
      ${field({ label: 'Note', name: 'note', wide: true, hint: 'Optional, e.g. “Dropped tray at lunch”', attrs: 'autocomplete="off" maxlength="255"' })}
    </div>`,
    async onSubmit(data) {
      const reason = data.get('reason');
      const amount = Math.trunc(Number(data.get('delta')));
      const delta = reason === 'ADJUSTMENT' ? amount : -Math.abs(amount);
      const item = await post('/inventory/adjustments', { storeId: state.storeId, sku: data.get('sku'), delta, reason, note: data.get('note') });
      toast(`${item.sku} is now at ${qty(item.onHand, item.unit)}.`);
      await onDone();
    },
  });
}

function transferDialog(items, { onDone }) {
  if (state.stores.length < 2) {
    toast('Add a second store before transferring stock.');
    return;
  }
  openDialog({
    title: 'Transfer Stock',
    description: `Moves stock out of ${currentStore().name} & into another store, with a ledger entry on each side.`,
    submitLabel: 'Transfer',
    body: html`<div class="fields">
      ${field({ label: 'Item', name: 'sku', wide: true, input: html`<select class="select" id="__ID__" name="sku" required>${items.filter((i) => i.onHand > 0).map((i) => html`<option value="${i.sku}">${i.sku} · ${i.name} (${i.onHand} ${i.unit})</option>`)}</select>` })}
      ${field({ label: 'To store', name: 'toStoreId', input: html`<select class="select" id="__ID__" name="toStoreId">${storeOptions(state.stores, null, { exclude: state.storeId })}</select>` })}
      ${field({ label: 'Quantity', name: 'quantity', type: 'number', value: '1', required: true, attrs: 'inputmode="numeric" min="1" step="1"' })}
      ${field({ label: 'Note', name: 'note', wide: true, hint: 'Optional', attrs: 'autocomplete="off" maxlength="255"' })}
    </div>`,
    async onSubmit(data) {
      await post('/inventory/transfers', {
        fromStoreId: state.storeId, toStoreId: Number(data.get('toStoreId')), sku: data.get('sku'),
        quantity: Math.trunc(Number(data.get('quantity'))), note: data.get('note'),
      });
      const to = state.stores.find((s) => s.id === Number(data.get('toStoreId')));
      toast(`Moved ${num(Number(data.get('quantity')))} ${data.get('sku')} to ${to?.name}.`);
      await onDone();
    },
  });
}
