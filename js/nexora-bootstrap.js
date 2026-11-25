/* Punto de entrada único: detecta la página con data-page y activa solo
   las integraciones que esa página necesita. */

import { FEATURED, DEFAULT_TRIP } from './config.js';
import { getCountries, enrichCountries, searchCountries, formatPopulation } from './countries.js';
import { getWeather, summarizeWeather, summarizeForecast, weatherLine } from './open-meteo.js';
import { geocode } from './nominatim.js';
import { initMap, setMarkers, addMarker } from './map.js';
import {
  wireFavoriteButtons, getFavorites, renderWeather, renderCountryCards,
  renderFavoriteCards, setStatus
} from './widgets.js';

const qs = (selector) => document.querySelector(selector);
const page = document.body.dataset.page || '';

function ensureStatus(form, id) {
  let element = qs(id);
  if (!element) {
    element = document.createElement('p');
    element.id = id;
    element.className = 'api-status';
    element.setAttribute('aria-live', 'polite');
    form?.appendChild(element);
  }
  return element;
}

function markerFor(name, lat, lon, extra = '') {
  return {
    lat,
    lon,
    label: name,
    popup: `<strong>${name}</strong>${extra ? `<br>${extra}` : ''}`
  };
}

function appendLiveInfo(card, summary, population) {
  if (!card || card.querySelector('.dest-live')) return;
  const info = document.createElement('p');
  info.className = 'dest-live';
  const parts = [];
  if (summary) parts.push(`${summary.icon} ${summary.temperature} °C`);
  if (typeof population === 'number') parts.push(`👥 ${formatPopulation(population)}`);
  info.textContent = parts.join(' · ') || 'Datos en vivo no disponibles';
  card.querySelector('.dest-body')?.appendChild(info);
}

async function safe(label, fn) {
  try {
    await fn();
  } catch (error) {
    console.warn(`[Nexora ${label}]`, error);
    const globalStatus = qs('.api-status');
    if (globalStatus) setStatus(globalStatus, `No se pudieron cargar los datos de ${label}. Se muestran los datos de ejemplo.`, 'error');
  }
}

wireFavoriteButtons();

/* ------------------------------------------------------------------ INICIO */
async function initHome() {
  const weatherCard = qs('#home-weather');
  const map = await initMap(qs('#home-map'), { center: [18, -50], zoom: 4 });

  await safe('clima', async () => {
    const rawList = await getWeather(FEATURED);
    const summaries = rawList.map(summarizeWeather);
    renderWeather(weatherCard, summaries[0], FEATURED[0].name);
    const cards = document.querySelectorAll('.dest-grid .dest-card');
    summaries.forEach((summary, index) => appendLiveInfo(cards[index], summary));
    setMarkers(map, FEATURED.map((place, index) =>
      markerFor(place.name, place.lat, place.lon, weatherLine(summaries[index]))
    ));
  });

  const form = qs('[data-home-search]');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = form.querySelector('input[type="search"]');
    const status = ensureStatus(form, '#home-search-status');
    setStatus(status, 'Buscando en OpenStreetMap…');
    try {
      const place = await geocode(input.value);
      const summary = summarizeWeather((await getWeather([place]))[0]);
      renderWeather(weatherCard, summary, place.name);
      addMarker(map, { lat: place.lat, lon: place.lon, popup: `${place.name}<br>${weatherLine(summary)}` });
      setStatus(status, `${place.name} · ${weatherLine(summary)}`, 'ok');
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  });
}

