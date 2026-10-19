// Import d'un fichier Excel ou PDF : clients, chiffre d'affaires ou tarifs.
import * as st from '../store.js';
import { S } from '../store.js';
import { esc, eur, icon, toast, confirmer, dateFr } from '../ui.js';
import { lireFichier, preparer, typeProbable, analyserClients, analyserCA, CHAMPS, LIBELLES } from '../importers.js';
import { geocoderManquants } from '../geo.js';
import { topbar } from '../app.js';

const TYPES = [['clients', 'Clients'], ['ca', "Chiffre d'affaires"], ['tarifs', 'Tarifs']];

export async function render(root) {
  let etat = null;   // {file, lu, type, prep, res}
  root.innerHTML = topbar() + `<div class="page"><div class="page-head"><h1>Import</h1></div>
    <div id="zone"></div><div id="tarifs"></div></div>`;
  depot(); tarifs();

  function depot() {
    const z = root.querySelector('#zone');
    if (etat) return apercu();
    z.innerHTML = `<label class="drop" id="drop">
        <span class="big">${icon('import')}</span>
        <h2>Déposer un fichier</h2>
        <p class="muted">Excel, CSV ou PDF. Clients, chiffre d'affaires ou tarifs : l'application reconnaît le type toute seule.</p>
        <span class="btn btn-p">${icon('file')}Choisir un fichier</span>
        <input type="file" id="f" accept=".xlsx,.xls,.xlsm,.csv,.ods,.pdf,application/pdf" hidden>
      </label>`;
    const drop = z.querySelector('#drop');
    z.querySelector('#f').onchange = e => e.target.files[0] && lire(e.target.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) lire(f); };
  }

  async function lire(file) {
    const z = root.querySelector('#zone');
    z.innerHTML = `<div class="card empty"><h3>Lecture de « ${esc(file.name)} »…</h3></div>`;
    try {
      const lu = await lireFichier(file);
      etat = { file, lu, type: typeProbable(lu) };
      analyser();
    } catch (e) {
      console.error(e);
      etat = null;
      z.innerHTML = `<div class="card"><h3>Ce fichier n'a pas pu être lu</h3><p class="muted" style="margin:8px 0 14px">Vérifiez que c'est bien un fichier Excel, CSV ou PDF qui n'est pas protégé par un mot de passe.</p><button class="btn btn-s" id="re">Choisir un autre fichier</button></div>`;
      z.querySelector('#re').onclick = depot;
    }
  }

  function analyser(garderMap) {
    if (etat.type === 'tarifs') { etat.prep = etat.res = null; return apercu(); }
    const ancienne = garderMap && etat.prep && etat.prep.map;
    etat.prep = preparer(etat.lu, etat.type);
    if (ancienne) etat.prep.map = ancienne;
    etat.res = etat.type === 'clients' ? analyserClients(etat.prep) : analyserCA(etat.prep);
    apercu();
  }

  function apercu() {
    const z = root.querySelector('#zone'), { file, type, prep, res } = etat;
    const head = `<div class="card">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">${icon('file')}<b style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(file.name)}</b>
        <button class="btn btn-g btn-sm" id="annuler">Changer</button></div>
      <span class="lbl">Ce fichier contient</span>
      <div class="seg" style="margin-top:8px;display:flex">${TYPES.map(([k, l]) => `<button data-t="${k}" class="${type === k ? 'on' : ''}" style="flex:1">${l}</button>`).join('')}</div></div>`;
    if (type === 'tarifs') {
      const marques = [...new Set(['Armony', 'Beckermann', ...S.tarifs.map(t => t.marque), ...S.clients.flatMap(c => c.marques || [])])];
      z.innerHTML = head + `<div class="card" style="margin-top:16px;display:flex;flex-direction:column;gap:12px">
        <h3>Enregistrer ce tarif</h3>
        <label class="f">Marque<span class="field"><input id="tm" list="ml" value="${esc(devinerMarque(file.name, marques))}" placeholder="Armony, Beckermann…"></span></label>
        <datalist id="ml">${marques.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
        <label class="f">Nom<span class="field"><input id="tn" value="${esc(file.name.replace(/\.[^.]+$/, ''))}"></span></label>
        <button class="btn btn-p btn-xl" id="ok">${icon('check')}Enregistrer le tarif</button></div>`;
      z.querySelector('#ok').onclick = async () => {
        const marque = z.querySelector('#tm').value.trim(); if (!marque) { z.querySelector('#tm').focus(); return; }
        const ancien = S.tarifs.filter(t => t.marque.toLowerCase() === marque.toLowerCase());
        await st.saveTarif({ marque, nom: z.querySelector('#tn').value.trim() || file.name, fichier: file.name, type: file.type, taille: file.size, ajoute: st.today(), blob: file });
        for (const t of ancien) { t.ancien = true; await st.saveTarif(t); }
        toast(`Tarif ${marque} enregistré`); etat = null; depot(); tarifs();
      };
    } else {
      const libelles = type === 'clients'
        ? { n: 'nouveaux clients', m: 'clients mis à jour', i: 'lignes ignorées' }
        : { n: 'nouveaux mois de CA', m: 'montants mis à jour', i: 'lignes ignorées' };
      const total = arr => type === 'ca' ? ` <span class="small muted num">${eur(arr.reduce((s, x) => s + (x.montant ?? x.vente.montant), 0))}</span>` : '';
      const nomClient = id => (st.client(id) || {}).nom || '';
      const champsDispo = CHAMPS[type];
      z.innerHTML = head + `
      <div class="card" style="margin-top:16px">
        <div class="card-h"><h3>Ce qui va changer</h3></div>
        <div class="diff">
          <div style="background:var(--ok-soft);color:var(--ok-text)"><b class="num">${res.nouveaux.length}</b>${libelles.n}</div>
          <div style="background:var(--warn-soft);color:var(--warn-text)"><b class="num">${res.majs.length}</b>${libelles.m}</div>
          <div><b class="num">${res.ignores.length}</b>${libelles.i}</div></div>
        ${res.inchanges ? `<p class="small muted" style="margin-top:10px">${res.inchanges} ligne${res.inchanges > 1 ? 's' : ''} déjà à jour, rien à changer.</p>` : ''}
        ${type === 'ca' && res.inconnus.length ? `<p class="warnbox" style="margin-top:12px">${res.inconnus.length} client${res.inconnus.length > 1 ? 's' : ''} du fichier ${res.inconnus.length > 1 ? 'ne sont' : "n'est"} pas dans vos clients : ${esc(res.inconnus.slice(0, 5).map(x => x[0]).join(', '))}${res.inconnus.length > 5 ? '…' : ''}. Importez d'abord le fichier clients.</p>` : ''}
        ${!res.nouveaux.length && !res.majs.length && !res.inchanges ? `<p class="warnbox" style="margin-top:12px">Rien n'a été reconnu. Vérifiez le type choisi au-dessus, ou les colonnes ci-dessous.</p>` : ''}
        <details style="margin-top:14px"><summary style="cursor:pointer;font-weight:700;min-height:44px;display:flex;align-items:center">Voir le détail</summary>
          ${bloc('Nouveaux' + total(res.nouveaux), res.nouveaux.map(x => type === 'clients' ? `${esc(x.nom)} <span class="faint">${esc(x.ville)}</span>` : `${esc(nomClient(x.clientId))} · ${esc(dateFr(x.date).replace(/^1er /, ''))} · <span class="num">${eur(x.montant)}</span>`))}
          ${bloc('Mis à jour', res.majs.map(x => type === 'clients' ? `${esc(x.client.nom)} <span class="faint">(${esc(x.champs.join(', '))})</span>` : `${esc(nomClient(x.vente.clientId))} · ${esc(dateFr(x.vente.date))} · <span class="num">${eur(x.avant)} → ${eur(x.vente.montant)}</span>`))}
          ${bloc('Ignorées', res.ignores.map(x => `${esc(x.raison)} <span class="faint">${esc(x.ligne.filter(v => String(v).trim()).slice(0, 3).join(' · '))}</span>`))}
        </details>
        <details style="margin-top:6px"><summary style="cursor:pointer;font-weight:700;min-height:44px;display:flex;align-items:center">Colonnes reconnues</summary>
          <div class="map-cols" style="margin-top:8px">${Object.keys(champsDispo).map(k => `<label class="f">${LIBELLES[k]}<span class="field" style="min-height:44px"><select data-c="${k}">
            <option value="">Aucune</option>${prep.entetes.map((h, i) => `<option value="${i}" ${prep.map[k] === i ? 'selected' : ''}>${esc(h || 'Colonne ' + (i + 1))}</option>`).join('')}</select></span></label>`).join('')}</div>
          ${prep.mois.length ? `<p class="small muted" style="margin-top:10px">${prep.mois.length} colonnes de mois reconnues (${esc(dateFr(prep.mois[0].date))} à ${esc(dateFr(prep.mois[prep.mois.length - 1].date))}).</p>` : ''}
        </details>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <button class="btn btn-p btn-xl" style="flex:2" id="ok" ${res.nouveaux.length + res.majs.length ? '' : 'disabled'}>${icon('check')}Valider l'import</button>
          <button class="btn btn-s btn-xl" style="flex:1" id="annuler2">Annuler</button></div>
      </div>`;
      z.querySelectorAll('[data-c]').forEach(s => s.onchange = () => {
        if (s.value === '') delete etat.prep.map[s.dataset.c]; else etat.prep.map[s.dataset.c] = +s.value;
        etat.res = type === 'clients' ? analyserClients(etat.prep) : analyserCA(etat.prep); apercu();
        root.querySelectorAll('details')[1].open = true;
      });
      z.querySelector('#ok').onclick = valider;
      z.querySelector('#annuler2').onclick = () => { etat = null; depot(); };
    }
    z.querySelector('#annuler').onclick = () => { etat = null; depot(); };
    z.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { etat.type = b.dataset.t; analyser(); });
  }

  function bloc(titre, items) {
    if (!items.length) return '';
    return `<div style="margin-top:10px"><b>${titre}</b><ul style="margin:6px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:4px">
      ${items.slice(0, 50).map(i => `<li class="small">${i}</li>`).join('')}${items.length > 50 ? `<li class="small faint">et ${items.length - 50} de plus</li>` : ''}</ul></div>`;
  }

  async function valider() {
    const { type, res } = etat;
    if (type === 'clients') {
      for (const c of res.nouveaux) await st.saveClient(c);
      for (const m of res.majs) await st.saveClient(m.client);
      if (S.reglages.demo && res.nouveaux.length && await confirmer('Retirer les clients d\'exemple ?', 'Vos vrais clients sont importés. Les clients d\'exemple peuvent être effacés.', 'Retirer les exemples')) await st.clearDemo();
      toast(`${res.nouveaux.length} ajoutés, ${res.majs.length} mis à jour`);
      geocoderManquants(st.saveClient);
    } else {
      await st.upsertVentes([...res.nouveaux, ...res.majs.map(m => m.vente)]);
      toast("Chiffre d'affaires importé");
    }
    etat = null; depot();
  }

  function tarifs() {
    const el = root.querySelector('#tarifs');
    const parMarque = new Map();
    for (const t of S.tarifs.slice().sort((a, b) => (b.ajoute || '').localeCompare(a.ajoute || ''))) {
      if (!parMarque.has(t.marque)) parMarque.set(t.marque, []); parMarque.get(t.marque).push(t);
    }
    el.innerHTML = `<div class="card" style="margin-top:16px"><div class="card-h"><h2>Tarifs par marque</h2></div>
      ${parMarque.size ? [...parMarque.entries()].map(([m, list]) => `<div style="margin-bottom:14px"><span class="lbl">${esc(m)}</span>
        ${list.map(t => `<div class="row" style="min-height:56px"><span style="color:var(--accent-text)">${icon('file')}</span>
          <span class="grow"><span class="t" style="display:block">${esc(t.nom)}</span><span class="s">Ajouté le ${esc(dateFr(t.ajoute))}${t.ancien ? ' · ancien tarif' : ''}</span></span>
          <button class="btn btn-s btn-sm" data-open="${t.id}">Ouvrir</button>
          <button class="iconbtn" style="border:0;width:42px;height:42px" data-del="${t.id}" aria-label="Supprimer">${icon('trash', 'ic ic-s')}</button></div>`).join('')}</div>`).join('')
        : '<p class="muted">Aucun tarif enregistré. Déposez le PDF ou le fichier Excel d\'une marque au-dessus.</p>'}</div>`;
    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
      const t = S.tarifs.find(x => x.id === b.dataset.open); if (!t || !t.blob) return;
      const url = URL.createObjectURL(t.blob);
      const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
      if (!/pdf/.test(t.type || '')) a.download = t.fichier || t.nom;
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (await confirmer('Supprimer ce tarif ?', 'Le fichier sera retiré de l\'application.', 'Supprimer', true)) { await st.deleteTarif(b.dataset.del); tarifs(); }
    });
  }
}

function devinerMarque(nom, marques) {
  const n = nom.toLowerCase();
  return marques.find(m => n.includes(m.toLowerCase())) || '';
}
