// Liste des clients : recherche, statut, dernière visite, CA de la période.
import * as st from '../store.js';
import { esc, eur, icon, pill, depuis, dateFr, normalise, evo } from '../ui.js';
import { topbar, go } from '../app.js';

const F = { q: '', statut: 'tous', per: '12mois', tri: 'retard' };
const PER = [['mois', 'Mois'], ['trimestre', 'Trimestre'], ['annee', 'Année'], ['12mois', '12 mois']];

export async function render(root) {
  root.innerHTML = topbar() + `
  <div class="page">
    <div class="page-head"><h1>Clients</h1>
      <a class="btn btn-p btn-sm" href="#/client/nouveau">${icon('plus', 'ic ic-s')}Ajouter</a></div>
    <label class="field">${icon('search')}<input type="search" id="q" placeholder="Nom, ville, département" value="${esc(F.q)}" aria-label="Rechercher un client"></label>
    <div class="chips" id="chips"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <div class="seg" id="per">${PER.map(([k, l]) => `<button data-p="${k}">${l}</button>`).join('')}</div>
      <label class="field" style="min-height:44px;flex:0 1 220px"><select id="tri" aria-label="Trier">
        <option value="retard">Les moins vus d'abord</option><option value="ca">Plus gros CA d'abord</option><option value="nom">Par nom</option></select></label>
    </div>
    <div id="list"></div>
  </div>`;
  const q = root.querySelector('#q');
  q.oninput = () => { F.q = q.value; list(); };
  root.querySelector('#tri').value = F.tri;
  root.querySelector('#tri').onchange = e => { F.tri = e.target.value; list(); };
  root.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { F.per = b.dataset.p; list(); });
  list();

  function list() {
    const all = st.clientsSecteur();
    const n = s => all.filter(c => st.statut(c.id) === s).length;
    const chip = (k, txt, dot) => `<button class="chip${F.statut === k ? ' on' : ''}" data-s="${k}">${dot ? `<span class="dot d-${k}"></span>` : ''}${txt}</button>`;
    root.querySelector('#chips').innerHTML = chip('tous', `Tous · ${all.length}`) + chip('late', `En retard · ${n('late')}`, 1) + chip('warn', `Bientôt · ${n('warn')}`, 1) + chip('ok', `À jour · ${n('ok')}`, 1);
    root.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { F.statut = b.dataset.s; list(); });
    root.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === F.per));

    const p = st.periode(F.per), nq = normalise(F.q);
    let rows = all.filter(c => (F.statut === 'tous' || st.statut(c.id) === F.statut)
      && (!nq || normalise([c.nom, c.ville, c.dep, c.contact].join(' ')).includes(nq)))
      .map(c => ({ c, j: st.joursSansVisite(c.id), ca: st.ca(c.id, p.from, p.to), prev: st.ca(c.id, p.pFrom, p.pTo), s: st.statut(c.id) }));
    if (F.tri === 'retard') rows.sort((a, b) => (b.j ?? 1e9) - (a.j ?? 1e9));
    else if (F.tri === 'ca') rows.sort((a, b) => b.ca - a.ca);
    else rows.sort((a, b) => a.c.nom.localeCompare(b.c.nom, 'fr'));

    const el = root.querySelector('#list');
    if (!all.length) { el.innerHTML = `<div class="card empty"><h3>Aucun client pour le moment</h3><p style="margin:8px 0 16px">Importez votre fichier clients ou ajoutez-les un par un.</p><a class="btn btn-p" href="#/import">Importer un fichier</a></div>`; return; }
    if (!rows.length) { el.innerHTML = `<div class="card empty">Aucun client ne correspond.</div>`; return; }
    const libPer = PER.find(x => x[0] === F.per)[1].toLowerCase();
    el.innerHTML = `
      <div class="card only-m" style="padding:4px 14px">${rows.map(r => `
        <a class="row" href="#/client/${r.c.id}"><span class="dot d-${r.s}" style="width:12px;height:12px"></span>
          <span class="grow"><span class="t" style="display:block">${esc(r.c.nom)}</span><span class="s">${esc(r.c.ville || '')} · ${depuis(r.c.id)}</span></span>
          <b class="num" style="white-space:nowrap">${eur(r.ca)}</b></a>`).join('')}</div>
      <div class="card only-d" style="padding:0;overflow:hidden"><table class="tbl">
        <thead><tr><th>Client</th><th>Ville</th><th>Statut</th><th>Dernière visite</th><th class="r">CA ${esc(libPer)}</th><th class="r">Sur un an</th></tr></thead>
        <tbody>${rows.map(r => {
          const v = st.derniereVisite(r.c.id);
          return `<tr class="link" data-id="${r.c.id}"><td><b>${esc(r.c.nom)}</b></td><td>${esc(r.c.ville || '')} <span class="faint">${esc(r.c.dep || '')}</span></td>
          <td>${pill(r.s)}</td><td class="num">${v ? dateFr(v.date) + ` <span class="faint">(${r.j} j)</span>` : '<span class="faint">Jamais</span>'}</td>
          <td class="r num"><b>${eur(r.ca)}</b></td><td class="r">${evo(st.evolution(r.ca, r.prev))}</td></tr>`;
        }).join('')}</tbody></table></div>
      <p class="small faint">${rows.length} client${rows.length > 1 ? 's' : ''}</p>`;
    el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => go('#/client/' + tr.dataset.id));
  }
}