/* ---------------------------------------------------------------- EXPLORAR */
async function initExplorar() {
  const status = qs('#explorar-status') || ensureStatus(qs('.search'), '#explorar-status');
  const results = qs('#dest-results');
  const count = qs('#results-count');
  const pager = qs('#pager');
  const map = await initMap(qs('#explorar-map'), { center: [18, -20], zoom: 3 });
  const params = new URLSearchParams(location.search);

  const state = {
    all: [],
    visible: [],
    page: 1,
    perPage: 12,
    query: params.get('q') || '',
    region: 'Todos',
    extra: null
  };

  function filtered() {
    let list = state.all;
    if (state.region !== 'Todos') list = list.filter((item) => item.region === state.region);
    if (state.query) list = searchCountries(list, state.query);
    return list;
  }

  function renderPager(pages) {
    if (!pager) return;
    pager.innerHTML = '';
    for (let i = 1; i <= Math.max(1, pages); i += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `dot${i === state.page ? ' active' : ''}`;
      button.setAttribute('aria-label', `Página ${i}`);
      button.addEventListener('click', () => {
        state.page = i;
        render();
      });
      pager.appendChild(button);
    }
  }

  async function render() {
    state.visible = filtered();
    const pages = Math.max(1, Math.ceil(state.visible.length / state.perPage));
    state.page = Math.min(state.page, pages);
    const slice = state.visible.slice((state.page - 1) * state.perPage, state.page * state.perPage);

    renderCountryCards(results, slice);
    if (count) count.textContent = `${state.visible.length} destinos disponibles`;
    renderPager(pages);
    const markers = slice
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
      .map((item) => markerFor(item.name, item.lat, item.lon, `Capital: ${item.capital}`));
    if (state.extra) markers.push(markerFor(state.extra.name, state.extra.lat, state.extra.lon, state.extra.displayName));
    setMarkers(map, markers);

    try {
      const [enriched, rawWeather] = await Promise.all([
        enrichCountries(slice),
        getWeather(slice.map((item) => ({ lat: item.lat, lon: item.lon })))
      ]);
      const cards = results.querySelectorAll('.dest-card');
      enriched.forEach((country, index) => {
        appendLiveInfo(cards[index], summarizeWeather(rawWeather[index]), country.population);
      });
    } catch (error) {
      console.warn('[Nexora explorar] datos en vivo:', error);
    }
  }

  await safe('catálogo', async () => {
    state.all = await getCountries();
    const checked = qs('input[name="region"]:checked');
    state.region = checked?.id?.replace('f-', '') === 'todos' ? 'Todos' : (checked?.nextElementSibling?.textContent?.trim() || 'Todos');
    await render();
  });

  document.querySelectorAll('input[name="region"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.page = 1;
      state.region = input.nextElementSibling?.textContent?.trim() || 'Todos';
      render();
    });
  });

  const form = qs('.search');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = form.querySelector('input[type="search"]');
    state.query = input.value.trim();
    state.page = 1;
    setStatus(status, 'Buscando destino…');
    await render();
    try {
      state.extra = await geocode(state.query);
      setStatus(status, `Ubicación encontrada: ${state.extra.displayName}`, 'ok');
      addMarker(map, { lat: state.extra.lat, lon: state.extra.lon, popup: state.extra.displayName });
    } catch (error) {
      setStatus(status, `${error.message} Mostrando resultados del catálogo.`, 'error');
    }
  });
}

