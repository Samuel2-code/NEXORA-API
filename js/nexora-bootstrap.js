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
      try {
        const summary = summarizeWeather((await getWeather([place]))[0]);
        renderWeather(weatherCard, summary, place.name);
        addMarker(map, { lat: place.lat, lon: place.lon, popup: `${place.name}<br>${weatherLine(summary)}` });
        setStatus(status, `${place.name} · ${weatherLine(summary)}. Abriendo itinerario…`, 'ok');
      } catch (weatherError) {
        console.warn('[Nexora inicio] clima:', weatherError);
        setStatus(status, `${place.name} encontrado. Abriendo itinerario…`, 'ok');
      }

      const params = new URLSearchParams({
        destino: place.name,
        lat: String(place.lat),
        lon: String(place.lon),
        pais: place.iso2 || ''
      });
      const tripPage = location.pathname.includes('/inicio/') ? 'itinerario.html' : 'inicio/itinerario.html';
      setTimeout(() => location.assign(`${tripPage}?${params.toString()}`), 900);
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
function flagEmoji(iso2) {
  const code = String(iso2 || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '🌍';
  return String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)));
}

function makeEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDay(date) {
  const text = new Intl.DateTimeFormat('es-CO', {
    weekday: 'short', day: 'numeric', month: 'short'
  }).format(date).replace('.', '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatRange(from, count) {
  const to = new Date(from.getTime() + (count - 1) * 86400000);
  const full = { day: 'numeric', month: 'long', year: 'numeric' };
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  if (sameMonth) {
    const month = new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(to);
    return `${from.getDate()} – ${to.getDate()} de ${month} de ${to.getFullYear()}`;
  }
  return `${new Intl.DateTimeFormat('es-CO', full).format(from)} – ${new Intl.DateTimeFormat('es-CO', full).format(to)}`;
}

const DAY_TEMPLATES = [
  (place, capital) => ({
    title: `Llegada a ${place.name}`,
    items: [
      { time: '09:00', title: `Bienvenida a ${place.name}`, description: capital ? `Comienza tu recorrido en ${capital}, su capital.` : 'Primer contacto con el destino.' },
      { time: '11:00', title: 'Centro histórico', description: 'Caminata guiada por el casco urbano.' },
      { time: '19:30', title: 'Cena local', description: 'Prueba la gastronomía de la región.' }
    ]
  }),
  (place) => ({
    title: `Explora ${place.name}`,
    items: [
      { time: '08:30', title: 'Mercado local', description: 'Productos frescos y artesanías típicas.' },
      { time: '13:00', title: 'Lugares emblemáticos', description: 'Recorrido por los sitios más visitados.' },
      { time: '18:00', title: 'Atardecer', description: 'Tiempo libre para fotografías.' }
    ]
  }),
  (place) => ({
    title: `Cultura y sabores de ${place.name}`,
    items: [
      { time: '10:00', title: 'Museos y tradiciones', description: 'Conoce la historia del destino.' },
      { time: '14:00', title: 'Taller local', description: 'Actividad con artesanos de la zona.' },
      { time: '17:00', title: 'Compras y despedida', description: `Recuerdos de ${place.name}.` }
    ]
  })
];

function applyCarouselTiming(count) {
  const total = count + 1;
  const step = 100 / total;
  const frames = [];
  const dotFrames = [];

  for (let i = 0; i <= count; i += 1) {
    const start = i * step;
    const hold = (i + 1) * step - 0.75;
    frames.push(`${start.toFixed(3)}%, ${hold.toFixed(3)}% { transform: translateX(-${start.toFixed(3)}%); }`);
  }
  frames.push('100% { transform: translateX(0); }');

  for (let i = 0; i < count; i += 1) {
    const start = i * step;
    const end = (i + 1) * step;
    const before = i === 0 ? '' : `0%, ${(start - 0.75).toFixed(3)}% { background: var(--linea); }`;
    dotFrames.push(`@keyframes tripPunto-${i} {
      ${before}
      ${start.toFixed(3)}%, ${(end - 0.75).toFixed(3)}% { background: var(--coral); }
      ${end.toFixed(3)}%, 100% { background: var(--linea); }
    }`);
  }

  let style = qs('#trip-carousel-dynamic');
  if (!style) {
    style = document.createElement('style');
    style.id = 'trip-carousel-dynamic';
    document.head.appendChild(style);
  }
  style.textContent = `
    @keyframes tripDeslizar { ${frames.join(' ')} }
    .carousel-track {
      width: ${total * 100}% !important;
      animation-name: tripDeslizar !important;
      animation-duration: ${count * 4}s !important;
    }
    .day-slide { flex: 0 0 ${step.toFixed(4)}% !important; }
    ${dotFrames.join('\n')}
  `;

  document.documentElement.style.setProperty('--ciclo', `${count * 4}s`);
  document.querySelectorAll('.carousel-dots .dot').forEach((dot, index) => {
    dot.style.animationName = `tripPunto-${index}`;
  });
}

function renderTripSlides(place, capital, startDate, count) {
  const track = qs('.carousel-track');
  const dots = qs('.carousel-dots');
  if (!track) return;

  const plans = Array.from({ length: count }, (_, index) => {
    const build = DAY_TEMPLATES[index % DAY_TEMPLATES.length];
    const plan = build(place, capital);
    return index < DAY_TEMPLATES.length ? plan : { ...plan, title: `Día ${index + 1} en ${place.name}` };
  });
  const labels = plans.map((_, index) =>
    formatDay(new Date(startDate.getTime() + index * 86400000))
  );

  const slides = Array.from({ length: count + 1 }, (_, index) => {
    const plan = plans[index % count];
    const article = makeEl('article', 'day-slide');
    if (index === count) article.setAttribute('aria-hidden', 'true');

    const head = makeEl('header', 'day-head');
    const info = makeEl('div');
    info.append(
      makeEl('span', 'day-label', `Día ${(index % count) + 1}`),
      makeEl('h3', null, plan.title)
    );
    head.append(info, makeEl('span', 'day-date', labels[index % count]));

    const timeline = makeEl('ol', 'timeline');
    plan.items.forEach((item, itemIndex) => {
      const entry = makeEl('li', `act act-${['coral', 'teal', 'dorado', 'navy'][itemIndex % 4]}`);
      entry.append(makeEl('time', null, item.time));
      const body = makeEl('div');
      body.append(makeEl('h4', null, item.title), makeEl('p', null, item.description));
      entry.append(body);
      timeline.append(entry);
    });

    const add = makeEl('button', 'add-act', '+ Agregar actividad');
    add.type = 'button';
    article.append(head, timeline, add);
    return article;
  });

  track.replaceChildren(...slides);
  if (dots) dots.replaceChildren(...Array.from({ length: count }, () => makeEl('span', 'dot')));
  applyCarouselTiming(count);
}

async function initItinerario() {
  const params = new URLSearchParams(location.search);
  const status = qs('#trip-status');
  const title = qs('#trip-title');
  const dates = qs('#trip-dates');
  const weather = qs('#trip-weather');
  const days = qs('#trip-days');
  const activities = qs('#trip-activities');
  const flag = qs('.trip-flag');
  const map = await initMap(qs('#trip-map'), { center: [10.4, -75.5], zoom: 6 });

  const place = {
    name: params.get('destino') || DEFAULT_TRIP.name,
    iso2: params.get('pais') || DEFAULT_TRIP.iso2,
    lat: Number(params.get('lat')),
    lon: Number(params.get('lon'))
  };

  const startValue = params.get('inicio');
  const startDate = startValue ? new Date(`${startValue}T12:00:00`) : new Date();
  if (Number.isNaN(startDate.getTime())) startDate.setTime(Date.now());
  startDate.setHours(12, 0, 0, 0);

  const endValue = params.get('fin');
  const endDate = endValue ? new Date(`${endValue}T12:00:00`) : null;
  let count = 3;
  if (endDate && !Number.isNaN(endDate.getTime())) {
    count = Math.min(8, Math.max(1, Math.round((endDate - startDate) / 86400000) + 1));
  }

  let country = null;
  try {
    const all = await getCountries();
    country = all.find((item) => item.iso2 === place.iso2) ||
      all.find((item) => item.name.toLocaleLowerCase('es') === place.name.toLocaleLowerCase('es')) || null;
  } catch (error) {
    console.warn('[Nexora itinerario] catálogo:', error);
  }

  if (country && (!Number.isFinite(place.lat) || !Number.isFinite(place.lon))) {
    place.lat = country.lat;
    place.lon = country.lon;
    place.iso2 = country.iso2;
  }
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) {
    place.lat = DEFAULT_TRIP.lat;
    place.lon = DEFAULT_TRIP.lon;
  }

  if (title) title.textContent = place.name;
  if (flag) flag.textContent = flagEmoji(place.iso2);
  if (dates) dates.textContent = formatRange(startDate, count);
  if (days) days.textContent = String(count);
  if (activities) activities.textContent = String(count * 3);
  document.title = `${place.name} | Mi itinerario | Nexora`;
  renderTripSlides(place, country?.capital, startDate, count);

  if (map) map.setView([place.lat, place.lon], 6);

  await safe('clima', async () => {
    const raw = (await getWeather([place], { daily: true, days: 5 }))[0];
    const current = summarizeWeather(raw);
    const forecast = summarizeForecast(raw);
    const display = forecast[0] || current;
    if (weather) weather.textContent = `${display.max ?? display.temperature} °C`;
    if (status) {
      setStatus(status, `${place.name}: ${display.icon} ${display.label}. Máxima de hoy ${display.max ?? display.temperature} °C.`, 'ok');
    }
    setMarkers(map, [markerFor(place.name, place.lat, place.lon, `Clima: ${weatherLine(current)}`)]);
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
