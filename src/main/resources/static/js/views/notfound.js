import { html, render } from '../lib/dom.js';
import { href } from '../lib/router.js';
import { hero } from '../ui/components.js';

export default async function notFound({ main }) {
  render(main, html`${hero({
    eyebrow: '404',
    title: 'Lost at Sea',
    lede: 'There’s no page at this address. It may have moved, or the link was mistyped.',
    actions: html`<a class="btn btn--sky btn--primary" href="${href('/')}">Back to Overview</a><a class="btn btn--sky" href="${href('/stock')}">Open Stock</a>`,
  })}<div class="page"></div>`);
  return { title: 'Not Found' };
}
