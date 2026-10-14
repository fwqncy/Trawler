// Shared view pieces. Status always travels with an icon and a word, never colour alone.

import { html, icon, raw, esc } from '../lib/dom.js';
import { ORDER_STATUS, STOCK_STATUS, num, money, moneyShort, weekday, shortDate, dayOfMonth } from '../lib/format.js';

export function hero({ eyebrow, title, lede, actions, crumbs, meta, tall = false, side, extra }) {
  return html`
    <section class="hero${tall ? ' hero--tall' : ''} on-sky" data-sky>
      <div class="wrap hero__inner">
        <div class="hero__copy">
          ${crumbs ? html`<nav class="crumbs" aria-label="Breadcrumb">${crumbs.map(([label, link], i) => html`
            ${i ? icon('chevron') : ''}${link ? html`<a href="${link}">${label}</a>` : html`<span aria-current="page">${label}</span>`}`)}</nav>` : ''}
          ${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ''}
          <h1 class="display" tabindex="-1">${title}</h1>
          ${lede ? html`<p class="lede">${lede}</p>` : ''}
          ${meta ? html`<div class="hero__meta">${meta}</div>` : ''}
          ${extra || ''}
          ${actions ? html`<div class="hero__actions">${actions}</div>` : ''}
        </div>
        ${side || ''}
      </div>
    </section>`;
}

export function statusPill(entry, extraClass = '') {
  return html`<span class="pill pill--${entry.tone} ${extraClass}">${icon(entry.icon)}${entry.label}</span>`;
}
export const stockPill = (status) => statusPill(STOCK_STATUS[status]);
export const orderPill = (status) => statusPill(ORDER_STATUS[status]);

/** On-hand against par: the bar fills to on-hand, the tick marks par. */
export function level(item, { compact = false } = {}) {
  const scale = Math.max(item.par * 1.35, item.onHand, 1);
  const fill = Math.min(100, (item.onHand / scale) * 100);
  const par = Math.min(100, (item.par / scale) * 100);
  const tone = item.status === 'OUT' ? 'out' : item.status === 'LOW' ? 'low' : 'ok';
  const label = `${item.onHand} of ${item.par} ${item.unit} par`;
  return html`<div class="level" role="img" aria-label="${label}">
    <div class="meter meter--${tone}">
      <div class="meter__fill" style="width:${fill.toFixed(1)}%"></div>
      ${item.par > 0 ? html`<div class="meter__par" style="left:${par.toFixed(1)}%"></div>` : ''}
    </div>
    ${compact ? '' : html`<span class="level__nums" aria-hidden="true"><strong>${num(item.onHand)}</strong> / ${num(item.par)}</span>`}
  </div>`;
}

export function empty({ title, body, action, glyph = 'empty' }) {
  return html`<div class="empty">${icon(glyph)}<h3>${title}</h3>${body ? html`<p>${body}</p>` : ''}${action || ''}</div>`;
}

export function failure(error) {
  return html`<div class="empty" role="alert">${icon('alert')}<h3>${error?.title || 'Couldn’t Load This'}</h3>
    <p>${error?.message || 'Something went wrong.'}</p>
    <button type="button" class="btn" data-retry>Try Again</button></div>`;
}

export function skeletonRows(rows = 6, cols = 6) {
  return html`<div class="table-wrap" aria-hidden="true"><table class="table"><tbody>
    ${Array.from({ length: rows }, () => html`<tr>${Array.from({ length: cols }, (_, c) => html`<td><span class="skeleton" style="width:${c === 1 ? 70 : 40 + ((c * 17) % 40)}%"></span></td>`)}</tr>`)}
  </tbody></table></div>`;
}

export function tabs(items, label) {
  return html`<nav class="tabs" aria-label="${label}">${items.map((tab) => html`
    <a class="tab" href="${tab.href}" data-tab="${tab.key}" ${tab.current ? raw('aria-current="page"') : ''}>
      ${tab.label}${tab.count !== undefined ? html`<span class="tab__count">${num(tab.count)}</span>` : ''}
    </a>`)}</nav>`;
}

