/* Renderizado de tarjetas, clima, estados y favoritos (localStorage). */

import { formatPopulation } from './countries.js';
import { weatherLine } from './open-meteo.js';
import { statusMessage } from './api-client.js';

const FAV_KEY = 'nexora:favorites';
const DEFAULT_FAVORITES = ['CO', 'JP', 'IT', 'MA'];

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function getFavorites() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) {
      localStorage.setItem(FAV_KEY, JSON.stringify(DEFAULT_FAVORITES));
      return [...DEFAULT_FAVORITES];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...DEFAULT_FAVORITES];
  } catch {
    return [...DEFAULT_FAVORITES];
  }
}

export function setFavorites(list) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...new Set(list)]));
  } catch {
    /* modo incógnito: se mantiene en memoria durante la sesión */
  }
}

export function toggleFavorite(iso2) {
  if (!iso2) return false;
  const current = getFavorites();
  const next = current.includes(iso2) ? current.filter((code) => code !== iso2) : [...current, iso2];
  setFavorites(next);
  document.querySelectorAll(`[data-fav="${iso2}"]`).forEach((button) => {
    button.classList.toggle('is-fav', next.includes(iso2));
    button.setAttribute('aria-pressed', String(next.includes(iso2)));
  });
  return next.includes(iso2);
}

export function wireFavoriteButtons() {
  const favorites = getFavorites();
  document.querySelectorAll('[data-fav]').forEach((button) => {
    const code = button.dataset.fav;
    button.classList.toggle('is-fav', favorites.includes(code));
    button.setAttribute('aria-pressed', String(favorites.includes(code)));
    if (!button.dataset.favWired) {
      button.dataset.favWired = 'true';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        toggleFavorite(code);
        document.dispatchEvent(new CustomEvent('nexora:favorites-changed'));
      });
    }
  });
}

export function renderWeather(element, summary, city) {
  if (!element) return;
  const icon = element.querySelector('[data-weather-icon]');
  const name = element.querySelector('[data-weather-city]');
  const text = element.querySelector('[data-weather-text]');
  if (icon) icon.textContent = summary?.icon || '🌡️';
  if (name && city) name.textContent = city;
  if (text) text.textContent = summary ? weatherLine(summary) : 'Clima no disponible';
  element.classList.add('api-loaded');
}

export function renderCountryCards(container, countries, { onFav } = {}) {
  if (!container) return;
  if (!countries.length) {
    container.innerHTML = '<p class="api-empty">No hay destinos que coincidan con la búsqueda.</p>';
    return;
  }
  container.innerHTML = countries.map((country, index) => `
    <article class="dest-card" data-iso2="${escapeHTML(country.iso2)}" style="--stripe: var(--${['coral', 'teal', 'dorado', 'navy'][index % 4]});">
      <button class="fav-btn" type="button" data-fav="${escapeHTML(country.iso2)}" aria-label="Guardar ${escapeHTML(country.name)} en favoritos">♥</button>
      <img class="flag-img" src="${escapeHTML(country.flagImage)}" alt="Bandera de ${escapeHTML(country.name)}" loading="lazy">
      <div class="dest-body">
        <h3>${escapeHTML(country.name)}</h3>
        <ul class="dest-meta">
          <li><span>Capital</span> ${escapeHTML(country.capital)}</li>
          <li><span>Región</span> ${escapeHTML(country.region)}</li>
          <li><span>Población</span> ${escapeHTML(formatPopulation(country.population))}</li>
        </ul>
        <a class="dest-link" href="itinerario.html?destino=${encodeURIComponent(country.name)}&amp;lat=${country.lat}&amp;lon=${country.lon}&amp;pais=${country.iso2}">Ver detalle →</a>
      </div>
    </article>`).join('');

  container.querySelectorAll('.flag-img').forEach((img) => {
    img.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'dest-flag';
      fallback.textContent = '🏳️';
      img.replaceWith(fallback);
    }, { once: true });
  });

  wireFavoriteButtons();
  if (onFav) onFav();
}

export function renderFavoriteCards(container, favorites, onRemove) {
  if (!container) return;
  if (!favorites.length) {
    container.innerHTML = `
      <div class="api-empty">
        <p>Aún no tienes favoritos. Agrega destinos desde <a href="explorar.html">Explorar destinos</a>.</p>
      </div>`;
    return;
  }
  container.innerHTML = favorites.map((country, index) => `
    <article class="fav-card" data-iso2="${escapeHTML(country.iso2)}" style="--stripe: var(--${['coral', 'teal', 'dorado', 'navy'][index % 4]});">
      <div class="fav-top">
        <img class="flag-img" src="${escapeHTML(country.flagImage)}" alt="Bandera de ${escapeHTML(country.name)}" loading="lazy">
        <button class="heart" type="button" data-fav="${escapeHTML(country.iso2)}" aria-label="Quitar ${escapeHTML(country.name)} de favoritos">♥</button>
      </div>
      <div class="fav-body">
        <h3>${escapeHTML(country.name)}</h3>
        <p class="fav-meta">${escapeHTML(country.capital)} · ${escapeHTML(country.region)}</p>
        <div class="fav-actions">
          <a class="dest-link" href="itinerario.html?destino=${encodeURIComponent(country.name)}&amp;lat=${country.lat}&amp;lon=${country.lon}&amp;pais=${country.iso2}">Ver detalle →</a>
          <button class="btn btn-ghost btn-xs" type="button" data-remove="${escapeHTML(country.iso2)}">Quitar</button>
        </div>
      </div>
    </article>`).join('');

  container.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      toggleFavorite(button.dataset.remove);
      document.dispatchEvent(new CustomEvent('nexora:favorites-changed'));
      onRemove?.();
    });
  });
  wireFavoriteButtons();
}

export function setStatus(element, message, kind = 'info') {
  statusMessage(element, message, kind);
}
