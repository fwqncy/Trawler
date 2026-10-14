import { html, render, icon, $, $$, busy } from '../lib/dom.js';
import { get, post } from '../lib/api.js';
import { state, currentStore } from '../lib/state.js';
import { href, navigate, refresh } from '../lib/router.js';
import { money, num, dec, plural, longDate, day, shortDate, ago, signed, signedMoney, pct, REASONS } from '../lib/format.js';
import { hero, stat, level, empty, failure, usageChart, wireCharts, skeletonRows } from '../ui/components.js';
import { countUp, growMeters } from '../lib/motion.js';
import { host } from '../scene/host.js';
import { toast, toastError } from '../ui/toast.js';

export default async function overview({ main, signal }) {
  const store = currentStore();
  if (!store) {
    render(main, html`${hero({ title: 'Trawler', lede: 'Add a store to start tracking stock against par.' })}
      <div class="page"><div class="wrap"><div class="card">${empty({ title: 'No Stores Yet', body: 'Stores live under Settings.', action: html`<a class="btn btn--primary" href="/settings">Add a Store</a>` })}</div></div></div>`);
    return { title: 'Overview' };
  }

  const today = day(state.meta.today);
  render(main, html`
    ${hero({
      tall: true,
      eyebrow: `${longDate(today)} · ${store.name}`,
      title: 'Trawler',
      lede: html`<span data-lede>Reading the shelves at ${store.name}…</span>`,
      meta: html`<span data-meta></span>`,
      actions: html`
        <button type="button" class="btn btn--sky btn--primary" data-action="raise">${icon('truck')}Raise Orders</button>
        <button type="button" class="btn btn--sky" data-action="count">${icon('clipboard')}Start Stock-Take</button>
        <a class="btn btn--sky" href="${href('/stock')}">Open Stock</a>`,
      side: html`<div class="shoal-col">
        <div class="shoal" data-shoal>
          <p class="shoal__hint" aria-hidden="true">Drag to Spin</p>
          <div class="shoal__tip" hidden></div>
          <p class="visually-hidden shoal__live" aria-live="polite"></p>
          <div class="shoal__legend" aria-hidden="true">
            <span><i></i>At or above par</span>
            <span><i class="is-low"></i>Below par, pulled toward the eye</span>
          </div>
        </div>
      </div>`,
    })}
    <div class="page"><div class="wrap" data-body>
      <div class="grid grid--kpis">${Array.from({ length: 5 }, () => html`<span class="skeleton skeleton--tile"></span>`)}</div>
      <div class="section card">${skeletonRows(5, 5)}</div>
    </div></div>`);

  const slot = $('[data-shoal]', main);
  const unmount = host.sky?.mountShoal(slot, { select: (item) => navigate(href('/stock', { item: item.id })) });
  if (!host.sky) {
    render(slot, html`<p class="lede" style="padding-top:40%;text-align:center">Your browser can’t draw the whirlpool, but every line is listed under Stock.</p>`);
  }

  let dash;
  let low;
  let items;
  try {
    [dash, low, items] = await Promise.all([
      get(`/dashboard?storeId=${store.id}`, { signal }),
      get(`/stock/low?storeId=${store.id}`, { signal }),
      get(`/inventory?storeId=${store.id}`, { signal }),
    ]);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    render($('[data-body]', main), html`<div class="card">${failure(error)}</div>`);
    return { title: 'Overview', cleanup: unmount };
  }

  host.sky?.setShoalItems(items);

  render($('[data-lede]', main), html`${low.length
    ? html`<strong>${plural(low.length, 'line')} below par</strong> & drifting toward the eye.`
    : html`<strong>Every line is at or above par.</strong>`}
    ${dash.openOrders
      ? html`${plural(dash.openOrders, 'supplier order')} on the way${dash.overdueOrders ? html`, <strong>${num(dash.overdueOrders)} overdue</strong>` : ''}.`
      : 'No supplier orders open.'}`);
  render($('[data-meta]', main), html`
    <span><strong>${money(dash.stockValue)}</strong> on hand</span>
    <span><strong>${num(dash.lines)}</strong> lines</span>
    <span>Autopilot <strong>${store.autoReorder ? 'on, 5 am' : 'off'}</strong></span>`);

  const counts = dash.orderCounts;
  const last = dash.lastStockTake;
  const usageTotal = dash.usage.reduce((sum, d) => sum + Number(d.value), 0);

  render($('[data-body]', main), html`
    <section class="section" aria-labelledby="kpi-title">
      <h2 class="visually-hidden" id="kpi-title">Key Figures</h2>
      <div class="grid grid--kpis">
        ${stat({ label: 'Stock on hand', glyph: 'clipboard', value: html`<span data-count="${dash.stockValue}" data-format="money">${money(dash.stockValue)}</span>`, meta: `${plural(dash.lines, 'line')} at cost` })}
        ${stat({ label: 'Below par', glyph: 'alert', alert: dash.belowPar > 0, link: href('/stock', { status: 'LOW' }), value: html`<span data-count="${dash.belowPar}">${num(dash.belowPar)}</span>`, meta: dash.lines ? `${pct(dash.belowPar / dash.lines)} of lines` : '' })}
        ${stat({ label: 'Out of stock', glyph: 'empty', alert: dash.outOfStock > 0, link: href('/stock', { status: 'OUT' }), value: html`<span data-count="${dash.outOfStock}">${num(dash.outOfStock)}</span>`, meta: dash.outOfStock ? 'Nothing left on the shelf' : 'Nothing has run out' })}
        ${stat({ label: 'On order', glyph: 'truck', link: href('/orders'), value: html`<span data-count="${dash.onOrderValue}" data-format="money">${money(dash.onOrderValue)}</span>`, meta: `${plural(dash.openOrders, 'open order')}${dash.overdueOrders ? ` · ${dash.overdueOrders} overdue` : ''}` })}
        ${stat({
          label: 'Last stock-take', glyph: 'clipboard', link: last ? href(`/stocktakes/${last.id}`) : href('/stocktakes'),
          value: last ? signedMoney(last.varianceValue) : 'No count yet',
          meta: last ? `${last.reference} · ${shortDate(last.completedAt)} · ${signed(last.varianceUnits)} units` : 'Start one to check the shelves',
        })}
      </div>
    </section>

    <section class="section grid grid--2">
      <div class="card card--flush reveal">
        <div class="card__head">
          <h2 class="h2">Below Par</h2>
          <a class="btn btn--sm" href="${href('/stock', { status: 'LOW' })}">See All Stock</a>
        </div>
        <div class="card__body">
          ${low.length ? html`<div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">Item</th><th scope="col">On Hand / Par</th><th scope="col" class="num">Short</th>
              <th scope="col" class="num hide-sm">On Order</th><th scope="col" class="num">Cover</th><th scope="col" class="hide-sm">Supplier</th></tr></thead>
            <tbody>${low.map((item) => html`<tr class="clickable">
              <td><span class="item-name"><a class="row-link" href="${href('/stock', { item: item.id })}">${item.name}</a><small class="mono">${item.sku}</small></span></td>
              <td>${level(item)}</td>
              <td class="num">${num(item.shortfall)}</td>
              <td class="num hide-sm">${item.onOrder ? num(item.onOrder) : html`<span class="muted">—</span>`}</td>
              <td class="num">${item.daysOfCover == null ? html`<span class="muted">—</span>` : `${dec(item.daysOfCover)} d`}</td>
              <td class="hide-sm">${item.supplier}</td>
            </tr>`)}</tbody></table></div>`
            : empty({ glyph: 'check', title: 'Nothing Below Par', body: `Every line at ${store.name} is at or above par.` })}
        </div>
        <div class="card__foot"><span class="muted">Raising orders tops each line back to par in whole cases, net of stock already on the way.</span></div>
      </div>

      <div class="stack">
        <div class="card reveal">
          <div class="card__head"><h2 class="h3">Usage, Last 14 Days</h2><span class="muted num">${money(usageTotal)}</span></div>
          <div class="card__body">${usageChart(dash.usage, { today: state.meta.today })}</div>
        </div>
        <div class="card reveal">
          <div class="card__head"><h2 class="h3">Order Pipeline</h2></div>
          <div class="card__body">
            <dl class="kv">
              ${[['DRAFT', 'Drafts to check'], ['SENT', 'Sent, awaiting delivery'], ['PARTIALLY_RECEIVED', 'Part delivered']].map(([status, label]) => html`
                <dt><a class="linkish" href="${href('/orders', { status })}">${label}</a></dt><dd class="num">${num(counts[status])}</dd>`)}
              <dt>Overdue</dt><dd class="num ${dash.overdueOrders ? 'overdue' : ''}">${num(dash.overdueOrders)}</dd>
            </dl>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="card card--flush reveal">
        <div class="card__head"><h2 class="h2">Recent Activity</h2><a class="btn btn--sm" href="${href('/movements')}">Open Ledger</a></div>
        <div class="card__body">
          ${dash.recent.length ? html`<ul class="activity" role="list">${dash.recent.map((m) => html`<li>
            <span class="pill">${REASONS[m.reason]}</span>
            <span><strong>${m.productName}</strong> <span class="muted">${m.reference || m.note || ''}</span></span>
            <span class="row"><span class="delta ${m.delta > 0 ? 'delta--up' : 'delta--down'}">${signed(m.delta)} ${m.unit}</span>
              <time class="muted" datetime="${m.occurredAt}">${ago(m.occurredAt)}</time></span>
          </li>`)}</ul>` : empty({ title: 'No Movements Yet', body: 'Deliveries, usage & counts will show up here.' })}
        </div>
      </div>
    </section>`);

  wireCharts(main);
  growMeters(main);
  $$('[data-count]', main).forEach((el) => {
    const value = Number(el.dataset.count);
    countUp(el, value, el.dataset.format === 'money' ? money : (v) => num(Math.round(v)));
  });

  main.querySelector('[data-action="raise"]').addEventListener('click', (event) => busy(event.currentTarget, async () => {
    try {
      const raised = await post('/orders/auto', { storeId: store.id });
      if (!raised.length) {
        toast('Everything below par is already on order.');
        return;
      }
      toast(`Drafted ${plural(raised.length, 'order')}: ${raised.map((o) => o.supplierName).join(', ')}.`, {
        action: { label: 'Review', run: () => navigate(href('/orders', { status: 'DRAFT' })) },
      });
      refresh();
    } catch (error) {
      toastError(error);
    }
  }));
  main.querySelector('[data-action="count"]').addEventListener('click', (event) => busy(event.currentTarget, async () => {
    try {
      const take = await post('/stocktakes', { storeId: store.id, blind: true });
      navigate(href(`/stocktakes/${take.id}`));
    } catch (error) {
      toastError(error);
      if (error.status === 409) navigate(href('/stocktakes'));
    }
  }));

  return { title: 'Overview', cleanup: unmount };
}
