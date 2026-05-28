// Lightweight localStorage persistence for Cadence.
// Everything lives under one namespaced key as a single JSON blob.

const NS = "cadence:v1";

export function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(NS)) || {};
  } catch (e) {
    return {};
  }
}

export function saveStore(patch) {
  let cur = {};
  try { cur = JSON.parse(localStorage.getItem(NS)) || {}; } catch (e) {}
  const next = { ...cur, ...patch };
  try { localStorage.setItem(NS, JSON.stringify(next)); } catch (e) {}
  return next;
}

export function clearStore() {
  try { localStorage.removeItem(NS); } catch (e) {}
}
