import { $, $$, html, render } from './lib/dom.js';
import { post } from './lib/api.js';
import { applyTheme, savedTheme } from './lib/theme.js';
import { paintGrain, reducedMotion, enterPage } from './lib/motion.js';
import { state, loadBasics } from './lib/state.js';
import { route, start, href, navigate, refresh } from './lib/router.js';
import { modKey } from './lib/format.js';
import { createSky } from './scene/sky.js';
import { host } from './scene/host.js';
import { openPalette } from './ui/palette.js';
import { toast, toastError } from './ui/toast.js';
import { failure } from './ui/components.js';

const main = $('#main');
const masthead = $('.masthead');

// ---- Atmosphere ----

paintGrain();
const colours = applyTheme(savedTheme(), { save: false });
const sky = createSky($('#sky'), { reducedMotion });
host.sky = sky;
if (sky) {
  sky.setColours(colours, false);
  window.addEventListener('trawler:theme', (event) => sky.setColours(event.detail, true));
  sky.start();
}

// The bar gains its own sky once content starts sliding under it.
function onScroll() {
  const amount = Math.min(1, Math.max(0, window.scrollY / 28));
  masthead.style.setProperty('--bar', amount.toFixed(3));
  masthead.dataset.scrolled = String(amount > 0.5);
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ---- Chrome: nav state, store switcher, menu, shortcuts ----

const storeSelect = $('#store-select');

function syncChrome(path) {
  const section = path === '/' ? 'overview' : path.split('/')[1];
  $$('[data-nav]').forEach((link) => {
    const key = link.dataset.nav;
    link.href = href(key === 'overview' ? '/' : `/${key}`);
    if (key === section) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  render(storeSelect, html`${state.stores.map((s) => html`<option value="${s.id}">${s.name}</option>`)}`);
  storeSelect.value = String(state.storeId ?? '');
  closeMenu();
}

storeSelect.addEventListener('change', () => {
  const url = new URL(location.href);
  url.searchParams.set('store', storeSelect.value);
  url.searchParams.delete('item');
  // Detail pages belong to one store, so switching goes back to the list.
  const parts = url.pathname.split('/').filter(Boolean);
  const path = parts.length > 1 ? `/${parts[0]}` : url.pathname;
  navigate(`${path}?store=${storeSelect.value}`);
});

const menuToggle = $('.menu-toggle');
const menu = $('#mobile-menu');
function closeMenu() {
  menu.hidden = true;
  menuToggle.setAttribute('aria-expanded', 'false');
}
menuToggle.addEventListener('click', () => {
  const open = menu.hidden;
  menu.hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  if (open && window.gsap && !reducedMotion.matches) {
    window.gsap.from(menu.querySelectorAll('li'), { y: 10, opacity: 0, duration: 0.4, stagger: 0.03, ease: 'expo.out' });
  }
});

const paletteActions = () => [
  {
    label: 'Raise Orders For Everything Below Par', icon: 'truck', hint: 'autopilot',
    run: async () => {
      try {
        const raised = await post('/orders/auto', { storeId: state.storeId });
        toast(raised.length ? `Drafted ${raised.length} order${raised.length === 1 ? '' : 's'} for review.` : 'Everything below par is already on order.');
        if (raised.length) navigate(href('/orders', { status: 'DRAFT' }));
      } catch (error) { toastError(error); }
    },
  },
  {
    label: 'Start a Blind Stock-Take', icon: 'clipboard',
    run: async () => {
      try {
        const take = await post('/stocktakes', { storeId: state.storeId, blind: true });
        navigate(href(`/stocktakes/${take.id}`));
      } catch (error) { toastError(error); }
    },
  },
  { label: 'Change Theme Colours', icon: 'palette', run: () => navigate(href('/settings')) },
];

$('[data-shortcut-label]').textContent = `${modKey === '⌘' ? '⌘' : 'Ctrl '}K`;
$('#open-palette').addEventListener('click', () => openPalette(paletteActions()));
document.addEventListener('keydown', (event) => {
  const typing = event.target.closest('input, textarea, select, [contenteditable="true"]');
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openPalette(paletteActions());
  } else if (event.key === '/' && !typing && !document.querySelector('dialog[open]')) {
    const search = main.querySelector('[data-page-search]');
    event.preventDefault();
    if (search) search.focus();
    else openPalette(paletteActions());
  }
});

// ---- Routes ----

route('/', () => import('./views/overview.js'));
route('/stock', () => import('./views/stock.js'));
route('/orders', () => import('./views/orders.js'));
route('/orders/:id', () => import('./views/order.js'));
route('/stocktakes', () => import('./views/stocktakes.js'));
route('/stocktakes/:id', () => import('./views/stocktake.js'));
route('/suppliers', () => import('./views/suppliers.js'));
route('/products', () => import('./views/products.js'));
route('/movements', () => import('./views/movements.js'));
route('/settings', () => import('./views/settings.js'));

main.addEventListener('click', (event) => {
  if (event.target.closest('[data-retry]')) refresh();
});

async function boot() {
  try {
    await loadBasics();
  } catch (error) {
    render(main, html`<section class="hero on-sky" data-sky><div class="wrap hero__inner"><div class="hero__copy">
      <p class="eyebrow">Trawler</p><h1 class="display" tabindex="-1">Can’t Reach the Kitchen</h1></div></div></section>
      <div class="page"><div class="wrap"><div class="card">${failure(error)}</div></div></div>`);
    sky?.settle();
    main.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) location.reload(); }, { once: true });
    return;
  }
  await start(main, {
    notFound: () => import('./views/notfound.js'),
    rendered(path) {
      syncChrome(path);
      sky?.settle();
      enterPage(main);
    },
  });
}

boot();
