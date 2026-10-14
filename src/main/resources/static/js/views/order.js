import { html, render, icon, on, busy } from '../lib/dom.js';
import { get, post, patch, del, ApiError } from '../lib/api.js';
import { state } from '../lib/state.js';
import { href } from '../lib/router.js';
import { money, num, plural, stamp, shortDate, weekday, daysBetween, ORDER_STATUS } from '../lib/format.js';
import { hero, orderPill, failure, skeletonRows } from '../ui/components.js';
import { openDialog, field, confirmDialog } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';

export default async function order({ main, params, signal }) {
  const id = Number(params.id);
  render(main, html`${hero({ crumbs: [['Orders', href('/orders')], ['…']], title: 'Order' })}
    <div class="page"><div class="wrap"><div class="card">${skeletonRows(5, 6)}</div></div></div>`);

  let po;
  let products;
  try {
    po = await get(`/orders/${id}`, { signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    render(main, html`${hero({ crumbs: [['Orders', href('/orders')], ['Not Found']], title: 'Order Not Found', lede: error.message })}
      <div class="page"><div class="wrap"><a class="btn" href="${href('/orders')}">Back to Orders</a></div></div>`);
    return { title: 'Order Not Found' };
  }

  async function catalogue() {
    products ||= (await get('/products')).filter((p) => p.supplierId === po.supplierId);
    return products;
  }

  function draw() {
    const status = ORDER_STATUS[po.status];
    const late = po.expectedOn && ['SENT', 'PARTIALLY_RECEIVED'].includes(po.status) ? daysBetween(po.expectedOn, state.meta.today) : 0;
    const draft = po.status === 'DRAFT';
    const receivable = po.status === 'SENT' || po.status === 'PARTIALLY_RECEIVED';
    const mail = po.supplierEmail
      ? `mailto:${po.supplierEmail}?subject=${encodeURIComponent(`${po.reference} from Trawler ${po.storeName}`)}&body=${encodeURIComponent(
        `Hi ${po.supplierName},\n\nPlease supply the following for ${po.storeName}:\n\n${po.lines.map((l) => `${l.sku}  ${l.productName}  × ${l.quantity} ${l.unit}`).join('\n')}\n\nThanks!`)}`
      : null;

    render(main, html`
      ${hero({
        crumbs: [['Orders', href('/orders')], [po.reference]],
        eyebrow: `${po.supplierName} → ${po.storeName}`,
        title: po.reference,
        lede: html`${orderPill(po.status)}${po.source === 'AUTO' ? html` <span class="pill pill--auto" style="color:var(--on-sky);box-shadow:inset 0 0 0 1px rgb(255 255 255 / .3)">AUTO</span>` : ''}
          ${late > 0 ? html` <strong class="overdue" style="color:#ffb4a6">&nbsp;Overdue by ${plural(late, 'day')}</strong>` : ''}`,
        meta: html`<span>Total <strong>${money(po.total)}</strong></span><span><strong>${num(po.lines.length)}</strong> lines</span>
          ${po.expectedOn ? html`<span>Expected <strong>${weekday(po.expectedOn)}</strong></span>` : ''}`,
        actions: html`
          ${draft ? html`<button type="button" class="btn btn--sky btn--primary" data-action="send">${icon('send')}Mark as Sent</button>
            <button type="button" class="btn btn--sky" data-action="add">${icon('plus')}Add Line</button>` : ''}
          ${receivable ? html`<button type="button" class="btn btn--sky btn--primary" data-action="receive">${icon('truck')}Receive Delivery</button>` : ''}
          ${po.status === 'PARTIALLY_RECEIVED' ? html`<button type="button" class="btn btn--sky" data-action="close">Close Short</button>` : ''}
          ${mail ? html`<a class="btn btn--sky" href="${mail}" data-native>${icon('send')}Email Supplier</a>` : ''}
          <a class="btn btn--sky" href="/api/orders/${po.id}/csv" download>${icon('download')}CSV</a>
          <button type="button" class="btn btn--sky" data-action="print">${icon('print')}Print</button>
          ${draft || po.status === 'SENT' ? html`<button type="button" class="btn btn--sky" data-action="cancel">Cancel Order</button>` : ''}`,
      })}
      <div class="page"><div class="wrap grid grid--2">
        <div class="card card--flush reveal">
          <div class="card__head"><h2 class="h2">Lines</h2>${draft ? html`<span class="muted">Quantities save as you change them.</span>` : ''}</div>
          <div class="card__body"><div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">SKU</th><th scope="col">Item</th><th scope="col" class="num">Ordered</th>
              <th scope="col" class="num">Received</th><th scope="col" class="num">Unit Cost</th><th scope="col" class="num">Line Total</th>${draft ? html`<th scope="col"><span class="visually-hidden">Remove</span></th>` : ''}</tr></thead>
            <tbody>${po.lines.map((line) => html`<tr data-line="${line.id}">
              <td class="mono">${line.sku}</td>
              <td><span class="item-name">${line.productName}<small>${line.unit} · cases of ${line.packSize}</small></span></td>
              <td class="num">${draft ? html`<label><span class="visually-hidden">Quantity of ${line.sku}</span>
                <input class="input input--num" style="width:88px" type="number" inputmode="numeric" min="1" step="1" name="qty" value="${line.quantity}" data-qty="${line.id}"></label>` : num(line.quantity)}</td>
              <td class="num">${line.received ? num(line.received) : html`<span class="muted">—</span>`}${line.outstanding && line.received ? html`<br><small class="muted">${num(line.outstanding)} to come</small>` : ''}</td>
              <td class="num">${money(line.unitCost)}</td>
              <td class="num" data-total="${line.id}">${money(line.lineTotal)}</td>
              ${draft ? html`<td class="shrink"><button type="button" class="btn btn--ghost btn--sm" data-remove="${line.id}" aria-label="Remove ${line.sku}">${icon('x')}</button></td>` : ''}
            </tr>`)}</tbody>
            <tfoot><tr><td colspan="5">Total</td><td class="num" data-grand>${money(po.total)}</td>${draft ? html`<td></td>` : ''}</tr></tfoot>
          </table></div></div>
        </div>
        <div class="stack">
          <div class="card reveal"><div class="card__head"><h2 class="h3">Timeline</h2></div><div class="card__body">
            <ol class="timeline">
              <li class="is-done"><span>Drafted${po.source === 'AUTO' ? ' by autopilot' : ''}<small>${stamp(po.createdAt)}</small></span></li>
              <li class="${po.sentAt ? 'is-done' : ''}"><span>Sent to supplier<small>${po.sentAt ? stamp(po.sentAt) : 'Not yet'}</small></span></li>
              <li class="${po.status === 'RECEIVED' || po.status === 'PARTIALLY_RECEIVED' ? 'is-done' : ''}"><span>${po.status === 'CANCELLED' ? 'Cancelled' : 'Delivered'}
                <small>${po.closedAt ? stamp(po.closedAt) : po.expectedOn ? `Due ${shortDate(po.expectedOn)}` : 'Due once sent'}</small></span></li>
            </ol>
          </div></div>
          <div class="card reveal"><div class="card__head"><h2 class="h3">Supplier</h2></div><div class="card__body">
            <dl class="kv">
              <dt>Name</dt><dd>${po.supplierName}</dd>
              <dt>Email</dt><dd>${po.supplierEmail ? html`<a class="linkish" href="mailto:${po.supplierEmail}" data-native>${po.supplierEmail}</a>` : '—'}</dd>
              <dt>Store</dt><dd>${po.storeName}</dd>
              ${po.notes ? html`<dt>Notes</dt><dd>${po.notes}</dd>` : ''}
            </dl>
          </div></div>
        </div>
      </div></div>`);
  }

  draw();

  async function act(button, task, message) {
    await busy(button, async () => {
      try {
        po = await task();
        if (message) toast(message(po));
        draw();
        main.querySelector('h1')?.focus();
      } catch (error) { toastError(error); }
    });
  }

  const offs = [
    on(main, 'click', '[data-action="send"]', (e, b) => confirmDialog({
      title: `Mark ${po.reference} as Sent?`,
      body: `Trawler records it as sent today & expects delivery in ${po.supplierName}’s lead time. Email or print it for the supplier if they don’t take orders another way.`,
      confirmLabel: 'Mark as Sent',
    }).then((ok) => ok && act(b, () => post(`/orders/${id}/send`), (o) => `${o.reference} sent. Due ${weekday(o.expectedOn)}.`))),
    on(main, 'click', '[data-action="cancel"]', (e, b) => confirmDialog({
      title: `Cancel ${po.reference}?`,
      body: 'Its quantities stop counting as on order. You can’t undo this, but you can raise a new order any time.',
      confirmLabel: 'Cancel Order', cancelLabel: 'Keep Order', danger: true,
    }).then((ok) => ok && act(b, () => post(`/orders/${id}/cancel`), (o) => `${o.reference} cancelled.`))),
    on(main, 'click', '[data-action="close"]', (e, b) => confirmDialog({
      title: 'Close Short?',
      body: `Marks ${po.reference} as received & writes off ${plural(po.unitsOutstanding, 'unit')} the supplier didn’t send.`,
      confirmLabel: 'Close Short',
    }).then((ok) => ok && act(b, () => post(`/orders/${id}/close`), (o) => `${o.reference} closed.`))),
    on(main, 'click', '[data-action="print"]', () => window.print()),
    on(main, 'click', '[data-action="receive"]', () => openDialog({
      title: `Receive ${po.reference}`,
      description: 'Enter what actually arrived. It goes straight onto the shelf & into the ledger.',
      submitLabel: 'Receive Into Stock',
      wide: true,
      body: html`<div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">Item</th><th scope="col" class="num">Outstanding</th><th scope="col" class="num">Arrived</th></tr></thead>
        <tbody>${po.lines.filter((l) => l.outstanding > 0).map((l) => html`<tr>
          <td><span class="item-name">${l.productName}<small class="mono">${l.sku}</small></span></td>
          <td class="num">${num(l.outstanding)} ${l.unit}</td>
          <td class="num"><label><span class="visually-hidden">${l.sku} arrived</span>
            <input class="input input--num" style="width:96px" type="number" inputmode="numeric" min="0" max="${l.outstanding}" step="1" name="line-${l.id}" value="${l.outstanding}"></label></td>
        </tr>`)}</tbody></table></div>`,
      async onSubmit(data) {
        const lines = {};
        for (const [key, value] of data.entries()) lines[key.replace('line-', '')] = Math.trunc(Number(value) || 0);
        po = await post(`/orders/${id}/receive`, { lines });
        toast(po.status === 'RECEIVED' ? `${po.reference} received in full.` : `${po.reference} part received: ${plural(po.unitsOutstanding, 'unit')} still to come.`);
        draw();
      },
    })),
    on(main, 'click', '[data-action="add"]', async () => {
      const options = await catalogue();
      openDialog({
        title: 'Add a Line',
        description: `Only ${po.supplierName} products can go on this order.`,
        submitLabel: 'Add',
        body: html`<div class="fields">
          ${field({ label: 'Product', name: 'sku', wide: true, input: html`<select class="select" id="__ID__" name="sku" required>${options.map((p) => html`<option value="${p.sku}">${p.sku} · ${p.name} (cases of ${p.packSize})</option>`)}</select>` })}
          ${field({ label: 'Quantity', name: 'quantity', type: 'number', value: '1', required: true, attrs: 'inputmode="numeric" min="1" step="1"' })}
        </div>`,
        async onSubmit(data) {
          po = await post(`/orders/${id}/lines`, { sku: data.get('sku'), quantity: Math.trunc(Number(data.get('quantity'))) });
          draw();
        },
      });
    }),
    on(main, 'click', '[data-remove]', async (e, button) => {
      const lineId = Number(button.dataset.remove);
      const line = po.lines.find((l) => l.id === lineId);
      const before = po;
      po = { ...po, lines: po.lines.filter((l) => l.id !== lineId) };
      draw();
      try {
        po = await del(`/orders/${id}/lines/${lineId}`);
        draw();
        toast(`Removed ${line.sku}.`, {
          action: { label: 'Undo', run: async () => { try { po = await post(`/orders/${id}/lines`, { sku: line.sku, quantity: line.quantity }); draw(); } catch (error) { toastError(error); } } },
        });
      } catch (error) {
        po = before;
        draw();
        toastError(error);
      }
    }),
    // Quantities save on change, optimistically; a failure puts the old number back.
    on(main, 'change', '[data-qty]', async (e, input) => {
      const lineId = Number(input.dataset.qty);
      const quantity = Math.trunc(Number(input.value));
      const line = po.lines.find((l) => l.id === lineId);
      if (!quantity || quantity < 1) { input.value = line.quantity; toast('Quantities start at 1. Remove the line instead.'); return; }
      const total = quantity * line.unitCost;
      main.querySelector(`[data-total="${lineId}"]`).textContent = money(total);
      const grand = po.lines.reduce((sum, l) => sum + (l.id === lineId ? total : Number(l.lineTotal)), 0);
      main.querySelector('[data-grand]').textContent = money(grand);
      try {
        po = await patch(`/orders/${id}/lines/${lineId}`, { quantity });
      } catch (error) {
        if (error instanceof ApiError) toastError(error);
        input.value = line.quantity;
        main.querySelector(`[data-total="${lineId}"]`).textContent = money(line.lineTotal);
        main.querySelector('[data-grand]').textContent = money(po.total);
      }
    }),
  ];

  return { title: po.reference, cleanup: () => offs.forEach((off) => off()) };
}
