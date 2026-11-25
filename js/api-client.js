/* Cliente HTTP común: caché en localStorage, timeout, errores uniformes y
   una cola de 1 petición/segundo exclusiva para Nominatim. */

import { CONFIG } from './config.js';

const PREFIX = 'nexora:cache:';

function readCache(url, ttl) {
  if (!ttl) return null;
  try {
    const raw = localStorage.getItem(PREFIX + url);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.at > ttl) {
      localStorage.removeItem(PREFIX + url);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(url, data, ttl) {
  if (!ttl) return;
  try {
    localStorage.setItem(PREFIX + url, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* localStorage lleno o no disponible: seguimos sin caché */
  }
}

export const nominatimQueue = {
  last: 0,
  async wait() {
    const remaining = CONFIG.nominatimInterval - (Date.now() - this.last);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    this.last = Date.now();
  }
};

export async function requestJSON(url, { ttl = 0, queue = null, timeout = CONFIG.timeout } = {}) {
  const cached = readCache(url, ttl);
  if (cached !== null) return cached;

  if (queue) await queue.wait();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} en ${new URL(url).hostname}`);
    const data = await response.json();
    writeCache(url, data, ttl);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function statusMessage(element, message, kind = 'info') {
  if (!element) return;
  element.textContent = message;
  element.dataset.kind = kind;
}
