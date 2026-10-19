// Coquille de l'application : navigation, thème, écran courant.
import * as store from './store.js';
import { S } from './store.js';
import { icon, esc } from './ui.js';
import { persist } from './db.js';
import { geocoderManquants } from './geo.js';

const VIEWS = {
  carte: () => import('./views/carte.js'),
  clients: () => import('./views/clients.js'),
  client: () => import('./views/fiche.js'),
  classement: () => import('./views/classement.js'),
  tournee: () => import('./views/tournee.js'),
  import: () => import('./views/import.js'),
  reglages: () => import('./views/reglages.js'),
  bienvenue: () => import('./views/bienvenue.js'),
};
const NAV = [
  ['carte', 'Carte'], ['clients', 'Clients'], ['classement', 'Classement'], ['tournee', 'Tournée'], ['import', 'Import'], ['reglages', 'Réglages'],
];

function applyTheme() {
  const t = S.reglages.theme;
  const dark = t === 'sombre' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('sombre', dark);
  document.querySelector('meta[name=theme-color]').setAttribute('content', dark ? '#0D1311' : '#F2F5F1');
}

function shell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <aside class="side" aria-label="Navigation">
      <img class="logo" src="icons/logo.webp" alt="FirstDiff">
      ${NAV.map(([k, l]) => `<a class="nav" data-k="${k}" href="#/${k}">${icon(k)}${l}</a>`).join('')}
      <div class="who"><span class="avatar">JR</span><div><b>Jérôme Rivault</b><div class="small faint">Agent commercial</div></div></div>
    </aside>
    <main id="main"></main>
    <nav class="tabbar" aria-label="Navigation principale">
      ${NAV.slice(0, 5).map(([k, l]) => `<a class="tab" data-k="${k}" href="#/${k}">${icon(k)}${l}</a>`).join('')}
    </nav>`;
}

// Barre du haut sur téléphone (logo + accès aux réglages).
export function topbar(titreRetour) {
  return `<div class="topbar">${titreRetour
    ? `<a class="iconbtn" href="${titreRetour}" aria-label="Retour">${icon('back')}</a>`
    : `<img class="logo" src="icons/logo.webp" alt="FirstDiff">`}
    <span class="sp"></span><a class="iconbtn" href="#/reglages" aria-label="Réglages">${icon('reglages')}</a></div>`;
}

let cleanup = null, token = 0;
async function route() {
  const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  let view = name || 'carte';
  if (!VIEWS[view]) view = 'carte';
  if (view === 'carte' && !S.clients.length) view = 'bienvenue';
  const my = ++token;
  const mod = await VIEWS[view]();
  if (my !== token) return;
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  const main = document.getElementById('main');
  main.innerHTML = '';
  main.scrollTop = 0; window.scrollTo(0, 0);
  const navKey = view === 'client' ? 'clients' : view === 'bienvenue' ? 'carte' : view;
  document.querySelectorAll('[data-k]').forEach(a => a.classList.toggle('on', a.dataset.k === navKey));
  document.body.dataset.view = view;
  cleanup = (await mod.render(main, params)) || null;
}

export const go = h => { if (location.hash === h) route(); else location.hash = h; };
export const refresh = () => route();

async function start() {
  try { await store.load(); }
  catch (e) {
    document.getElementById('app').innerHTML = `<div class="page"><h1>Impossible d'ouvrir les données</h1><p class="muted">${esc(e.message)}</p></div>`;
    return;
  }
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  store.onChange(applyTheme);
  shell();
  persist();
  window.addEventListener('hashchange', route);
  await route();
  // Positions des clients importés sans coordonnées, en tâche de fond.
  geocoderManquants(store.saveClient);
  window.addEventListener('online', () => geocoderManquants(store.saveClient));
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
