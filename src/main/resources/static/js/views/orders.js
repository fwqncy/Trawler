import { html, render, icon, raw, $, on, busy, download } from '../lib/dom.js';
import { get, post } from '../lib/api.js';
import { state, currentStore } from '../lib/state.js';
import { href, setQuery, query, navigate } from '../lib/router.js';
import { money, num, plural, shortDate, daysBetween, ORDER_STATUS } from '../lib/format.js';
import { hero, orderPill, empty, failure, tabs, skeletonRows } from '../ui/components.js';
import { openDialog, field, confirmDialog } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';

const TABS = [{ key: '', label: 'All' }, ...Object.entries(ORDER_STATUS).map(([key, s]) => ({ key, label: s.label }))];
const OPEN = ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED'];

export default async function orders({ main, signal }) {
  const store = currentStore();
  render(main, html`
    ${hero({
      crumbs: [['Overview', href('/')], ['Orders']],
      title: 'Purchase Orders',
      lede: html`<span data-lede>Supplier orders for ${store.name}.</span>`,
      actions: html`
        <button type="button" class="btn btn--sky btn--primary" data-action="raise">${icon('sparkle')}Raise All Below Par</button>
        <button type="button" class="btn btn--sky" data-action="new">${icon('plus')}New Order</button>`,
    })}
    <div class="page"><div class="wrap"><div class="card card--flush reveal" data-card>${skeletonRows(8, 8)}</div></div></div>`);

  const card = $('[data-card]', main);
  let list;
  let suppliers;
  try {
    [list, suppliers] = await Promise.all([get(`/orders?storeId=${state.storeId}`, { signal }), get('/suppliers', { signal })]);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    render(card, failure(error));
    return { title: 'Orders' };
  }

  const selected = new Set();
  const today = state.meta.today;
  const overdueDays = (o) => (o.expectedOn && (o.status === 'SENT' || o.status === 'PARTIALLY_RECEIVED') ? daysBetween(o.expectedOn, today) : 0);

  function lede() {
    const open = list.filter((o) => OPEN.includes(o.status));
    const outstanding = open.reduce((sum, o) => sum + o.lines.reduce((s, l) => s + l.outstanding * l.unitCost, 0), 0);
    const late = open.filter((o) => overdueDays(o) > 0).length;
    render($('[data-lede]', main), html`<strong>${plural(open.length, 'open order')}</strong> worth ${money(outstanding)} for ${store.name}${late ? html`, <strong>${num(late)} overdue</strong>` : ''}.`);
  }

  function draw({ keepFocus } = {}) {
    const q = query();
    const status = q.get('status') || '';
    const search = (q.get('q') || '').trim().toLowerCase();
    const rows = list.filter((o) => (!status || o.status === status)
      && (!search || `${o.reference} ${o.supplierName} ${o.notes ?? ''}`.toLowerCase().includes(search)));
    const drafts = [...selected].map((id) => list.find((o) => o.id === id)).filter((o) => o?.status === 'DRAFT');
    const allChecked = rows.length > 0 && rows.every((o) => selected.has(o.id));
    render(card, html`
      ${tabs(TABS.map((t) => ({ ...t, count: list.filter((o) => !t.key || o.status === t.key).length, href: href('/orders', { status: t.key || null, q: q.get('q') }), current: t.key === status })), 'Filter orders')}
      <div class="toolbar">
        <label class="search">
          <span class="visually-hidden">Search orders</span>${icon('search')}
          <input class="input" type="search" name="q" value="${q.get('q') || ''}" placeholder="Search number or supplier…" autocomplete="off" spellcheck="false" data-page-search>
        </label>
        <button type="button" class="btn btn--sm" data-bulk="send" ${drafts.length ? '' : raw('aria-disabled="true"')}>${icon('send')}Send ${drafts.length ? plural(drafts.length, 'Draft') : 'Drafts'}</button>
        <button type="button" class="btn btn--sm" data-bulk="export">${icon('download')}Export ${selected.size ? `${num(selected.size)} Selected` : 'View'}</button>
        <span class="toolbar__note" aria-live="polite">${selected.size ? `${num(selected.size)} selected` : `${num(rows.length)} orders`}</span>
      </div>
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <caption class="visually-hidden">Purchase orders for ${store.name}</caption>
        <thead><tr>
          <th scope="col" class="check-col"><input type="checkbox" data-check-all aria-label="Select all shown orders" ${allChecked ? raw('checked') : ''}></th>
          <th scope="col">Number</th><th scope="col">Supplier</th><th scope="col">Created</th><th scope="col">Expected</th>
          <th scope="col">Overdue By</th><th scope="col" class="num">Lines</th><th scope="col" class="num">Total</th><th scope="col">Status</th>
        </tr></thead>
        <tbody>${rows.map((o) => {
          const late = overdueDays(o);
          return html`<tr class="clickable ${selected.has(o.id) ? 'is-selected' : ''}" data-id="${o.id}">
            <td class="check-col"><input type="checkbox" data-check="${o.id}" aria-label="Select ${o.reference}" ${selected.has(o.id) ? raw('checked') : ''}></td>
            <td class="mono"><a class="row-link" href="${href(`/orders/${o.id}`)}">${o.reference}</a></td>
            <td>${o.supplierName}${o.source === 'AUTO' ? html` <span class="pill pill--auto" title="Raised by autopilot">AUTO</span>` : ''}</td>
            <td>${shortDate(o.createdAt)}</td>
            <td>${o.expectedOn ? html`<span class="${late > 0 ? 'overdue' : ''}">${shortDate(o.expectedOn)}</span>` : html`<span class="muted">—</span>`}</td>
            <td>${late > 0 ? html`<span class="overdue">${plural(late, 'day')}</span>` : ''}</td>
            <td class="num">${num(o.lines.length)}</td>
            <td class="num">${money(o.total)}</td>
            <td>${orderPill(o.status)}</td>
          </tr>`;
        })}</tbody></table></div>`
        : empty({
          glyph: 'truck',
          title: status ? `No ${ORDER_STATUS[status].label} Orders` : 'No Orders Yet',
          body: status === 'DRAFT' ? 'Raise orders from below-par stock to start a draft.' : 'Orders you raise for this store will show up here.',
          action: html`<button type="button" class="btn btn--primary" data-action="raise-empty">${icon('sparkle')}Raise All Below Par</button>`,
        })}`);
    if (keepFocus) {
      const input = card.querySelector('[name="q"]');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  lede();
  draw();

  async function reload() {
    list = await get(`/orders?storeId=${state.storeId}`);
    selected.forEach((id) => { if (!list.some((o) => o.id === id)) selected.delete(id); });
    lede();
    draw();
  }

  async function raiseAll(button) {
    await busy(button, async () => {
      try {
        const raised = await post('/orders/auto', { storeId: state.storeId });
        toast(raised.length ? `Drafted ${plural(raised.length, 'order')}: ${raised.map((o) => o.supplierName).join(', ')}.` : 'Everything below par is already on order.');
        if (raised.length) setQuery({ status: 'DRAFT' });
        await reload();
      } catch (error) { toastError(error); }
    });
  }

  let typing;
  const offs = [
    on(card, 'input', '[name="q"]', (event) => {
      clearTimeout(typing);
      typing = setTimeout(() => { setQuery({ q: event.target.value.trim() || null }); draw({ keepFocus: true }); }, 140);
    }),
    on(card, 'click', '[data-tab]', (event, tab) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      setQuery({ status: tab.dataset.tab || null });
      draw();
      card.querySelector(`[data-tab="${tab.dataset.tab}"]`)?.focus();
    }),
    on(card, 'change', '[data-check]', (event, box) => {
      const id = Number(box.dataset.check);
      if (box.checked) selected.add(id); else selected.delete(id);
      draw();
      card.querySelector(`[data-check="${id}"]`)?.focus();
    }),
    on(card, 'change', '[data-check-all]', (event, box) => {
      const status = query().get('status');
      list.filter((o) => !status || o.status === status).forEach((o) => (box.checked ? selected.add(o.id) : selected.delete(o.id)));
      draw();
      card.querySelector('[data-check-all]')?.focus();
    }),
    on(card, 'click', 'tr.clickable', (event, row) => {
      if (event.target.closest('input, a') || event.metaKey || event.ctrlKey) return;
      navigate(href(`/orders/${row.dataset.id}`));
    }),
    on(card, 'click', '[data-action="raise-empty"]', (event, button) => raiseAll(button)),
    on(card, 'click', '[data-bulk="send"]', async (event, button) => {
      const drafts = [...selected].map((id) => list.find((o) => o.id === id)).filter((o) => o?.status === 'DRAFT');
      if (!drafts.length) { toast('Select at least one draft to send.'); return; }
      const ok = await confirmDialog({
        title: `Send ${plural(drafts.length, 'Order')}?`,
        body: `${drafts.map((o) => `${o.reference} to ${o.supplierName}`).join(', ')} will be marked as sent & their delivery dates set from each supplier’s lead time.`,
        confirmLabel: 'Send',
      });
      if (!ok) return;
      await busy(button, async () => {
        const results = await Promise.allSettled(drafts.map((o) => post(`/orders/${o.id}/send`)));
        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length) toastError(failed[0].reason);
        else toast(`Sent ${plural(drafts.length, 'order')}.`);
        selected.clear();
        await reload();
      });
    }),
    on(card, 'click', '[data-bulk="export"]', () => {
      const status = query().get('status');
      const rows = selected.size ? list.filter((o) => selected.has(o.id)) : list.filter((o) => !status || o.status === status);
      const csv = [['Number', 'Supplier', 'Status', 'Created', 'Expected', 'Lines', 'Total'],
        ...rows.map((o) => [o.reference, o.supplierName, o.status, o.createdAt.slice(0, 10), o.expectedOn ?? '', o.lines.length, Number(o.total).toFixed(2)])]
        .map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
      download(`orders-${store.code}-${today}.csv`, csv);
    }),
  ];

  main.querySelector('[data-action="raise"]').addEventListener('click', (event) => raiseAll(event.currentTarget));
  main.querySelector('[data-action="new"]').addEventListener('click', () => openDialog({
    title: 'New Order',
    description: 'Trawler fills it with everything from that supplier that’s below par, topped up to par in whole cases. You can edit it before sending.',
    submitLabel: 'Create Draft',
    body: field({
      label: 'Supplier', name: 'supplierId',
      input: html`<select class="select" id="__ID__" name="supplierId" required>${suppliers.map((s) => html`<option value="${s.id}">${s.name} · ${s.leadTimeDays}-day lead</option>`)}</select>`,
    }),
    async onSubmit(data) {
      const order = await post('/stock/orders', { storeId: state.storeId, supplierId: Number(data.get('supplierId')) });
      toast(`${order.reference} is ready to check.`);
      navigate(href(`/orders/${order.id}`));
    },
  }));

  return { title: 'Orders', cleanup: () => offs.forEach((off) => off()) };
}
