import { html, render, icon, raw, $, on, busy, download } from '../lib/dom.js';
import { get } from '../lib/api.js';
import { state, currentStore } from '../lib/state.js';
import { href, setQuery, query } from '../lib/router.js';
import { num, signed, stamp, REASONS } from '../lib/format.js';
import { hero, empty, failure, skeletonRows } from '../ui/components.js';

const PAGE = 50;

export default async function movements({ main, signal }) {
  const store = currentStore();
  render(main, html`
    ${hero({
      crumbs: [['Overview', href('/')], ['Ledger']],
      title: 'Ledger',
      lede: `Every change to on-hand at ${store.name}, newest first. Each balance ties back to the shelf.`,
    })}
    <div class="page"><div class="wrap"><div class="card card--flush reveal" data-card>${skeletonRows(10, 7)}</div></div></div>`);

  const card = $('[data-card]', main);
  let rows = [];
  let page = 0;
  let done = false;
  let items = [];

  const filters = () => ({ reason: query().get('reason') || '', sku: query().get('sku') || '' });

  async function load(reset) {
    const f = filters();
    if (reset) { rows = []; page = 0; done = false; }
    const params = new URLSearchParams({ storeId: state.storeId, page, size: PAGE });
    if (f.reason) params.set('reason', f.reason);
    if (f.sku) params.set('sku', f.sku);
    const next = await get(`/movements?${params}`, { signal });
    rows = rows.concat(next);
    done = next.length < PAGE;
    page++;
  }

  function draw() {
    const f = filters();
    render(card, html`
      <div class="toolbar">
        <label><span class="visually-hidden">Reason</span>
          <select class="select select--inline" name="reason"><option value="">All reasons</option>
            ${Object.entries(REASONS).map(([key, label]) => html`<option value="${key}" ${key === f.reason ? raw('selected') : ''}>${label}</option>`)}</select></label>
        <label><span class="visually-hidden">SKU</span>
          <select class="select select--inline" name="sku"><option value="">All items</option>
            ${items.map((i) => html`<option value="${i.sku}" ${i.sku === f.sku ? raw('selected') : ''}>${i.sku} · ${i.name}</option>`)}</select></label>
        <button type="button" class="btn btn--sm" data-export>${icon('download')}Export Shown</button>
        <span class="toolbar__note">${num(rows.length)} movements shown</span>
      </div>
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <caption class="visually-hidden">Stock ledger for ${store.name}</caption>
        <thead><tr><th scope="col">When</th><th scope="col">SKU</th><th scope="col">Item</th><th scope="col">Reason</th>
          <th scope="col" class="num">Change</th><th scope="col" class="num">Balance</th><th scope="col">Reference</th><th scope="col">Note</th></tr></thead>
        <tbody>${rows.map((m) => html`<tr>
          <td><time datetime="${m.occurredAt}">${stamp(m.occurredAt)}</time></td>
          <td class="mono">${m.sku}</td><td>${m.productName}</td>
          <td><span class="pill">${REASONS[m.reason]}</span></td>
          <td class="num ${m.delta > 0 ? 'delta--up' : ''}">${signed(m.delta)}</td>
          <td class="num">${num(m.balanceAfter)}</td>
          <td class="mono">${reference(m.reference)}</td>
          <td class="muted">${m.note ?? ''}</td>
        </tr>`)}</tbody></table></div>
        <div class="card__foot"><span class="muted">${done ? 'That’s the start of the ledger.' : ''}</span>
          ${done ? '' : html`<button type="button" class="btn btn--sm" data-more>Load ${PAGE} More</button>`}</div>`
        : empty({ title: 'No Movements Match', body: 'Try another reason or item.', action: html`<a class="btn" href="${href('/movements')}">Clear Filters</a>` })}`);
  }

  function reference(ref) {
    if (!ref) return '';
    const match = /^(PO|ST)-0*(\d+)$/.exec(ref);
    if (!match) return ref;
    return html`<a class="linkish" href="${href(match[1] === 'PO' ? `/orders/${match[2]}` : `/stocktakes/${match[2]}`)}">${ref}</a>`;
  }

  try {
    [items] = await Promise.all([get(`/inventory?storeId=${state.storeId}`, { signal }), load(true)]);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    render(card, failure(error));
    return { title: 'Ledger' };
  }
  draw();

  const offs = [
    on(card, 'change', 'select', async (e, select) => {
      setQuery({ [select.name]: select.value || null });
      try { await load(true); } catch (error) { render(card, failure(error)); return; }
      draw();
      card.querySelector(`[name="${select.name}"]`)?.focus();
    }),
    on(card, 'click', '[data-more]', (e, button) => busy(button, async () => {
      await load(false);
      draw();
      card.querySelector('[data-more]')?.focus();
    })),
    on(card, 'click', '[data-export]', () => {
      const csv = [['When', 'SKU', 'Item', 'Reason', 'Change', 'Balance', 'Reference', 'Note'],
        ...rows.map((m) => [m.occurredAt, m.sku, m.productName, m.reason, m.delta, m.balanceAfter, m.reference ?? '', m.note ?? ''])]
        .map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
      download(`ledger-${store.code}-${state.meta.today}.csv`, csv);
    }),
  ];

  return { title: 'Ledger', cleanup: () => offs.forEach((off) => off()) };
}