/* --------------------------------------------------------------- FAVORITOS */
async function initFavoritos() {
  const container = qs('#fav-results');
  const count = qs('#fav-count');
  const regions = qs('#fav-regions');
  const status = qs('#fav-status');
  const map = await initMap(qs('#fav-map'), { center: [18, -40], zoom: 3 });

  async function render() {
    const codes = getFavorites();
    const all = await getCountries();
    const favorites = all.filter((item) => codes.includes(item.iso2));
    renderFavoriteCards(container, favorites);
    if (count) count.textContent = String(favorites.length);
    if (regions) regions.textContent = String(new Set(favorites.map((item) => item.region)).size);
    setMarkers(map, favorites.map((item) => markerFor(item.name, item.lat, item.lon, `Capital: ${item.capital}`)));
    try {
      const [enriched, rawWeather] = await Promise.all([
        enrichCountries(favorites),
        getWeather(favorites.map((item) => ({ lat: item.lat, lon: item.lon })))
      ]);
      const cards = container.querySelectorAll('.fav-card');
      enriched.forEach((country, index) => {
        const card = cards[index];
        if (!card) return;
        const line = document.createElement('p');
        line.className = 'fav-live';
        line.textContent = `${summarizeWeather(rawWeather[index]).icon} ${weatherLine(summarizeWeather(rawWeather[index]))} · 👥 ${formatPopulation(country.population)}`;
        card.querySelector('.fav-body')?.appendChild(line);
      });
    } catch (error) {
      console.warn('[Nexora favoritos] datos en vivo:', error);
    }
  }

  await safe('favoritos', render);
  document.addEventListener('nexora:favorites-changed', () => safe('favoritos', render));
  if (status) setStatus(status, 'Tus favoritos se guardan en este navegador.', 'info');
}

