// Toasts announce through the live region they sit in, and pause while you hover or focus them.

import { html, render, icon } from '../lib/dom.js';
import { reducedMotion } from '../lib/motion.js';

const region = () => document.getElementById('toasts');

export function toast(message, { tone = 'info', action, duration = 5200 } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  render(el, html`
    ${icon(tone === 'error' ? 'alert' : 'sparkle')}
    <span class="toast__msg">${message}</span>
    ${action ? html`<button type="button" class="toast__action">${action.label}</button>` : ''}
    <button type="button" class="toast__action" data-dismiss aria-label="Dismiss">${icon('x')}</button>`);
  region().append(el);

  let timer;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    if (window.gsap && !reducedMotion.matches) {
      window.gsap.to(el, { opacity: 0, y: 8, duration: 0.25, ease: 'power2.in', onComplete: () => el.remove() });
    } else {
      el.remove();
    }
  };
  const arm = () => { clearTimeout(timer); timer = setTimeout(close, duration); };
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', arm);
  el.addEventListener('focusin', () => clearTimeout(timer));
  el.addEventListener('focusout', arm);
  el.querySelector('[data-dismiss]').addEventListener('click', close);
  if (action) {
    el.querySelector('.toast__action:not([data-dismiss])').addEventListener('click', async () => {
      close();
      await action.run();
    });
  }
  if (window.gsap && !reducedMotion.matches) {
    window.gsap.from(el, { opacity: 0, y: 14, scale: 0.98, duration: 0.45, ease: 'expo.out' });
  }
  arm();
  return close;
}

export function toastError(error) {
  return toast(error?.message || 'Something went wrong.', { tone: 'error', duration: 8000 });
}
