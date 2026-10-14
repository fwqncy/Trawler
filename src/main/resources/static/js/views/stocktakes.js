import { html, render, icon, $ } from '../lib/dom.js';
import { get, post } from '../lib/api.js';
import { state, currentStore } from '../lib/state.js';
import { href, navigate } from '../lib/router.js';
import { num, signed, signedMoney, shortDate, stamp } from '../lib/format.js';
import { hero, empty, failure, skeletonRows } from '../ui/components.js';
import { openDialog } from '../ui/dialog.js';

const STATUS = {
  IN_PROGRESS: { label: 'Counting', tone: 'progress', icon: 'clipboard' },
  COMPLETED: { label: 'Completed', tone: 'received', icon: 'check' },
  CANCELLED: { label: 'Cancelled', tone: 'cancelled', icon: 'x' },
};
export const takePill = (status) => html`<span class="pill pill--${STATUS[status].tone}">${icon(STATUS[status].icon)}${STATUS[status].label}</span>`;

export default async function stocktakes({ main, signal }) {
  const store = currentStore();
  render(main, html`
    ${hero({
      crumbs: [['Overview', href('/')], ['Stock-Takes']],
      title: 'Stock-Takes',
      lede: 'Count what’s really on the shelves. Blind counts hide the system figure until you finish, so nobody counts to match it.',
      actions: html`<button type="button" class="btn btn--sky btn--primary" data-action="start">${icon('clipboard')}Start Stock-Take</button>`,
    })}
    <div class="page"><div class="wrap stack" data-body><div class="card">${skeletonRows(5, 6)}</div></div></div>`);

  const body = $('[data-body]', main);
  let takes;
  try {
    takes = await get(`/stocktakes?storeId=${state.storeId}`, { signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    render(body, html`<div class="card">${failure(error)}</div>`);
    return { title: 'Stock-Takes' };
  }

  const running = takes.find((t) => t.status === 'IN_PROGRESS');
  render(body, html`
    ${running ? html`<div class="notice notice--info reveal" role="status">${icon('clipboard')}
      <span><strong>${running.reference}</strong> is in progress: ${num(running.countedCount)} of ${num(running.lineCount)} lines counted.
      <a class="linkish" href="${href(`/stocktakes/${running.id}`)}">Continue counting</a></span></div>` : ''}
    <div class="card card--flush reveal">
      ${takes.length ? html`<div class="table-wrap"><table class="table">
        <caption class="visually-hidden">Stock-takes at ${store.name}</caption>
        <thead><tr><th scope="col">Reference</th><th scope="col">Started</th><th scope="col">Finished</th><th scope="col">Status</th>
          <th scope="col" class="num">Counted</th><th scope="col" class="num">Variance</th><th scope="col" class="num">Variance Value</th></tr></thead>
        <tbody>${takes.map((t) => html`<tr class="clickable">
          <td class="mono"><a class="row-link" href="${href(`/stocktakes/${t.id}`)}">${t.reference}</a></td>
          <td>${stamp(t.startedAt)}</td>
          <td>${t.completedAt ? shortDate(t.completedAt) : html`<span class="muted">—</span>`}</td>
          <td>${takePill(t.status)}${t.blind ? html` <span class="pill pill--auto">BLIND</span>` : ''}</td>
          <td class="num">${num(t.countedCount)} / ${num(t.lineCount)}</td>
          <td class="num">${t.varianceUnits == null ? html`<span class="muted">Hidden</span>` : signed(t.varianceUnits)}</td>
          <td class="num ${t.varianceValue < 0 ? 'overdue' : ''}">${t.varianceValue == null ? html`<span class="muted">Hidden</span>` : signedMoney(t.varianceValue)}</td>
        </tr>`)}</tbody></table></div>`
        : empty({ glyph: 'clipboard', title: 'No Stock-Takes Yet', body: `Start one to check what’s really on the shelves at ${store.name}.` })}
    </div>`);

  main.querySelector('[data-action="start"]').addEventListener('click', () => {
    if (running) { navigate(href(`/stocktakes/${running.id}`)); return; }
    openDialog({
      title: 'Start a Stock-Take',
      description: `Snapshots every line at ${store.name} now. Deliveries & usage during the count are still accounted for when you finish.`,
      submitLabel: 'Start Counting',
      body: html`<label class="check"><input type="checkbox" name="blind" checked>
        <span><strong>Blind count</strong><br><span class="muted">Hide expected quantities while counting. Recommended.</span></span></label>`,
      async onSubmit(data) {
        const take = await post('/stocktakes', { storeId: state.storeId, blind: data.get('blind') === 'on' });
        navigate(href(`/stocktakes/${take.id}`));
      },
    });
  });

  return { title: 'Stock-Takes' };
}
