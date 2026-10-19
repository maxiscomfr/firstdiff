// Réglages : secteur, domicile, seuils, alertes, sauvegarde.
import * as st from '../store.js';
import { S, DEPS_SECTEUR } from '../store.js';
import { esc, icon, toast, confirmer, modal, dateFr } from '../ui.js';
import { suggestions, nomsDepartements, appGPS } from '../geo.js';
import { topbar, refresh } from '../app.js';

let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });

const NOTIFS = [
  ['retard', 'Clients en retard', 'Ceux qui n\'ont pas été vus depuis le seuil rouge'],
  ['grosClients', 'Gros clients à revoir', 'Vos meilleurs clients qui passent à l\'orange'],
  ['baisse', 'Baisse de chiffre d\'affaires', 'Plus de 15 % de moins que l\'année d\'avant'],
  ['tarifs', 'Nouveaux tarifs', 'Rappel la semaine où un tarif est ajouté'],
  ['sauvegarde', 'Rappel de sauvegarde', 'Tous les 30 jours'],
];

export async function render(root) {
  const R = S.reglages;
  const noms = Object.fromEntries((await nomsDepartements()).map(d => [d.code, d.nom]));
  draw();

  function stepper(k, pas, min, max, unite) {
    return `<div class="step"><button data-m="${k}" data-pas="${pas}" data-min="${min}" aria-label="Moins">${icon('minus')}</button>
      <span class="num">${R[k]}${unite}</span><button data-p="${k}" data-pas="${pas}" data-max="${max}" aria-label="Plus">${icon('plus')}</button></div>`;
  }

  function draw() {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    root.innerHTML = topbar() + `<div class="page" style="max-width:860px">
      <div class="page-head"><h1>Réglages</h1></div>

      <div class="card"><div class="card-h"><h2>Départements couverts</h2></div>
        <div class="deps">${R.deps.slice().sort().map(d => `<button class="chip on" data-dep="${d}" title="${esc(noms[d] || '')}">${d} ${esc(noms[d] || '')} ${icon('close', 'ic ic-s')}</button>`).join('')}
        <button class="chip" id="adddep">${icon('plus', 'ic ic-s')}Ajouter</button></div></div>

      <div class="card"><div class="card-h"><h2>Adresse de départ</h2></div>
        <label class="field">${icon('home')}<input id="adr" autocomplete="street-address" value="${esc(R.domicile ? R.domicile.adresse : '')}" placeholder="Votre adresse"></label>
        <div id="sugg" style="margin-top:6px"></div>
        <p class="small muted" style="margin-top:8px">Point de départ et de retour des tournées.</p></div>

      <div class="card"><div class="card-h"><h2>Visites</h2></div>
        <div class="set"><span class="dot d-warn" style="width:14px;height:14px"></span><div class="grow"><div class="t">Orange après</div><div class="s">Jours sans visite</div></div>${stepper('seuilOrange', 5, 5, 355, ' j')}</div>
        <div class="set"><span class="dot d-late" style="width:14px;height:14px"></span><div class="grow"><div class="t">Rouge après</div><div class="s">« Pas vu depuis », alerte</div></div>${stepper('seuilRouge', 5, 10, 360, ' j')}</div>
        <div class="set"><div class="grow"><div class="t">Clients par jour au maximum</div><div class="s">Pour découper les tournées</div></div>${stepper('maxParJour', 1, 1, 12, '')}</div>
        <div class="set"><div class="grow"><div class="t">Proposer l'hôtel au-delà de</div><div class="s">Distance entre le dernier client et la maison</div></div>${stepper('hotelKm', 10, 30, 600, ' km')}</div>
      </div>

      <div class="card"><div class="card-h"><h2>À ne pas oublier</h2></div>
        ${NOTIFS.map(([k, t, s]) => `<div class="set"><div class="grow"><div class="t">${t}</div><div class="s">${s}</div></div>
          <button class="tog${R.notifs[k] ? ' on' : ''}" data-n="${k}" role="switch" aria-checked="${!!R.notifs[k]}" aria-label="${esc(t)}"></button></div>`).join('')}</div>

      <div class="card"><div class="card-h"><h2>Guidage</h2></div>
        <p class="muted small" style="margin-bottom:10px">Application ouverte par les boutons « Y aller » et « Lancer dans le GPS ».</p>
        <div class="seg" style="display:flex">${[['plans', 'Plans'], ['google', 'Google Maps'], ['waze', 'Waze']].map(([k, l]) => `<button style="flex:1" data-gps="${k}" class="${appGPS() === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${appGPS() !== 'google' ? '<p class="small muted" style="margin-top:10px">Plans et Waze ne prennent qu\'une destination à la fois : la tournée ouvre le premier client, puis chaque client a son bouton.</p>' : ''}</div>

      <div class="card"><div class="card-h"><h2>Apparence</h2></div>
        <div class="seg" style="display:flex">${[['auto', 'Automatique'], ['clair', 'Clair'], ['sombre', 'Sombre']].map(([k, l]) => `<button style="flex:1" data-th="${k}" class="${R.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>

      ${!standalone ? `<div class="card"><div class="card-h"><h2>Installer sur le téléphone</h2></div>
        ${installEvt ? `<button class="btn btn-p btn-w" id="install">${icon('download')}Ajouter FirstDiff à l'écran d'accueil</button>`
          : `<p class="muted">${ios ? 'Dans Safari, touchez le bouton Partager puis « Sur l\'écran d\'accueil ».' : 'Dans le menu du navigateur, choisissez « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ».'} FirstDiff s'ouvrira alors comme une application, même sans réseau.</p>`}</div>` : ''}

      <div class="card"><div class="card-h"><h2>Mes données</h2></div>
        <p class="muted" style="margin-bottom:12px">Les données restent sur cet appareil. Faites une sauvegarde de temps en temps et gardez le fichier en lieu sûr.${R.derniereSauvegarde ? ` Dernière sauvegarde le ${esc(dateFr(R.derniereSauvegarde))}.` : ''}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-p" style="flex:1" id="save">${icon('download')}Sauvegarder</button>
          <label class="btn btn-s" style="flex:1">${icon('import')}Restaurer<input type="file" id="restore" accept=".json,application/json" hidden></label></div>
        <div class="set" style="margin-top:8px"><div class="grow"><div class="t">Clients d'exemple</div><div class="s">${R.demo ? 'Affichés en ce moment' : 'Pour découvrir l\'application'}</div></div>
          <button class="btn btn-s btn-sm" id="demo">${R.demo ? 'Retirer' : 'Afficher'}</button></div>
        <div class="set"><div class="grow"><div class="t">Tout effacer</div><div class="s">Clients, visites, chiffre d'affaires et tarifs</div></div>
          <button class="btn btn-d btn-sm" id="reset">Effacer</button></div>
      </div>
      <p class="small faint" style="text-align:center">FirstDiff · Jérôme Rivault, agent commercial</p>
    </div>`;
    bind();
  }

  function bind() {
    const save = async patch => { await st.saveReglages(patch); draw(); };
    root.querySelectorAll('[data-dep]').forEach(b => b.onclick = () => save({ deps: R.deps.filter(d => d !== b.dataset.dep) }));
    root.querySelector('#adddep').onclick = () => {
      const libres = Object.keys(noms).filter(d => !R.deps.includes(d)).sort();
      modal(`<h2>Ajouter un département</h2><div class="deps" style="max-height:55vh;overflow:auto">
        ${libres.map(d => `<button class="chip" data-a="${d}">${d} ${esc(noms[d])}</button>`).join('')}</div>
        ${DEPS_SECTEUR.some(d => !R.deps.includes(d)) ? `<button class="btn btn-s" id="secteur">Remettre le secteur Armony</button>` : ''}
        <button class="btn btn-s" data-close>Fermer</button>`, (m, close) => {
        m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { close(); save({ deps: [...R.deps, b.dataset.a] }); });
        const s = m.querySelector('#secteur'); if (s) s.onclick = () => { close(); save({ deps: [...new Set([...R.deps, ...DEPS_SECTEUR])] }); };
      });
    };
    root.querySelectorAll('[data-m],[data-p]').forEach(b => b.onclick = () => {
      const k = b.dataset.m || b.dataset.p, pas = +b.dataset.pas;
      let v = R[k] + (b.dataset.m ? -pas : pas);
      v = Math.max(+(b.dataset.min ?? -1e9), Math.min(+(b.dataset.max ?? 1e9), v));
      const patch = { [k]: v };
      if (k === 'seuilOrange' && v >= R.seuilRouge) patch.seuilRouge = v + 5;
      if (k === 'seuilRouge' && v <= R.seuilOrange) patch.seuilOrange = Math.max(5, v - 5);
      save(patch);
    });
    root.querySelectorAll('[data-n]').forEach(b => b.onclick = () => save({ notifs: { ...R.notifs, [b.dataset.n]: !R.notifs[b.dataset.n] } }));
    root.querySelectorAll('[data-gps]').forEach(b => b.onclick = () => save({ gps: b.dataset.gps }));
    root.querySelectorAll('[data-th]').forEach(b => b.onclick = () => save({ theme: b.dataset.th }));

    const adr = root.querySelector('#adr'), sugg = root.querySelector('#sugg');
    let t;
    adr.oninput = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        let l = []; try { l = await suggestions(adr.value); } catch { sugg.innerHTML = '<p class="small muted">Pas de réseau : réessayez plus tard.</p>'; return; }
        sugg.innerHTML = l.map((s, i) => `<button class="row" style="width:100%;background:none;border:0;border-bottom:1px solid var(--line);text-align:left;min-height:52px" data-s="${i}">${icon('pin')}<span class="grow">${esc(s.label)}</span></button>`).join('');
        sugg.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { const s = l[+b.dataset.s]; await st.saveReglages({ domicile: { adresse: s.label, lat: s.lat, lng: s.lng } }); toast('Adresse enregistrée'); draw(); });
      }, 300);
    };

    const ins = root.querySelector('#install');
    if (ins) ins.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; draw(); };

    root.querySelector('#save').onclick = async () => {
      const blob = new Blob([await st.exportJSON()], { type: 'application/json' });
      const nom = `FirstDiff-sauvegarde-${st.today()}.json`;
      const file = new File([blob], nom, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer:coarse)').matches) {
        try { await navigator.share({ files: [file], title: 'Sauvegarde FirstDiff' }); } catch { return; }
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      }
      await st.saveReglages({ derniereSauvegarde: st.today() }); toast('Sauvegarde faite'); draw();
    };
    root.querySelector('#restore').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      if (!await confirmer('Restaurer cette sauvegarde ?', 'Les données actuelles de cet appareil seront remplacées par celles du fichier.', 'Restaurer', true)) return;
      try { await st.importJSON(await f.text()); toast('Sauvegarde restaurée'); refresh(); }
      catch (err) { toast(err.message || 'Fichier illisible'); }
    };
    root.querySelector('#demo').onclick = async () => {
      if (R.demo) await st.clearDemo(); else await st.loadDemo();
      toast(R.demo ? 'Clients d\'exemple affichés' : 'Clients d\'exemple retirés'); draw();
    };
    root.querySelector('#reset').onclick = async () => {
      if (!await confirmer('Tout effacer ?', 'Toutes les données de cet appareil seront supprimées. Pensez à sauvegarder avant.', 'Tout effacer', true)) return;
      await st.resetAll(); toast('Données effacées'); location.hash = '#/carte';
    };
  }
}