/* -------------------------------------------------------------- FORMULARIO */
async function initFormulario() {
  const form = qs('[data-plan-form]');
  const input = qs('#destino');
  const datalist = qs('#destinos-list');
  const preview = qs('#form-preview');
  const status = ensureStatus(form, '#form-status');
  let all = [];

  await safe('catálogo', async () => {
    all = await getCountries();
    if (datalist) {
      datalist.innerHTML = all.map((item) => `<option value="${item.name}"></option>`).join('');
    }
  });

  async function resolveDestination() {
    const text = input?.value?.trim();
    if (!text) return null;
    const match = all.find((item) => item.name.toLocaleLowerCase('es') === text.toLocaleLowerCase('es'));
    if (match) return { name: match.name, lat: match.lat, lon: match.lon, country: match.name };
    return geocode(text);
  }

  input?.addEventListener('change', async () => {
    if (!preview) return;
    setStatus(preview, 'Consultando el clima del destino…');
    try {
      const place = await resolveDestination();
      const summary = summarizeWeather((await getWeather([place]))[0]);
      setStatus(preview, `${place.name}: ${weatherLine(summary)}`, 'ok');
    } catch (error) {
      setStatus(preview, error.message, 'error');
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(status, 'Resolviendo destino con OpenStreetMap…');
    try {
      const place = await resolveDestination();
      const params = new URLSearchParams(new FormData(form));
      params.set('destino', place.name);
      params.set('lat', String(place.lat));
      params.set('lon', String(place.lon));
      location.assign(`itinerario.html?${params.toString()}`);
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  });
}

/* -------------------------------------------------------------- ITINERARIO */
async function initItinerario() {
  const params = new URLSearchParams(location.search);
  const status = qs('#trip-status');
  const title = qs('#trip-title');
  const dates = qs('#trip-dates');
  const weather = qs('#trip-weather');
  const days = qs('#trip-days');
  const map = await initMap(qs('#trip-map'), { center: [10.4, -75.5], zoom: 6 });

  let place = {
    name: params.get('destino') || DEFAULT_TRIP.name,
    iso2: params.get('pais') || DEFAULT_TRIP.iso2,
    lat: Number(params.get('lat')),
    lon: Number(params.get('lon'))
  };

  if (title) title.textContent = place.name;
  const start = params.get('inicio');
  const end = params.get('fin');
  if (dates && start && end) {
    const from = new Date(`${start}T12:00:00`);
    const to = new Date(`${end}T12:00:00`);
    const count = Math.max(1, Math.round((to - from) / 86400000) + 1);
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    dates.textContent = `${from.toLocaleDateString('es-CO', options)} – ${to.toLocaleDateString('es-CO', options)}`;
    if (days) days.textContent = String(count);
  }

  await safe('clima', async () => {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) {
      const all = await getCountries();
      const match = all.find((item) => item.name.toLocaleLowerCase('es') === place.name.toLocaleLowerCase('es'));
      place = match
        ? { ...place, lat: match.lat, lon: match.lon, iso2: match.iso2 }
        : { ...place, lat: DEFAULT_TRIP.lat, lon: DEFAULT_TRIP.lon };
    }
    const raw = (await getWeather([place], { daily: true, days: 5 }))[0];
    const current = summarizeWeather(raw);
    const forecast = summarizeForecast(raw);
    const display = forecast[0] || current;
    if (weather) weather.textContent = `${display.max ?? display.temperature} °C`;
    if (status) setStatus(status, `Pronóstico de Open-Meteo: ${display.icon} ${display.label}. Máxima de hoy ${display.max ?? display.temperature} °C.`, 'ok');
    setMarkers(map, [markerFor(place.name, place.lat, place.lon, `Clima: ${weatherLine(current)}`)]);
    const slides = document.querySelectorAll('.day-slide').length;
    document.documentElement.style.setProperty('--ciclo', `${Math.max(1, slides) * 4}s`);
  });
}

/* -------------------------------------------------------------------- LOGIN */
async function initLogin() {
  const panel = qs('#login-api');
  if (!panel) return;
  const map = await initMap(qs('#login-map'), { center: [4.6, -74.1], zoom: 5 });
  await safe('clima', async () => {
    const all = await getCountries();
    const options = ['CO', 'MX', 'ES', 'AR', 'PE', 'JP'];
    const list = all.filter((item) => options.includes(item.iso2));
    panel.innerHTML = `
      <div class="api-panel-head">
        <span class="api-badge">● Datos en vivo</span>
        <label for="login-pais">Clima en tu país</label>
        <select id="login-pais" class="api-select">
          ${list.map((item) => `<option value="${item.iso2}">${item.name}</option>`).join('')}
        </select>
      </div>
      <p id="login-weather" class="api-big" aria-live="polite">Consultando clima…</p>`;

    async function update(iso2) {
      const country = list.find((item) => item.iso2 === iso2) || list[0];
      const summary = summarizeWeather((await getWeather([country]))[0]);
      const element = qs('#login-weather');
      if (element) element.textContent = `${country.flag} ${country.name}: ${weatherLine(summary)}`;
      setMarkers(map, [markerFor(country.name, country.lat, country.lon, weatherLine(summary))]);
    }

    qs('#login-pais')?.addEventListener('change', (event) => safe('clima', () => update(event.target.value)));
    await update(list[0]?.iso2);
  });
}

/* ---------------------------------------------------------------- NOSOTROS */
async function initNosotros() {
  const panel = qs('#nosotros-api');
  const map = await initMap(qs('#nosotros-map'), { center: [10, -60], zoom: 3 });
  await safe('estadísticas', async () => {
    const all = await getCountries();
    const sample = all.filter((item) => ['CO', 'JP', 'IT', 'PE', 'MA', 'AU'].includes(item.iso2));
    const summaries = (await getWeather(sample)).map(summarizeWeather);
    if (panel) {
      panel.innerHTML = `
        <div class="api-stats">
          <div><strong>${all.length}</strong><span>países en el catálogo</span></div>
          <div><strong>${new Set(all.map((item) => item.region)).size}</strong><span>regiones consultables</span></div>
          <div><strong>${summaries[0]?.temperature ?? '—'} °C</strong><span>clima actual en Bogotá</span></div>
        </div>
        <p class="api-note">Datos de países: mledoze / Banco Mundial · Clima: Open-Meteo · Mapas: OpenStreetMap.</p>`;
    }
    setMarkers(map, sample.map((item, index) => markerFor(item.name, item.lat, item.lon, weatherLine(summaries[index]))));
  });
}

const initializers = {
  home: initHome,
  explorar: initExplorar,
  favoritos: initFavoritos,
  formulario: initFormulario,
  itinerario: initItinerario,
  login: initLogin,
  nosotros: initNosotros
};

initializers[page]?.();
