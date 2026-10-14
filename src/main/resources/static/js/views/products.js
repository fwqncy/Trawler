import { html, render, icon, raw, $, on } from '../lib/dom.js';
import { get, post, put } from '../lib/api.js';
import { state } from '../lib/state.js';
import { href, setQuery, query } from '../lib/router.js';
import { money, num, plural } from '../lib/format.js';
import { hero, empty, failure, skeletonRows } from '../ui/components.js';
import { openDialog, field } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';

export default async function products({ main, signal }) {
  render(main, html`
    ${hero({
      crumbs: [['Overview', href('/')], ['Products']],
      title: 'Products',
      lede: 'The catalogue every store orders from: what it costs, who supplies it & how it comes packed.',
      actions: html`<button type="button" class="btn btn--sky btn--primary" data-action="new">${icon('plus')}New Product</button>`,
    })}
    <div class="page"><div class="wrap"><div class="card card--flush reveal" data-card>${skeletonRows(8, 7)}</div></div></div>`);

  const card = $('[data-card]', main);
  let list;
  let suppliers;
  try {
    [list, suppliers] = await Promise.all([get('/products', { signal }), get('/suppliers', { signal })]);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    render(card, failure(error));
    return { title: 'Products' };
  }

  function draw({ keepFocus } = {}) {
    const q = query();
    const needle = (q.get('q') || '').trim().toLowerCase();
    const category = q.get('cat') || '';
    const categories = [...new Set(list.map((p) => p.category))].sort();
    const rows = list.filter((p) => (!category || p.category === category)
      && (!needle || `${p.sku} ${p.name} ${p.supplierName} ${p.barcode ?? ''}`.toLowerCase().includes(needle)));
    render(card, html`
      <div class="toolbar">
        <label class="search"><span class="visually-hidden">Search products</span>${icon('search')}
          <input class="input" type="search" name="q" value="${q.get('q') || ''}" placeholder="Search SKU, name, supplier or barcode…" autocomplete="off" spellcheck="false" data-page-search></label>
        <label><span class="visually-hidden">Category</span>
          <select class="select select--inline" name="cat"><option value="">All categories</option>
            ${categories.map((c) => html`<option ${c === category ? raw('selected') : ''}>${c}</option>`)}</select></label>
        <span class="toolbar__note">${plural(rows.length, 'product')}</span>
      </div>
      ${rows.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">SKU</th><th scope="col">Product</th><th scope="col">Category</th><th scope="col">Unit</th>
          <th scope="col" class="num">Case</th><th scope="col" class="num">Unit Cost</th><th scope="col">Supplier</th><th scope="col">Barcode</th><th scope="col"><span class="visually-hidden">Edit</span></th></tr></thead>
        <tbody>${rows.map((p) => html`<tr>
          <td class="mono">${p.sku}</td><td><strong>${p.name}</strong></td><td><span class="tag">${p.category}</span></td>
          <td>${p.unit}</td><td class="num">${num(p.packSize)}</td><td class="num">${money(p.unitCost)}</td>
          <td>${p.supplierName}</td><td class="mono muted">${p.barcode ?? '—'}</td>
          <td class="shrink"><button type="button" class="btn btn--sm" data-edit="${p.id}">${icon('edit')}Edit</button></td>
        </tr>`)}</tbody></table></div>` : empty({ title: 'No Products Found', body: 'Try a different search or category.' })}`);
    if (keepFocus) {
      const input = card.querySelector('[name="q"]');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  draw();

  async function form(product) {
    // Pars live per store; load each store's current figure for this product.
    const pars = {};
    if (product) {
      const levels = await Promise.all(state.stores.map((s) => get(`/inventory?storeId=${s.id}`)));
      state.stores.forEach((s, i) => { pars[s.id] = levels[i].find((item) => item.productId === product.id)?.par; });
    }
    openDialog({
      title: product ? `Edit ${product.sku}` : 'New Product',
      description: 'Leave a store’s par blank if it doesn’t stock this product.',
      submitLabel: product ? 'Save Product' : 'Add Product',
      wide: true,
      body: html`<div class="fields">
        ${field({ label: 'SKU', name: 'sku', value: product?.sku, required: true, hint: 'Capitals, digits & dashes, e.g. TORT-12', className: 'input--mono', attrs: 'autocomplete="off" spellcheck="false" autocapitalize="characters" autofocus' })}
        ${field({ label: 'Name', name: 'name', value: product?.name, required: true, attrs: 'autocomplete="off"' })}
        ${field({ label: 'Category', name: 'category', value: product?.category, required: true, attrs: `autocomplete="off" list="categories"` })}
        ${field({ label: 'Supplier', name: 'supplierId', input: html`<select class="select" id="__ID__" name="supplierId">${suppliers.map((s) => html`<option value="${s.id}" ${s.id === product?.supplierId ? raw('selected') : ''}>${s.name}</option>`)}</select>` })}
        ${field({ label: 'Counted in', name: 'unit', value: product?.unit ?? 'each', required: true, hint: 'each, kg, pack, bottle…', attrs: 'autocomplete="off"' })}
        ${field({ label: 'Case size', name: 'packSize', type: 'number', value: product?.packSize ?? 1, hint: 'Orders round up to whole cases', attrs: 'inputmode="numeric" min="1" step="1"' })}
        ${field({ label: 'Unit cost', name: 'unitCost', type: 'number', value: product?.unitCost ?? '', required: true, attrs: 'inputmode="decimal" min="0" step="0.01"' })}
        ${field({ label: 'Barcode', name: 'barcode', value: product?.barcode, hint: 'Optional EAN or UPC', className: 'input--mono', attrs: 'inputmode="numeric" autocomplete="off" spellcheck="false"' })}
        <fieldset class="field field--wide" style="border:0;padding:0;margin:0">
          <legend class="field__label" style="margin-bottom:6px">Par by store</legend>
          <div class="fields">${state.stores.map((s) => field({ label: s.name, name: `par-${s.id}`, type: 'number', value: pars[s.id] ?? '', attrs: 'inputmode="numeric" min="0" step="1" placeholder="Not stocked"' }))}</div>
        </fieldset>
        <datalist id="categories">${[...new Set(list.map((p) => p.category))].map((c) => html`<option value="${c}"></option>`)}</datalist>
      </div>`,
      async onSubmit(data) {
        const parsByStore = {};
        state.stores.forEach((s) => {
          const value = data.get(`par-${s.id}`);
          if (value !== '' && value !== null) parsByStore[s.id] = Math.trunc(Number(value));
        });
        const body = {
          sku: String(data.get('sku')).trim().toUpperCase(), name: data.get('name'), category: data.get('category'), unit: data.get('unit'),
          packSize: Math.trunc(Number(data.get('packSize'))), unitCost: Number(data.get('unitCost')), barcode: data.get('barcode'),
          supplierId: Number(data.get('supplierId')), pars: parsByStore,
        };
        const saved = product ? await put(`/products/${product.id}`, body) : await post('/products', body);
        toast(product ? `${saved.sku} saved.` : `${saved.sku} added.`);
        list = await get('/products');
        draw();
      },
    });
  }

  let typing;
  const offs = [
    on(card, 'input', '[name="q"]', (e) => { clearTimeout(typing); typing = setTimeout(() => { setQuery({ q: e.target.value.trim() || null }); draw({ keepFocus: true }); }, 140); }),
    on(card, 'change', '[name="cat"]', (e) => { setQuery({ cat: e.target.value || null }); draw(); }),
    on(card, 'click', '[data-edit]', (e, button) => form(list.find((p) => p.id === Number(button.dataset.edit)))),
  ];
  main.querySelector('[data-action="new"]').addEventListener('click', () => form(null));

  return { title: 'Products', cleanup: () => offs.forEach((off) => off()) };
}
