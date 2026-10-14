import { html, render, icon, $, $$, on, busy } from '../lib/dom.js';
import { get, put, post } from '../lib/api.js';
import { href } from '../lib/router.js';
import { num, signed, signedMoney, stamp, pct, plural } from '../lib/format.js';
import { hero, empty, skeletonRows, stat } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { takePill } from './stocktakes.js';
import { reducedMotion } from '../lib/motion.js';

export default async function stocktake({ main, params, signal }) {
  const id = Number(params.id);
  render(main, html`${hero({ crumbs: [['Stock-Takes', href('/stocktakes')], ['…']], title: 'Stock-Take' })}
    <div class="page"><div class="wrap"><div class="card">${skeletonRows(8, 5)}</div></div></div>`);

  let take;
  try {
    take = await get(`/stocktakes/${id}`, { signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    render(main, html`${hero({ crumbs: [['Stock-Takes', href('/stocktakes')], ['Not Found']], title: 'Not Found', lede: error.message })}`);
    return { title: 'Not Found' };
  }

  let onlyUncounted = false;

  function progress() {
    const ratio = take.lineCount ? take.countedCount / take.lineCount : 0;
    return html`<div class="stack" style="gap:6px">
      <div class="progress" role="progressbar" aria-label="Lines counted" aria-valuemin="0" aria-valuemax="${take.lineCount}" aria-valuenow="${take.countedCount}">
        <span data-progress style="transform:scaleX(${ratio})"></span></div>
      <span class="muted" style="color:var(--on-sky-2)" data-progress-text>${num(take.countedCount)} of ${num(take.lineCount)} lines counted</span>
    </div>`;
  }

  function draw() {
    const counting = take.status === 'IN_PROGRESS';
    const showExpected = take.lines.some((l) => l.expected != null);
    const lines = onlyUncounted ? take.lines.filter((l) => l.counted == null) : take.lines;
    const bins = [...new Set(lines.map((l) => l.bin ?? 'No bin'))];
    const countedValue = take.lines.reduce((sum, l) => sum + (l.counted ?? 0) * l.unitCost, 0);
    render(main, html`
      ${hero({
        crumbs: [['Stock-Takes', href('/stocktakes')], [take.reference]],
        eyebrow: `${take.storeName} · started ${stamp(take.startedAt)}`,
        title: take.reference,
        lede: html`${takePill(take.status)}${take.blind && counting ? ' Blind count: expected quantities stay hidden until you complete it.' : ''}`,
        extra: counting ? progress() : '',
        actions: html`
          ${counting ? html`<button type="button" class="btn btn--sky btn--primary" data-action="complete">${icon('check')}Complete & Post Variance</button>` : ''}
          <button type="button" class="btn btn--sky" data-action="print">${icon('print')}Print Count Sheet</button>
          ${counting ? html`<button type="button" class="btn btn--sky" data-action="cancel">Cancel Count</button>` : ''}`,
      })}
      <div class="page"><div class="wrap stack">
        ${!counting && take.status === 'COMPLETED' ? html`<div class="grid grid--kpis">
          ${stat({ label: 'Lines counted', value: `${num(take.countedCount)} / ${num(take.lineCount)}` })}
          ${stat({ label: 'Variance', value: `${signed(take.varianceUnits)} units`, alert: take.varianceUnits < 0 })}
          ${stat({ label: 'Variance value', value: signedMoney(take.varianceValue), alert: take.varianceValue < 0 })}
          ${stat({ label: 'Shrinkage', value: countedValue ? pct(Math.abs(Math.min(0, take.varianceValue)) / countedValue) : '—', meta: 'Of counted stock value' })}
        </div>` : ''}
        <div class="card card--flush reveal">
          <div class="toolbar">
            ${counting ? html`<label class="check"><input type="checkbox" data-only ${onlyUncounted ? 'checked' : ''}><span>Only show uncounted lines</span></label>` : ''}
            <span class="toolbar__note">${counting ? 'Counts save as you go. Enter moves to the next line.' : `Completed ${take.completedAt ? stamp(take.completedAt) : ''}`}</span>
          </div>
          ${lines.length ? html`<div class="table-wrap"><table class="table">
            <caption class="visually-hidden">Count sheet for ${take.reference}</caption>
            <thead><tr><th scope="col">Bin</th><th scope="col">SKU</th><th scope="col">Item</th>
              ${showExpected ? html`<th scope="col" class="num">Expected</th>` : ''}<th scope="col" class="num">Counted</th>
              ${showExpected ? html`<th scope="col" class="num">Variance</th><th scope="col" class="num">Value</th>` : ''}</tr></thead>
            <tbody>${bins.map((bin) => lines.filter((l) => (l.bin ?? 'No bin') === bin).map((line) => html`
              <tr class="count-row ${line.counted != null ? 'is-counted' : ''}" data-line="${line.id}">
                <td class="shrink">${line.bin ?? html`<span class="muted">No bin</span>`}</td>
                <td class="mono">${line.sku}</td>
                <td><span class="item-name">${line.productName}<small>${line.category} · counted in ${line.unit}</small></span></td>
                ${showExpected ? html`<td class="num">${num(line.expected)}</td>` : ''}
                <td class="num">${counting ? html`<label><span class="visually-hidden">Count of ${line.sku} in ${line.unit}</span>
                  <input class="input input--num" type="number" inputmode="numeric" enterkeyhint="next" min="0" step="1" name="count-${line.id}"
                    value="${line.counted ?? ''}" placeholder="—" data-count="${line.id}" autocomplete="off"></label>`
                  : line.counted == null ? html`<span class="muted">Not counted</span>` : num(line.counted)}</td>
                ${showExpected ? html`<td class="num ${line.variance < 0 ? 'overdue' : line.variance > 0 ? 'delta--up' : ''}">${line.variance == null ? '' : signed(line.variance)}</td>
                  <td class="num">${line.variance ? signedMoney(line.variance * line.unitCost) : ''}</td>` : ''}
              </tr>`))}</tbody></table></div>`
            : empty({ glyph: 'check', title: 'Every Line Is Counted', body: 'Complete the stock-take to post the variance.' })}
        </div>
      </div></div>`);
  }

  draw();

  function updateProgress() {
    const bar = $('[data-progress]', main);
    if (!bar) return;
    const ratio = take.lineCount ? take.countedCount / take.lineCount : 0;
    if (window.gsap && !reducedMotion.matches) window.gsap.to(bar, { scaleX: ratio, duration: 0.5, ease: 'expo.out' });
    else bar.style.transform = `scaleX(${ratio})`;
    $('[data-progress-text]', main).textContent = `${num(take.countedCount)} of ${num(take.lineCount)} lines counted`;
    $('.progress', main)?.setAttribute('aria-valuenow', String(take.countedCount));
  }

  async function save(input) {
    const lineId = Number(input.dataset.count);
    const line = take.lines.find((l) => l.id === lineId);
    const text = input.value.trim();
    const counted = text === '' ? null : Math.trunc(Number(text));
    if (counted !== null && (Number.isNaN(counted) || counted < 0)) {
      input.setAttribute('aria-invalid', 'true');
      toast('Counts are whole numbers, 0 or more.');
      return;
    }
    input.removeAttribute('aria-invalid');
    if (counted === line.counted) return;
    const previous = line.counted;
    line.counted = counted;
    // Count locally: responses can land out of order when someone types quickly.
    const recount = () => { take.countedCount = take.lines.filter((l) => l.counted != null).length; };
    recount();
    input.closest('tr').classList.toggle('is-counted', counted != null);
    updateProgress();
    try {
      await put(`/stocktakes/${id}/lines/${lineId}`, { counted });
    } catch (error) {
      line.counted = previous;
      recount();
      input.value = previous ?? '';
      input.closest('tr').classList.toggle('is-counted', previous != null);
      updateProgress();
      toastError(error);
    }
  }

  const offs = [
    on(main, 'change', '[data-count]', (e, input) => save(input)),
    on(main, 'keydown', '[data-count]', (e, input) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      save(input);
      const inputs = $$('[data-count]', main);
      const next = inputs[inputs.indexOf(input) + 1];
      if (next) { next.focus(); next.select(); } else { main.querySelector('[data-action="complete"]')?.focus(); }
    }),
    on(main, 'change', '[data-only]', (e, box) => { onlyUncounted = box.checked; draw(); main.querySelector('[data-only]')?.focus(); }),
    on(main, 'click', '[data-action="print"]', () => window.print()),
    on(main, 'click', '[data-action="cancel"]', async (e, button) => {
      const ok = await confirmDialog({ title: 'Cancel This Count?', body: 'Counts so far are kept for reference but nothing is posted to stock.', confirmLabel: 'Cancel Count', cancelLabel: 'Keep Counting', danger: true });
      if (!ok) return;
      await busy(button, async () => {
        try { take = await post(`/stocktakes/${id}/cancel`); draw(); toast(`${take.reference} cancelled.`); } catch (error) { toastError(error); }
      });
    }),
    on(main, 'click', '[data-action="complete"]', async (e, button) => {
      const missing = take.lineCount - take.countedCount;
      const ok = await confirmDialog({
        title: `Complete ${take.reference}?`,
        body: `${num(take.countedCount)} counted line${take.countedCount === 1 ? '' : 's'} will have their variance posted to stock as adjustments.${missing ? ` ${plural(missing, 'uncounted line')} will keep the on-hand Trawler already has.` : ''}`,
        confirmLabel: 'Complete & Post',
      });
      if (!ok) return;
      await busy(button, async () => {
        try {
          take = await post(`/stocktakes/${id}/complete`);
          draw();
          toast(`${take.reference} posted: ${signedMoney(take.varianceValue)} variance.`);
          main.querySelector('h1')?.focus();
        } catch (error) { toastError(error); }
      });
    }),
  ];

  return { title: take.reference, cleanup: () => offs.forEach((off) => off()) };
}
