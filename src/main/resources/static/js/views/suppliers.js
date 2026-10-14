import { html, render, icon, $, on } from '../lib/dom.js';
import { get, post, put } from '../lib/api.js';
import { href, setQuery, query } from '../lib/router.js';
import { money, num, plural } from '../lib/format.js';
import { hero, empty, failure, skeletonRows } from '../ui/components.js';
import { openDialog, field } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';

export default async function suppliers({ main, signal }) {
  render(main, html`
    ${hero({
      crumbs: [['Overview', href('/')], ['Suppliers']],
      title: 'Suppliers',
      lede: 'Lead times set when deliveries are due; minimum orders tell you when a top-up is worth sending.',
      actions: html`<button type="button" class="btn btn--sky btn--primary" data-action="new">${icon('plus')}New Supplier</button>`,
    })}
    <div class="page"><div class="wrap"><div class="card card--flush reveal" data-card>${skeletonRows(6, 6)}</div></div></div>`);

  const card = $('[data-card]', main);
  let list;
  try {
    list = await get('/suppliers', { signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    render(card, failure(error));
    return { title: 'Suppliers' };
  }

  function draw({ keepFocus } = {}) {
    const needle = (query().get('q') || '').trim().toLowerCase();
    const rows = list.filter((s) => !needle || `${s.name} ${s.email ?? ''} ${s.phone ?? ''}`.toLowerCase().includes(needle));
    render(card, html`
      <div class="toolbar">
        <label class="search"><span class="visually-hidden">Search suppliers</span>${icon('search')}
          <input class="input" type="search" name="q" value="${query().get('q') || ''}" placeholder="Search suppliers…" autocomplete="off" data-page-search></label>
        <span class="toolbar__note">${plural(rows.length, 'supplier')}</span>
      </div>
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">Supplier</th><th scope="col">Contact</th><th scope="col" class="num">Lead Time</th>
          <th scope="col" class="num">Min Order</th><th scope="col" class="num">Products</th><th scope="col" class="num">Open Orders</th><th scope="col"><span class="visually-hidden">Edit</span></th></tr></thead>
        <tbody>${rows.map((s) => html`<tr>
          <td><span class="item-name"><strong>${s.name}</strong>${s.notes ? html`<small>${s.notes}</small>` : ''}</span></td>
          <td><span class="item-name">${s.email ? html`<a class="linkish" href="mailto:${s.email}" data-native>${s.email}</a>` : html`<span class="muted">No email</span>`}
            ${s.phone ? html`<small><a href="tel:${s.phone.replace(/\s/g, '')}" data-native>${s.phone}</a></small>` : ''}</span></td>
          <td class="num">${plural(s.leadTimeDays, 'day')}</td>
          <td class="num">${money(s.minOrderValue)}</td>
          <td class="num">${num(s.products)}</td>
          <td class="num">${s.openOrders ? html`<a class="linkish" href="${href('/orders')}">${num(s.openOrders)}</a>` : html`<span class="muted">0</span>`}</td>
          <td class="shrink"><button type="button" class="btn btn--sm" data-edit="${s.id}">${icon('edit')}Edit</button></td>
        </tr>`)}</tbody></table></div>` : empty({ title: 'No Suppliers Found', body: needle ? `Nothing matches “${needle}”.` : 'Add the businesses you order from.' })}`);
    if (keepFocus) {
      const input = card.querySelector('[name="q"]');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  draw();

  function form(supplier) {
    openDialog({
      title: supplier ? `Edit ${supplier.name}` : 'New Supplier',
      submitLabel: supplier ? 'Save Supplier' : 'Add Supplier',
      body: html`<div class="fields">
        ${field({ label: 'Name', name: 'name', value: supplier?.name, required: true, wide: true, attrs: 'autocomplete="organization" autofocus' })}
        ${field({ label: 'Email', name: 'email', type: 'email', value: supplier?.email, attrs: 'autocomplete="email" spellcheck="false"' })}
        ${field({ label: 'Phone', name: 'phone', type: 'tel', value: supplier?.phone, attrs: 'autocomplete="tel" inputmode="tel"' })}
        ${field({ label: 'Lead time (days)', name: 'leadTimeDays', type: 'number', value: supplier?.leadTimeDays ?? 2, hint: 'From sending an order to delivery', attrs: 'inputmode="numeric" min="0" max="60" step="1"' })}
        ${field({ label: 'Minimum order', name: 'minOrderValue', type: 'number', value: supplier?.minOrderValue ?? 0, hint: 'In your currency, before tax', attrs: 'inputmode="decimal" min="0" step="0.01"' })}
        ${field({ label: 'Notes', name: 'notes', wide: true, value: supplier?.notes, hint: 'Cut-off times, delivery days, account numbers…', attrs: 'autocomplete="off" maxlength="1000"' })}
      </div>`,
      async onSubmit(data) {
        const body = {
          name: data.get('name'), email: data.get('email'), phone: data.get('phone'),
          leadTimeDays: Number(data.get('leadTimeDays')), minOrderValue: Number(data.get('minOrderValue')), notes: data.get('notes'),
        };
        const saved = supplier ? await put(`/suppliers/${supplier.id}`, body) : await post('/suppliers', body);
        toast(supplier ? `${saved.name} updated.` : `${saved.name} added.`);
        list = await get('/suppliers');
        draw();
      },
    });
  }

  let typing;
  const offs = [
    on(card, 'input', '[name="q"]', (e) => { clearTimeout(typing); typing = setTimeout(() => { setQuery({ q: e.target.value.trim() || null }); draw({ keepFocus: true }); }, 140); }),
    on(card, 'click', '[data-edit]', (e, button) => form(list.find((s) => s.id === Number(button.dataset.edit)))),
  ];
  main.querySelector('[data-action="new"]').addEventListener('click', () => form(null));

  return { title: 'Suppliers', cleanup: () => offs.forEach((off) => off()) };
}