export function stat({ label, value, meta, link, alert = false, glyph, id }) {
  const body = html`<span class="stat__label">${glyph ? icon(glyph) : ''}${label}</span>
    <span class="stat__value" ${id ? raw(`id="${esc(id)}"`) : ''}>${value}</span>
    ${meta ? html`<span class="stat__meta">${meta}</span>` : ''}`;
  return link
    ? html`<a class="card stat reveal${alert ? ' stat--alert' : ''}" href="${link}">${body}</a>`
    : html`<div class="card stat reveal${alert ? ' stat--alert' : ''}">${body}</div>`;
}

function niceMax(value) {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const n = value / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * exp;
}

/**
 * Daily usage as columns: one series, so no legend; the title names it. Columns cap at 24px with
 * a rounded data end, sit on a single baseline, and carry their exact value in a tooltip.
 */
export function usageChart(days, { today } = {}) {
  const width = 460;
  const height = 180;
  const pad = { top: 22, right: 6, bottom: 24, left: 50 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = days.map((d) => Number(d.value));
  const max = niceMax(Math.max(...values, 1));
  const slot = plotW / days.length;
  const bar = Math.min(24, slot - 6);
  const y = (v) => pad.top + plotH - (v / max) * plotH;
  const peak = values.indexOf(Math.max(...values));
  const ticks = [0, max / 2, max];

  const columns = days.map((d, i) => {
    const v = Number(d.value);
    const x = pad.left + i * slot + (slot - bar) / 2;
    const top = y(v);
    const h = pad.top + plotH - top;
    const r = Math.min(4, h);
    const path = h <= 0 ? '' : `M${x},${pad.top + plotH}V${top + r}Q${x},${top} ${x + r},${top}H${x + bar - r}Q${x + bar},${top} ${x + bar},${top + r}V${pad.top + plotH}Z`;
    const isToday = d.date === today;
    const label = `${weekday(d.date)}: ${money(v)} used, ${num(d.units)} units${isToday ? ' so far' : ''}`;
    return html`
      <path class="bar${isToday ? ' is-today' : ''}" data-i="${i}" d="${path}"></path>
      <rect class="bar-hit" x="${pad.left + i * slot}" y="${pad.top}" width="${slot}" height="${plotH}" tabindex="0" role="img"
            aria-label="${label}" data-i="${i}" data-tip-title="${weekday(d.date)}${isToday ? ' (so far)' : ''}"
            data-tip-body="${money(v)} · ${num(d.units)} units" data-x="${x + bar / 2}" data-y="${top}"></rect>
      ${i % 2 === days.length % 2 ? html`<text class="axis-label" x="${x + bar / 2}" y="${height - 6}" text-anchor="middle">${dayOfMonth(d.date)}</text>` : ''}
      ${i === peak && v > 0 ? html`<text class="axis-label" x="${x + bar / 2}" y="${top - 6}" text-anchor="middle" style="fill:var(--ink-2);font-weight:600">${moneyShort(v).replace(/\.\d+$/, '')}</text>` : ''}`;
  });

  return html`<div class="chart" data-chart>
    <svg viewBox="0 0 ${width} ${height}" role="group" aria-label="Daily usage cost, last ${days.length} days">
      ${ticks.map((t) => html`<line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${y(t)}" y2="${y(t)}"></line>
        <text class="axis-label" x="${pad.left - 8}" y="${y(t) + 4}" text-anchor="end">${moneyShort(t).replace(/\.00$/, '')}</text>`)}
      ${columns}
    </svg>
    <div class="tooltip" hidden></div>
  </div>`;
}

/** On-hand over time from the ledger, with par as a reference line. */
export function balanceChart(movements, par) {
  const points = [...movements].reverse();
  if (points.length < 2) return html`<p class="muted">Not enough history to chart yet.</p>`;
  const width = 460;
  const height = 150;
  const pad = { top: 12, right: 10, bottom: 18, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const t0 = new Date(points[0].occurredAt).getTime();
  const t1 = new Date(points.at(-1).occurredAt).getTime();
  const max = niceMax(Math.max(par * 1.2, ...points.map((p) => p.balanceAfter), 1));
  const x = (p) => pad.left + ((new Date(p.occurredAt).getTime() - t0) / Math.max(1, t1 - t0)) * plotW;
  const y = (v) => pad.top + plotH - (v / max) * plotH;
  // A stock balance holds until the next movement, so draw it as steps.
  let d = `M${x(points[0])},${y(points[0].balanceAfter)}`;
  for (let i = 1; i < points.length; i++) d += `H${x(points[i])}V${y(points[i].balanceAfter)}`;
  const area = `${d}V${pad.top + plotH}H${x(points[0])}Z`;
  const end = points.at(-1);
  return html`<div class="chart" data-chart>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="On-hand over the last ${points.length} movements, ending at ${end.balanceAfter}; par is ${par}">
      <line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${y(0)}" y2="${y(0)}"></line>
      <text class="axis-label" x="${pad.left - 6}" y="${y(0) + 4}" text-anchor="end">0</text>
      <text class="axis-label" x="${pad.left - 6}" y="${y(max) + 4}" text-anchor="end">${num(max)}</text>
      ${par > 0 ? html`<line class="par-line" x1="${pad.left}" x2="${width - pad.right}" y1="${y(par)}" y2="${y(par)}"></line>
        <text class="axis-label" x="${width - pad.right}" y="${y(par) - 5}" text-anchor="end">Par ${num(par)}</text>` : ''}
      <path class="area" d="${area}"></path>
      <path class="line" d="${d}"></path>
      <circle class="dot" cx="${x(end)}" cy="${y(end.balanceAfter)}" r="4.5"></circle>
      <text class="axis-label" x="${pad.left}" y="${height - 2}">${shortDate(points[0].occurredAt)}</text>
      <text class="axis-label" x="${width - pad.right}" y="${height - 2}" text-anchor="end">${shortDate(end.occurredAt)}</text>
    </svg>
  </div>`;
}

/** Hover and keyboard tooltips for any chart rendered above. */
export function wireCharts(root) {
  root.querySelectorAll('[data-chart]').forEach((chart) => {
    const tip = chart.querySelector('.tooltip');
    const svg = chart.querySelector('svg');
    if (!tip || !svg) return;
    const show = (target) => {
      const box = svg.getBoundingClientRect();
      const scale = box.width / svg.viewBox.baseVal.width;
      tip.innerHTML = `<strong>${esc(target.dataset.tipTitle)}</strong>${esc(target.dataset.tipBody)}`;
      tip.style.left = `${Number(target.dataset.x) * scale}px`;
      tip.style.top = `${Number(target.dataset.y) * scale}px`;
      tip.hidden = false;
      chart.querySelectorAll('.bar').forEach((bar) => bar.classList.toggle('is-active', bar.dataset.i === target.dataset.i));
    };
    const hide = () => {
      tip.hidden = true;
      chart.querySelectorAll('.bar.is-active').forEach((bar) => bar.classList.remove('is-active'));
    };
    chart.querySelectorAll('[data-tip-title]').forEach((hit) => {
      hit.addEventListener('pointerenter', () => show(hit));
      hit.addEventListener('focus', () => show(hit));
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('blur', hide);
    });
  });
}

export const storeOptions = (stores, selected, { exclude } = {}) => stores
  .filter((s) => s.id !== exclude)
  .map((s) => html`<option value="${s.id}" ${s.id === selected ? raw('selected') : ''}>${s.name}</option>`);
