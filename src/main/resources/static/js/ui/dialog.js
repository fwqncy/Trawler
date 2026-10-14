// Modal forms on the native <dialog>: focus trapping, Escape and the backdrop come for free.
// Server validation errors land under the field they belong to.

import { html, render, icon, busy, raw } from '../lib/dom.js';
import { ApiError } from '../lib/api.js';
import { reducedMotion } from '../lib/motion.js';

let counter = 0;

export function openDialog({
  title, description, body, submitLabel = 'Save', cancelLabel = 'Cancel', wide = false, drawer = false,
  danger = false, footer = true, onSubmit, onOpen,
}) {
  const id = `dialog-${++counter}`;
  const dialog = document.createElement('dialog');
  dialog.className = drawer ? 'drawer' : `modal${wide ? ' modal--wide' : ''}`;
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  if (description) dialog.setAttribute('aria-describedby', `${id}-desc`);
  // Only dialogs that submit get a <form>; a plain panel can hold forms of its own.
  const tag = raw(onSubmit ? 'form' : 'div');
  render(dialog, html`
    <${tag} class="modal__panel" ${onSubmit ? raw('novalidate') : ''}>
      <header class="modal__head">
        <div>
          <h2 id="${id}-title">${title}</h2>
          ${description ? html`<p id="${id}-desc">${description}</p>` : ''}
        </div>
        <button type="button" class="modal__close" data-close aria-label="Close">${icon('x')}</button>
      </header>
      <div class="modal__body">
        <div class="form-error" role="alert" hidden></div>
        ${body}
      </div>
      ${footer ? html`<footer class="modal__foot">
        <button type="button" class="btn" data-close>${cancelLabel}</button>
        ${onSubmit ? html`<button type="submit" class="btn ${danger ? 'btn--danger btn--solid' : 'btn--primary'}">${submitLabel}</button>` : ''}
      </footer>` : ''}
    </${tag}>`);
  document.body.append(dialog);

  const form = dialog.querySelector('.modal__panel');
  const formError = dialog.querySelector('.form-error');
  let initial = '';
  let result;
  let resolve;
  const closed = new Promise((r) => { resolve = r; });

  const snapshot = () => (onSubmit ? new URLSearchParams(new FormData(form)).toString() : '');
  const dirty = () => onSubmit && snapshot() !== initial;

  function finish(value) {
    result = value;
    const done = () => { dialog.close(); dialog.remove(); resolve(result); };
    if (window.gsap && !reducedMotion.matches) {
      window.gsap.to(form, drawer ? { x: 40, opacity: 0, duration: 0.22, ease: 'power2.in', onComplete: done }
        : { y: 8, opacity: 0, scale: 0.98, duration: 0.18, ease: 'power2.in', onComplete: done });
    } else {
      done();
    }
  }

  async function dismiss() {
    if (dirty() && !(await confirmDialog({ title: 'Discard Changes?', body: 'You have edits that haven’t been saved.', confirmLabel: 'Discard', danger: true }))) return;
    finish(undefined);
  }

  function clearErrors() {
    formError.hidden = true;
    formError.textContent = '';
    form.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute('aria-invalid'));
    form.querySelectorAll('.field__error').forEach((el) => el.remove());
  }

  function showFieldError(name, message) {
    const input = form.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!input) return false;
    input.setAttribute('aria-invalid', 'true');
    const error = document.createElement('p');
    error.className = 'field__error';
    error.id = `${id}-${name}-error`;
    render(error, html`${icon('alert')}<span>${message.charAt(0).toUpperCase() + message.slice(1)}</span>`);
    (input.closest('.field') || input.parentElement).append(error);
    input.setAttribute('aria-describedby', error.id);
    return true;
  }

  function showErrors(error) {
    clearErrors();
    const fields = error instanceof ApiError ? error.fields : {};
    let placed = 0;
    for (const [name, message] of Object.entries(fields)) if (showFieldError(name, message)) placed++;
    if (!placed || placed < Object.keys(fields).length) {
      formError.className = 'form-error notice notice--error';
      render(formError, html`${icon('alert')}<span>${error.message}</span>`);
      formError.hidden = false;
    }
    (form.querySelector('[aria-invalid="true"]') || formError).focus?.();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!onSubmit) return;
    clearErrors();
    const missing = [...form.querySelectorAll('[required]')].filter((input) => !String(input.value).trim());
    if (missing.length) {
      missing.forEach((input) => {
        const label = input.closest('.field')?.querySelector('.field__label')?.textContent || 'this';
        showFieldError(input.name, `Enter ${label.toLowerCase()}`);
      });
      missing[0].focus();
      return;
    }
    const button = event.submitter || form.querySelector('[type="submit"]');
    try {
      const value = await busy(button, () => onSubmit(new FormData(form), { form, showErrors }));
      if (value !== false) finish(value ?? true);
    } catch (error) {
      showErrors(error);
    }
  });
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]') || event.target === dialog) dismiss();
  });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); dismiss(); });

  dialog.showModal();
  initial = snapshot();
  onOpen?.(dialog, { close: finish, showErrors });
  (dialog.querySelector('[autofocus]') || dialog.querySelector('.modal__body :is(input, select, textarea, button)') || form.querySelector('[type="submit"]'))?.focus();
  if (window.gsap && !reducedMotion.matches) {
    window.gsap.from(form, drawer ? { x: 60, opacity: 0, duration: 0.5, ease: 'expo.out' }
      : { y: 14, opacity: 0, scale: 0.97, duration: 0.45, ease: 'expo.out' });
  }
  return { dialog, closed, close: finish };
}

export function confirmDialog({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  const { closed } = openDialog({
    title,
    body: html`<p class="subtle">${body}</p>`,
    submitLabel: confirmLabel,
    cancelLabel,
    danger,
    onSubmit: async () => true,
  });
  return closed.then((value) => value === true);
}

/** Field markup with a label wired to its input. */
export function field({ label, name, type = 'text', value = '', hint, required, wide, attrs = '', className = '', input }) {
  const fieldId = `f-${name}-${++counter}`;
  return html`<div class="field${wide ? ' field--wide' : ''}">
    <label class="field__label" for="${fieldId}">${label}</label>
    ${input ? raw(input.toString().replace('__ID__', fieldId))
      : html`<input class="input ${className}" id="${fieldId}" name="${name}" type="${type}" value="${value ?? ''}" ${required ? raw('required') : ''} ${raw(attrs)}>`}
    ${hint ? html`<p class="field__hint">${hint}</p>` : ''}
  </div>`;
}
