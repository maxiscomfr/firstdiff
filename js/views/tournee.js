// Préparation d'une tournée : les clients les moins vus, découpés en journées.
import * as st from '../store.js';
import { S } from '../store.js';
import { esc, icon, depuis, toast, confirmer, dateFr } from '../ui.js';
import { itineraire, estimRoute, lienGPS, lienHotels, duree, getVar, multiEtapes } from '../geo.js';
import { creerCarte } from '../carto.js';
import { topbar } from '../app.js';

const F = { deps: null, nb: null, exclus: new Set() };

export async function render(root) {
  const R = S.reglages;
  if (!F.deps) {
    // Par défaut : le département qui compte le plus de clients en retard.
    const c = {}; for (const x of st.clientsSecteur()) if (st.statut(x.id) === 'late' && x.dep) c[x.dep] = (c[x.dep] || 0) + 1;
    const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    F.deps = new Set(best ? [best[0]] : R.deps.slice(0, 1));
  }
  if (!F.nb) F.nb = R.maxParJour * 3;
  let carte, cancelled = false, gen = 0;

  root.innerHTML = topbar() + `<div class="page"><div class="page-head"><h1>Tournée</h1></div>
    <div class="grid2">
      <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
        <div class="card"><span class="lbl">Départements</span><div class="deps" id="deps" style="margin:10px 0 16px"></div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span style="flex:1;font-weight:700">Nombre de clients</span>
            <div class="step"><button id="m" aria-label="Moins">${icon('minus')}</button><span class="num" id="nb"></span><button id="p" aria-label="Plus">${icon('plus')}</button></div></div>
          <p class="small muted" style="margin-top:10px">Les clients les moins vus passent en premier, ${R.maxParJour} par jour au maximum.</p></div>
        <div id="plan"></div>
      </div>
      <div style="min-width:0"><div class="map-wrap" style="aspect-ratio:1/1;max-height:70vh;position:sticky;top:24px"><div id="tmap" style="position:absolute;inset:0"></div></div>
        <p class="small faint" id="src" style="margin-top:8px"></p></div>
    </div></div>`;

  const depsEl = root.querySelector('#deps');
  function chipsDeps() {
    depsEl.innerHTML = R.deps.slice().sort().map(d => `<button class="chip${F.deps.has(d) ? ' on' : ''}" data-d="${d}">${d}</button>`).join('');
    depsEl.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { F.deps.has(b.dataset.d) ? F.deps.delete(b.dataset.d) : F.deps.add(b.dataset.d); F.exclus.clear(); chipsDeps(); calc(); });
  }
  chipsDeps();
  const nbEl = root.querySelector('#nb');
  root.querySelector('#m').onclick = () => { F.nb = Math.max(1, F.nb - 1); calc(); };
  root.querySelector('#p').onclick = () => { F.nb = Math.min(40, F.nb + 1); calc(); };

  carte = await creerCarte(root.querySelector('#tmap'), { padding: [30, 30, 30, 30], noZoom: true });
  if (R.domicile && R.domicile.lat != null) carte.home(R.domicile);
  calc();

  async function calc() {
    const my = ++gen;
    nbEl.textContent = F.nb;
    const home = R.domicile && R.domicile.lat != null ? R.domicile : null;
    const cand = st.clientsSecteur().filter(c => F.deps.has(c.dep) && c.lat != null && !F.exclus.has(c.id))
      .sort((a, b) => (st.joursSansVisite(b.id) ?? 1e9) - (st.joursSansVisite(a.id) ?? 1e9)).slice(0, F.nb);
    const plan = root.querySelector('#plan');
    carte.route([], []);
    if (!cand.length) { plan.innerHTML = `<div class="card empty">Choisissez au moins un département qui a des clients placés sur la carte.</div>`; return; }

    // Regroupement : on tourne autour du domicile pour que chaque journée reste dans un même coin du secteur.
    let ordre = cand.slice();
    if (home && ordre.length > 1) {
      const k = Math.cos(home.lat * Math.PI / 180);
      const ang = c => Math.atan2(c.lat - home.lat, (c.lng - home.lng) * k);
      ordre.sort((a, b) => ang(a) - ang(b));
      let gap = -1, at = 0;
      ordre.forEach((c, i) => { const n = ordre[(i + 1) % ordre.length]; let g = ang(n) - ang(c); if (g <= 0) g += 2 * Math.PI; if (g > gap) { gap = g; at = (i + 1) % ordre.length; } });
      ordre = [...ordre.slice(at), ...ordre.slice(0, at)];
    }
    const jours = [];
    for (let i = 0; i < ordre.length; i += R.maxParJour) jours.push({ stops: ordre.slice(i, i + R.maxParJour) });
    // Dans chaque journée : toujours le client le plus proche d'abord.
    const plusProche = (from, list) => { const reste = list.slice(), out = []; let pos = from || reste[0]; while (reste.length) { reste.sort((a, b) => estimRoute(pos, a).km - estimRoute(pos, b).km); pos = reste.shift(); out.push(pos); } return out; };
    let depart = home;
    jours.forEach((j, i) => {
      j.depart = depart;
      j.stops = plusProche(depart, j.stops);
      const last = j.stops[j.stops.length - 1];
      const loin = home && estimRoute(last, home).km > R.hotelKm;
      j.hotel = i < jours.length - 1 && loin ? last : null;
      j.arrivee = j.hotel ? null : home;
      depart = j.hotel || home;
    });
    rendu(jours, null);
    // Distances réelles par la route, journée par journée.
    const res = [];
    for (const j of jours) {
      const pts = [j.depart, ...j.stops, j.arrivee].filter(Boolean);
      res.push(pts.length > 1 ? await itineraire(pts) : { km: 0, min: 0, ligne: [], reel: true });
      if (my !== gen || cancelled) return;
    }
    rendu(jours, res);
  }

  function rendu(jours, res) {
    const home = R.domicile && R.domicile.lat != null ? R.domicile : null;
    const tot = res ? res.reduce((s, r) => ({ km: s.km + r.km, min: s.min + r.min }), { km: 0, min: 0 }) : null;
    let n = 0;
    root.querySelector('#plan').innerHTML = `<div class="card">
      <div class="card-h"><h3>${jours.length} jour${jours.length > 1 ? 's' : ''}, ${jours.reduce((s, j) => s + j.stops.length, 0)} clients</h3>
        <span class="num muted">${tot ? `${Math.round(tot.km)} km · ${duree(tot.min)}` : 'Calcul…'}</span></div>
      ${!home ? `<p class="warnbox">Indiquez votre adresse de départ dans les Réglages pour calculer les trajets depuis chez vous.</p>` : ''}
      ${jours.map((j, i) => `<div class="day">
        <div style="display:flex;align-items:center;gap:10px"><h3 style="flex:1">Jour ${i + 1}</h3>
          <span class="small muted num">${res ? `${Math.round(res[i].km)} km · ${duree(res[i].min)}` : ''}</span></div>
        ${j.stops.map(c => `<div class="stop"><span class="n">${++n}</span>
          <a href="#/client/${c.id}" style="flex:1;min-width:0;text-decoration:none;color:var(--ink)"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.nom)}</b>
          <span class="small muted">${esc(c.ville || '')} · ${depuis(c.id)}</span></a>
          ${multiEtapes() ? '' : `<a class="iconbtn" style="width:44px;height:44px;color:var(--accent-text)" target="_blank" rel="noopener" href="${lienGPS(null, [c])}" aria-label="Y aller">${icon('go', 'ic ic-s')}</a>`}
          <button class="iconbtn" style="border:0;width:40px;height:40px" data-x="${c.id}" aria-label="Retirer de la tournée">${icon('close', 'ic ic-s')}</button></div>`).join('')}
        ${j.hotel ? `<a class="hotel" target="_blank" rel="noopener" href="${lienHotels(j.hotel)}">${icon('bed')}<span style="flex:1"><b>Nuit à l'hôtel près de ${esc(j.hotel.ville || j.hotel.nom)}</b><br><span class="small muted">Plus de ${R.hotelKm} km du domicile. Voir les hôtels</span></span>${icon('next', 'ic ic-s')}</a>` : ''}
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
          <a class="btn btn-p" style="flex:2" target="_blank" rel="noopener" href="${lienGPS(j.depart, [...j.stops, ...(j.arrivee ? [j.arrivee] : [])])}">${icon('go')}${multiEtapes() ? 'Lancer dans le GPS' : 'Aller au premier client'}</a>
          <button class="btn btn-s" style="flex:1" data-fait="${i}">${icon('check', 'ic ic-s')}Journée faite</button></div>
      </div>`).join('')}
    </div>`;
    root.querySelector('#src').textContent = res ? (res.every(r => r.reel) ? 'Distances et temps calculés par la route.' : 'Sans réseau : distances estimées.') : '';
    root.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { F.exclus.add(b.dataset.x); calc(); });
    root.querySelectorAll('[data-fait]').forEach(b => b.onclick = async () => {
      const j = jours[+b.dataset.fait];
      if (!await confirmer(`Jour ${+b.dataset.fait + 1} terminé ?`, `Une visite datée d'aujourd'hui (${dateFr(st.today())}) sera ajoutée pour ${j.stops.length} client${j.stops.length > 1 ? 's' : ''}.`, 'Enregistrer')) return;
      for (const c of j.stops) await st.addVisite(c.id, 'Tournée');
      toast('Visites enregistrées'); calc();
    });

    // Carte
    const couleurs = [getVar('--accent'), getVar('--warn'), '#2A6FDB', getVar('--late'), getVar('--ok')];
    const lignes = jours.map((j, i) => ({
      coords: res && res[i].reel ? res[i].ligne : [j.depart, ...j.stops, j.arrivee].filter(Boolean).map(p => [p.lat, p.lng]),
      color: couleurs[i % couleurs.length], dashed: !(res && res[i].reel),
    }));
    let k = 0;
    const stops = jours.flatMap(j => j.stops.map(c => ({ lat: c.lat, lng: c.lng, n: ++k, title: c.nom })));
    carte.route(lignes, stops);
    const bounds = stops.map(s => [s.lat, s.lng]);
    if (home) bounds.push([home.lat, home.lng]);
    if (!res) carte.fit(bounds, true);
  }

  return () => { cancelled = true; carte && carte.destroy(); };
}
