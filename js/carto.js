// Carte : MapLibre avec les fonds vectoriels gratuits d'OpenFreeMap (sans compte ni clé).
// Les écrans n'utilisent que l'objet renvoyé par creerCarte(), jamais la bibliothèque directement.
import { S } from './store.js';
import { icon } from './ui.js';
import { departements, getVar } from './geo.js';

const sombre = () => document.documentElement.classList.contains('sombre');
const STYLE = () => `https://tiles.openfreemap.org/styles/${sombre() ? 'dark' : 'positron'}`;
// Fond neutre utilisé quand le fond de carte ne peut pas être chargé (pas de réseau) :
// les départements et les clients restent visibles.
const fondVide = () => ({ version: 8, sources: {}, layers: [{ id: 'fond', type: 'background', paint: { 'background-color': getVar('--surface-2') } }] });

const el = html => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; };
const ptHTML = (statut, sel) => `<button class="pt pt-${statut}${sel ? ' pt-sel' : ''}" type="button"></button>`;
const homeHTML = () => `<div class="home" title="Domicile">${icon('home')}</div>`;
const stopHTML = n => `<div class="stopn">${n}</div>`;

function bornes(list) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const [lat, lng] of list) { w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat); }
  return [[w, s], [e, n]];
}
function bornesGeo(features) {
  const pts = [];
  const walk = c => (typeof c[0] === 'number' ? pts.push([c[1], c[0]]) : c.forEach(walk));
  features.forEach(f => walk(f.geometry.coordinates));
  return bornes(pts);
}

export async function creerCarte(conteneur, opts = {}) {
  const ml = window.maplibregl;
  const p = opts.padding || [40, 30, 40, 30];
  const padding = { top: p[0], right: p[1], bottom: p[2], left: p[3] };
  const g = await departements(), suivis = new Set(S.reglages.deps);
  const deps = { type: 'FeatureCollection', features: g.features.filter(f => suivis.has(f.properties.code)) };
  const depart = deps.features.length ? bornesGeo(deps.features) : [[-1.5, 44], [4.5, 49]];

  const map = new ml.Map({
    container: conteneur,
    style: navigator.onLine ? STYLE() : fondVide(),
    bounds: depart, fitBoundsOptions: { padding },
    attributionControl: { compact: true },
    dragRotate: false, pitchWithRotate: false, touchPitch: false,
    maxZoom: 17, minZoom: 4,
  });
  map.touchZoomRotate.disableRotation();
  if (!opts.noZoom && matchMedia('(min-width:900px)').matches) map.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right');

  // Couches à (re)poser à chaque chargement de style.
  let routes = { type: 'FeatureCollection', features: [] }, styleOK = false;
  const couches = () => {
    styleOK = true;
    const ligne = getVar('--dep-line');
    if (!map.getSource('deps')) map.addSource('deps', { type: 'geojson', data: deps });
    if (!map.getLayer('deps-fond')) map.addLayer({ id: 'deps-fond', type: 'fill', source: 'deps', paint: { 'fill-color': ligne, 'fill-opacity': .07 } });
    if (!map.getLayer('deps-trait')) map.addLayer({ id: 'deps-trait', type: 'line', source: 'deps', paint: { 'line-color': ligne, 'line-width': 1.8, 'line-opacity': .8 } });
    if (!map.getSource('routes')) map.addSource('routes', { type: 'geojson', data: routes });
    if (!map.getLayer('routes')) map.addLayer({ id: 'routes', type: 'line', source: 'routes', filter: ['!', ['get', 'dashed']],
      layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': .9 } });
    if (!map.getLayer('routes-est')) map.addLayer({ id: 'routes-est', type: 'line', source: 'routes', filter: ['get', 'dashed'],
      layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': .85, 'line-dasharray': [1.5, 2] } });
  };
  map.on('style.load', couches);
  const secours = () => { if (!styleOK) map.setStyle(fondVide()); };
  map.on('error', secours);
  setTimeout(secours, 8000);

  let pts = [], home = null, stops = [], moi = null, dernierChoix = 0;
  const marqueur = (html, lat, lng, onClick) => {
    const e = el(html);
    if (onClick) e.addEventListener('click', ev => { ev.stopPropagation(); dernierChoix = Date.now(); onClick(); });
    return new ml.Marker({ element: e, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
  };

  return {
    points(list, selId, onClick) {
      pts.forEach(m => m.remove());
      // Le point choisi est posé en dernier pour passer au-dessus des autres.
      const tri = list.slice().sort((a, b) => (a.id === selId) - (b.id === selId));
      pts = tri.map(c => {
        const m = marqueur(ptHTML(c.statut, c.id === selId), c.lat, c.lng, () => onClick(c.id));
        m.getElement().setAttribute('aria-label', c.nom); m.getElement().title = c.nom;
        return m;
      });
    },
    home(pt) { if (home) home.remove(); home = pt ? marqueur(homeHTML(), pt.lat, pt.lng) : null; },
    route(lignes, arrets) {
      routes = { type: 'FeatureCollection', features: lignes.filter(l => l.coords.length > 1).map(l => ({
        type: 'Feature', properties: { color: l.color, dashed: !!l.dashed }, geometry: { type: 'LineString', coordinates: l.coords.map(([a, b]) => [b, a]) } })) };
      if (map.getSource('routes')) map.getSource('routes').setData(routes);
      stops.forEach(m => m.remove());
      stops = arrets.map(s => { const m = marqueur(stopHTML(s.n), s.lat, s.lng); m.getElement().title = s.title; return m; });
    },
    fit(list, large) {
      if (!list.length) return;
      if (list.length === 1) { map.easeTo({ center: [list[0][1], list[0][0]], zoom: 10, padding }); return; }
      map.fitBounds(bornes(list), { padding, maxZoom: large ? 10 : 14, duration: 500 });
    },
    moi(lat, lng) {
      if (moi) moi.setLngLat([lng, lat]); else moi = marqueur('<div class="moi"></div>', lat, lng);
      map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 10) });
    },
    onTap(fn) { map.on('click', () => { if (Date.now() - dernierChoix > 300) fn(); }); },
    resize() { map.resize(); },
    destroy() { map.remove(); },
  };
}
