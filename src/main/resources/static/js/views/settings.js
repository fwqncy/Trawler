import { html, render, icon, raw, $, $$, on, busy } from '../lib/dom.js';
import { post, put } from '../lib/api.js';
import { state, refreshStores } from '../lib/state.js';
import { href, refresh } from '../lib/router.js';
import { plural, modKey } from '../lib/format.js';
import { applyTheme, savedTheme, PRESETS, DEFAULT_CUSTOM, derive, contrast } from '../lib/theme.js';
import { hero, storeOptions } from '../ui/components.js';
import { openDialog, field } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { colorWheel } from '../ui/colorwheel.js';

export default async function settings({ main }) {
  let theme = savedTheme();
  let custom = { sky: theme.sky || DEFAULT_CUSTOM.sky, accent: theme.accent || DEFAULT_CUSTOM.accent };
  let editing = 'sky';
  let wheel = null;

  render(main, html`
    ${hero({
      crumbs: [['Overview', href('/')], ['Settings']],
      title: 'Settings',
      lede: 'Pick the sky Trawler sits under, run each store’s autopilot & learn the shortcuts.',
    })}
    <div class="page"><div class="wrap">
      <section class="section" aria-labelledby="look-title">
        <div class="section__head"><div><h2 class="h2" id="look-title">Appearance</h2>
          <p class="muted">Tide is the default. Claret is burgundy & gold. Custom builds a whole palette from colours you pick.</p></div></div>
        <div class="themes" role="group" aria-label="Theme">
          ${PRESETS.map((p) => html`<button type="button" class="theme-card" data-theme-pick="${p.name}" aria-pressed="${theme.name === p.name}"
              style="--s0:${p.swatch[0]};--s1:${p.swatch[1]};--sc:${p.swatch[2]};--sp:${p.swatch[3]};--sa:${p.swatch[4]}">
            <span class="theme-card__swatch" aria-hidden="true"></span>
            <span class="theme-card__name">${p.label}<small>${p.note}</small></span></button>`)}
          <button type="button" class="theme-card" data-theme-pick="custom" aria-pressed="${theme.name === 'custom'}" data-custom-card>
            <span class="theme-card__swatch" aria-hidden="true"></span>
            <span class="theme-card__name">Custom<small>Your colours</small></span></button>
        </div>
        <div class="card reveal" data-studio ${theme.name === 'custom' ? '' : raw('hidden')}>
          <div class="card__body studio">
            <div data-wheel></div>
            <div class="stack" style="gap:18px">
              <div class="stack" style="gap:8px">
                <h3 class="h3">Choose What You’re Colouring</h3>
                <div class="swatches" role="group" aria-label="Colour to edit">
                  <button type="button" class="swatch-btn" data-edit-swatch="sky" aria-pressed="true" style="--c:${custom.sky}"><i></i>Sky</button>
                  <button type="button" class="swatch-btn" data-edit-swatch="accent" aria-pressed="false" style="--c:${custom.accent}"><i></i>Accent & Stars</button>
                </div>
                <p class="muted">The sky colour sets the clouds, ink & paper tint. The accent colours buttons, links & the stars in the whirlpool. Trawler keeps text readable whatever you pick.</p>
              </div>
              <div class="stack" style="gap:24px">
                <h3 class="h3">Palette</h3>
                <div class="preview-strip" data-preview aria-hidden="true"></div>
                <p class="muted" data-contrast aria-live="polite"></p>
              </div>
              <div class="row"><button type="button" class="btn" data-reset>Reset to Teal & Saffron</button></div>
            </div>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="stores-title">
        <div class="section__head"><div><h2 class="h2" id="stores-title">Stores & Autopilot</h2>
          <p class="muted">With autopilot on, Trawler drafts supplier orders at 5 am for anything below par. Drafts wait for you to check & send.</p></div>
          <button type="button" class="btn btn--primary" data-new-store>${icon('plus')}New Store</button></div>
        <div class="card card--flush reveal" data-stores></div>
      </section>

      <section class="section" aria-labelledby="keys-title">
        <h2 class="h2" id="keys-title">Shortcuts</h2>
        <div class="card reveal"><div class="card__body"><dl class="kv">
          <dt><kbd class="tag">${modKey} K</kbd></dt><dd>Search SKUs, orders & suppliers, or run an action</dd>
          <dt><kbd class="tag">/</kbd></dt><dd>Jump to the search box on the current page</dd>
          <dt><kbd class="tag">Enter</kbd></dt><dd>On a count sheet, save & move to the next line</dd>
          <dt><kbd class="tag">← →</kbd></dt><dd>Step through the fish in the whirlpool; Enter opens one</dd>
          <dt><kbd class="tag">Esc</kbd></dt><dd>Close any dialog or drawer</dd>
        </dl></div></div>
      </section>
    </div></div>`);

  const studio = $('[data-studio]', main);

  function paintCustomCard() {
    const t = derive(custom.sky, custom.accent);
    const card = $('[data-custom-card]', main);
    card.style.cssText = `--s0:${t['sky-0']};--s1:${t['sky-1']};--sc:${t.cloud};--sp:${t.paper};--sa:${t.accent}`;
    render($('[data-preview]', main), html`${[['sky-0', 'Night'], ['sky-1', 'Sky'], ['sky-2', 'Cloud'], ['paper', 'Paper'], ['ink', 'Ink'], ['accent', 'Accent'], ['star', 'Stars']]
      .map(([key, label]) => html`<span style="background:${t[key]}"><small>${label}</small></span>`)}`);
    const ratio = contrast(t.ink, t.paper);
    $('[data-contrast]', main).textContent = `Body text contrast ${ratio.toFixed(1)}:1 · accent on paper ${contrast(t.accent, t.paper).toFixed(1)}:1`;
    $$('[data-edit-swatch]', main).forEach((b) => b.style.setProperty('--c', custom[b.dataset.editSwatch]));
  }

  function choose(name) {
    theme = name === 'custom' ? { name, ...custom } : { name };
    applyTheme(theme);
    $$('[data-theme-pick]', main).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themePick === name)));
    studio.hidden = name !== 'custom';
    if (name === 'custom' && !wheel) mountWheel();
  }

  let pending = 0;
  function mountWheel() {
    wheel = colorWheel($('[data-wheel]', main), {
      value: custom[editing],
      label: editing === 'sky' ? 'Sky colour' : 'Accent colour',
      onInput(hex) {
        custom[editing] = hex;
        paintCustomCard();
        // Re-theming the whole page is cheap, but there's no need to do it more than once a frame.
        cancelAnimationFrame(pending);
        pending = requestAnimationFrame(() => applyTheme({ name: 'custom', ...custom }));
      },
    });
  }

  paintCustomCard();
  if (theme.name === 'custom') mountWheel();

  function drawStores() {
    render($('[data-stores]', main), html`<div class="table-wrap"><table class="table">
      <thead><tr><th scope="col">Code</th><th scope="col">Store</th><th scope="col">Address</th><th scope="col">Autopilot</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
      <tbody>${state.stores.map((s) => html`<tr>
        <td class="mono">${s.code}</td><td><strong>${s.name}</strong></td><td class="muted">${s.address ?? '—'}</td>
        <td><label class="check"><input type="checkbox" data-autopilot="${s.id}" ${s.autoReorder ? raw('checked') : ''}><span>${s.autoReorder ? 'On' : 'Off'}</span></label></td>
        <td class="shrink"><div class="row">
          <button type="button" class="btn btn--sm" data-run="${s.id}">${icon('sparkle')}Run Now</button>
          <button type="button" class="btn btn--sm" data-edit-store="${s.id}">${icon('edit')}Edit</button></div></td>
      </tr>`)}</tbody></table></div>`);
  }
  drawStores();

  function storeForm(store) {
    openDialog({
      title: store ? `Edit ${store.name}` : 'New Store',
      submitLabel: store ? 'Save Store' : 'Open Store',
      body: html`<div class="fields">
        ${field({ label: 'Name', name: 'name', value: store?.name, required: true, attrs: 'autocomplete="off" autofocus' })}
        ${field({ label: 'Code', name: 'code', value: store?.code, required: true, hint: 'Short, e.g. BON', className: 'input--mono', attrs: 'autocomplete="off" maxlength="12" autocapitalize="characters" spellcheck="false"' })}
        ${field({ label: 'Address', name: 'address', value: store?.address, wide: true, attrs: 'autocomplete="street-address"' })}
        ${store ? '' : field({ label: 'Copy pars from', name: 'copyParsFrom', wide: true, hint: 'Starts the new store with the same lines & pars, at zero on hand.',
          input: html`<select class="select" id="__ID__" name="copyParsFrom"><option value="">Start empty</option>${storeOptions(state.stores, state.storeId)}</select>` })}
        <label class="check field--wide"><input type="checkbox" name="autoReorder" ${store?.autoReorder ? raw('checked') : ''}><span>Autopilot: draft orders each morning</span></label>
      </div>`,
      async onSubmit(data) {
        const body = {
          name: data.get('name'), code: data.get('code'), address: data.get('address'), autoReorder: data.get('autoReorder') === 'on',
          copyParsFrom: data.get('copyParsFrom') ? Number(data.get('copyParsFrom')) : null,
        };
        const saved = store ? await put(`/stores/${store.id}`, body) : await post('/stores', body);
        await refreshStores();
        toast(store ? `${saved.name} saved.` : `${saved.name} is open.`);
        refresh();
      },
    });
  }

  const offs = [
    on(main, 'click', '[data-theme-pick]', (e, button) => choose(button.dataset.themePick)),
    on(main, 'click', '[data-edit-swatch]', (e, button) => {
      editing = button.dataset.editSwatch;
      $$('[data-edit-swatch]', main).forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      wheel?.destroy();
      wheel = null;
      mountWheel();
    }),
    on(main, 'click', '[data-reset]', () => {
      custom = { ...DEFAULT_CUSTOM };
      wheel?.set(custom[editing]);
      paintCustomCard();
      applyTheme({ name: 'custom', ...custom });
    }),
    on(main, 'change', '[data-autopilot]', async (e, box) => {
      const store = state.stores.find((s) => s.id === Number(box.dataset.autopilot));
      const next = box.checked;
      store.autoReorder = next;
      box.nextElementSibling.textContent = next ? 'On' : 'Off';
      try {
        await put(`/stores/${store.id}`, { code: store.code, name: store.name, address: store.address, autoReorder: next });
        toast(`Autopilot ${next ? 'on' : 'off'} for ${store.name}.`);
      } catch (error) {
        store.autoReorder = !next;
        box.checked = !next;
        box.nextElementSibling.textContent = !next ? 'On' : 'Off';
        toastError(error);
      }
    }),
    on(main, 'click', '[data-run]', (e, button) => busy(button, async () => {
      const store = state.stores.find((s) => s.id === Number(button.dataset.run));
      try {
        const raised = await post('/orders/auto', { storeId: store.id });
        toast(raised.length ? `Drafted ${plural(raised.length, 'order')} for ${store.name}.` : `Nothing new to order for ${store.name}.`);
      } catch (error) { toastError(error); }
    })),
    on(main, 'click', '[data-edit-store]', (e, button) => storeForm(state.stores.find((s) => s.id === Number(button.dataset.editStore)))),
    on(main, 'click', '[data-new-store]', () => storeForm(null)),
  ];

  return { title: 'Settings', cleanup: () => { offs.forEach((off) => off()); wheel?.destroy(); } };
}
