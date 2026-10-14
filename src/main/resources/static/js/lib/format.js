// Locale-aware formatting. Money uses the business currency; everything else follows the reader.

const locale = navigator.languages?.[0] || navigator.language || 'en-AU';
let currency = 'AUD';
let moneyFmt;
let moneyCompactFmt;

export function setCurrency(code) {
  currency = code || 'AUD';
  moneyFmt = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  moneyCompactFmt = new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
}
setCurrency('AUD');

export const money = (value) => moneyFmt.format(Number(value || 0));
export const moneyShort = (value) => Math.abs(value) >= 10000 ? moneyCompactFmt.format(value) : moneyFmt.format(value);
export const signedMoney = (value) => (value > 0 ? '+' : value < 0 ? '−' : '') + moneyFmt.format(Math.abs(value));

const numFmt = new Intl.NumberFormat(locale);
const oneDp = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
export const num = (value) => numFmt.format(value ?? 0);
export const dec = (value) => oneDp.format(value ?? 0);
export const signed = (value) => (value > 0 ? '+' : value < 0 ? '−' : '±') + numFmt.format(Math.abs(value));
export const pct = (value) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value);

/** Parses an ISO date (2026-10-14) as a local calendar day, never shifting across timezones. */
export function day(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' });
const stampFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const longFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });

export const shortDate = (value) => dayFmt.format(typeof value === 'string' && value.length === 10 ? day(value) : new Date(value));
export const weekday = (value) => weekdayFmt.format(typeof value === 'string' && value.length === 10 ? day(value) : new Date(value));
export const stamp = (iso) => stampFmt.format(new Date(iso));
export const longDate = (value) => longFmt.format(value);
const domFmt = new Intl.DateTimeFormat(locale, { day: 'numeric' });
export const dayOfMonth = (iso) => domFmt.format(day(iso));

const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
export function ago(iso) {
  const seconds = (new Date(iso) - Date.now()) / 1000;
  const units = [['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

/** Whole days between two ISO dates (b − a). */
export const daysBetween = (a, b) => Math.round((day(b) - day(a)) / 86400000);

export const plural = (count, one, many = `${one}s`) => `${num(count)} ${count === 1 ? one : many}`;
export const qty = (count, unit) => `${num(count)} ${unit}`;

export const ORDER_STATUS = {
  DRAFT: { label: 'Draft', tone: 'draft', icon: 'edit' },
  SENT: { label: 'Sent', tone: 'sent', icon: 'send' },
  PARTIALLY_RECEIVED: { label: 'Part Received', tone: 'partial', icon: 'truck' },
  RECEIVED: { label: 'Received', tone: 'received', icon: 'check' },
  CANCELLED: { label: 'Cancelled', tone: 'cancelled', icon: 'x' },
};

export const STOCK_STATUS = {
  OK: { label: 'At Par', tone: 'ok', icon: 'check' },
  LOW: { label: 'Below Par', tone: 'low', icon: 'alert' },
  OUT: { label: 'Out', tone: 'out', icon: 'empty' },
};

export const REASONS = {
  OPENING: 'Opening',
  RECEIPT: 'Receipt',
  USAGE: 'Usage',
  WASTE: 'Waste',
  ADJUSTMENT: 'Adjustment',
  STOCKTAKE: 'Stock-Take',
  TRANSFER_IN: 'Transfer In',
  TRANSFER_OUT: 'Transfer Out',
};

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = isMac ? '⌘' : 'Ctrl';
