// What every view shares: the stores, the business calendar, and which store you're looking at.

import { get } from './api.js';
import { setCurrency } from './format.js';

const STORE_KEY = 'trawler.store';

export const state = { stores: [], meta: { currency: 'AUD', today: new Date().toISOString().slice(0, 10) }, storeId: null };

export async function loadBasics() {
  const [stores, meta] = await Promise.all([get('/stores'), get('/meta')]);
  state.stores = stores;
  state.meta = meta;
  setCurrency(meta.currency);
}

export async function refreshStores() {
  state.stores = await get('/stores');
  return state.stores;
}

/** The store in the URL wins; then the last one you looked at; then the first. */
export function resolveStore(params) {
  const fromUrl = Number(params.get('store'));
  let remembered = null;
  try { remembered = Number(localStorage.getItem(STORE_KEY)); } catch { /* ignore */ }
  const known = (id) => state.stores.some((s) => s.id === id);
  state.storeId = known(fromUrl) ? fromUrl : known(remembered) ? remembered : state.stores[0]?.id ?? null;
  try { if (state.storeId) localStorage.setItem(STORE_KEY, String(state.storeId)); } catch { /* ignore */ }
  return state.storeId;
}

export const currentStore = () => state.stores.find((s) => s.id === state.storeId);
