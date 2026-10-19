// Écran d'accueil : la carte du secteur.
import { S, statut, clientsSecteur, rappels, ca, periode, client, STATUT_LABEL } from '../store.js';
import { esc, eur, icon, pill, depuis, modal } from '../ui.js';
import { lienGPS } from '../geo.js';
import { creerCarte } from '../carto.js';

const F = { statut: 'tous', dep: 'tous' };   // filtres gardés le temps de la session

export async function render(root) {
  root.innerHTML = `
  <div class="carte">
    <div class="map-wrap"><div id="map" style="position:absolute;inset:0"></div>
      <div class="float top">
        <div class="bar1">
          <span class="logo-chip"><img class="logo" src="icons/logo.webp" alt="FirstDiff"></span>
          <span style="flex:1"></span>
          <button class="iconbtn" id="loc" aria-label="Ma position">${icon('locate')}</button>
          <a class="iconbtn only-m" href="#/reglages" aria-label="Réglages">${icon('reglages')}</a>
        </div>
        <div class="chips" id="filtres"></div>
      </div>
      <div class="sheet" id="sheet"></div>
    </div>
    <aside class="panel only-d" id="panel"></aside>
  </div>`;

  const desk = matchMedia('(min-width:900px)').matches;
  const carte = await creerCarte(root.querySelector('#map'), { padding: desk ? [90, 30, 30, 30] : [130, 20, 90, 20] });
  let sel = null, rappelsOuvert = false;
  const p12 = periode('12mois');

  if (S.reglages.domicile && S.reglages.domicile.lat != null) carte.home(S.reglages.domicile);

  const visibles = () => clientsSecteur().filter(c => c.lat != null
    && (F.statut === 'tous' || statut(c.id) === F.statut)
    && (F.dep === 'tous' || c.dep === F.dep));

  function filtres() {
    const cl = clientsSecteur();
    const n = s => cl.filter(c => statut(c.id) === s).length;
    const chip = (k, txt, dot) => `<button class="chip${F.statut === k ? ' on' : ''}" data-s="${k}">${dot ? `<span class="dot d-${k}"></span>` : ''}${txt}</button>`;
    root.querySelector('#filtres').innerHTML =
      chip('tous', `Tous · ${cl.length}`) + chip('late', `${STATUT_LABEL.late} · ${n('late')}`, 1) + chip('warn', `${STATUT_LABEL.warn} · ${n('warn')}`, 1) + chip('ok', `${STATUT_LABEL.ok} · ${n('ok')}`, 1) +
      `<button class="chip${F.dep !== 'tous' ? ' on' : ''}" id="depbtn">${F.dep === 'tous' ? 'Départements' : 'Dép. ' + F.dep}</button>`;
    root.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { F.statut = b.dataset.s; sel = null; draw(); });
    root.querySelector('#depbtn').onclick = choisirDep;
  }
  function choisirDep() {
    const deps = S.reglages.deps.slice().sort();
    modal(`<h2>Afficher un département</h2><div class="deps">
      <button class="chip${F.dep === 'tous' ? ' on' : ''}" data-d="tous">Tous</button>
      ${deps.map(d => `<button class="chip${F.dep === d ? ' on' : ''}" data-d="${d}">${d}</button>`).join('')}</div>
      <button class="btn btn-s" data-close>Fermer</button>`, (m, close) => {
      m.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { F.dep = b.dataset.d; sel = null; close(); draw(true); });
    });
  }

  function points(fit) {
    const list = visibles();
    carte.points(list.map(c => ({ id: c.id, nom: c.nom, lat: c.lat, lng: c.lng, statut: statut(c.id) })), sel, id => { sel = id; draw(); });
    if (fit && list.length) carte.fit(list.map(c => [c.lat, c.lng]), true);
  }

  function apercu(c) {
    const s = statut(c.id);
    return `<div style="display:flex;gap:10px;align-items:flex-start">
        <div style="flex:1;min-width:0"><h3>${esc(c.nom)}</h3><p class="muted">${esc(c.ville || '')}${c.dep ? ` (${esc(c.dep)})` : ''}</p></div>
        <button class="iconbtn" id="fermer" aria-label="Fermer" style="border:0">${icon('close')}</button></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0 14px">${pill(s)}<span class="muted">${depuis(c.id)}</span></div>
      <div class="kpi" style="margin-bottom:14px"><span class="lbl">Chiffre d'affaires 12 mois</span><b class="num">${eur(ca(c.id, p12.from, p12.to))}</b></div>
      <div style="display:flex;gap:10px"><a class="btn btn-s" style="flex:1" href="#/client/${c.id}">Voir la fiche</a>
      <a class="btn btn-p" style="flex:1" target="_blank" rel="noopener" href="${lienGPS(null, [c])}">${icon('go')}Y aller</a></div>`;
  }
  function listeRappels(r) {
    if (!r.length) return `<p class="muted">Rien d'urgent. Tous vos clients ont été vus récemment.</p>`;
    return r.map(x => `<a class="rappel" href="${x.href || '#/client/' + x.clientId}">
      <span class="dot d-${x.kind === 'info' ? 'ok' : x.kind}" ${x.kind === 'info' ? 'style="background:var(--accent)"' : ''}></span>
      <span style="flex:1;min-width:0"><b>${esc(x.titre)}</b><br><span class="small muted">${esc(x.texte)}</span></span>${icon('next', 'ic ic-s')}</a>`).join('');
  }
  function sheet() {
    const el = root.querySelector('#sheet');
    const r = rappels();
    const c = sel && client(sel);
    const desktop = matchMedia('(min-width:900px)').matches;
    if (c) { el.hidden = false; el.innerHTML = apercu(c); el.querySelector('#fermer').onclick = () => { sel = null; draw(); }; return; }
    if (desktop) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<button class="grab" aria-label="Ouvrir ou fermer"></button>
      <button id="rtoggle" style="all:unset;display:flex;align-items:center;gap:10px;width:100%;cursor:pointer">
        <h3 style="flex:1">À ne pas oublier</h3><span class="pill ${r.length ? 'p-late' : 'p-ok'}">${r.length}</span>${icon(rappelsOuvert ? 'down' : 'up', 'ic ic-s')}</button>
      ${rappelsOuvert ? `<div style="margin-top:6px">${listeRappels(r)}</div>` : ''}`;
    const t = () => { rappelsOuvert = !rappelsOuvert; sheet(); };
    el.querySelector('#rtoggle').onclick = t; el.querySelector('.grab').onclick = t;
  }
  function panel() {
    const el = root.querySelector('#panel'); const r = rappels();
    const sans = clientsSecteur().filter(c => c.lat == null).length;
    el.innerHTML = `<div><h2>À ne pas oublier</h2><p class="muted small">${r.length ? r.length + ' point' + (r.length > 1 ? 's' : '') + ' à regarder' : ''}</p></div>
      <div>${listeRappels(r)}</div>
      ${sans ? `<div class="warnbox">${sans} client${sans > 1 ? 's' : ''} sans position sur la carte. Vérifiez leur adresse dans la fiche.</div>` : ''}
      <a class="btn btn-p" href="#/tournee">${icon('tournee')}Préparer une tournée</a>`;
  }
  function draw(fit) { filtres(); points(fit); sheet(); panel(); }
  draw(F.dep !== 'tous');
  carte.onTap(() => { if (sel) { sel = null; draw(); } });

  root.querySelector('#loc').onclick = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(p => carte.moi(p.coords.latitude, p.coords.longitude), () => {}, { enableHighAccuracy: true, timeout: 10000 });
  };
  const onResize = () => { carte.resize(); sheet(); };
  window.addEventListener('resize', onResize);
  return () => { window.removeEventListener('resize', onResize); carte.destroy(); };
}
