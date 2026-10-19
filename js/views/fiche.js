// Fiche client : coordonnées, statut, chiffre d'affaires, visites, notes.
import * as st from '../store.js';
import { S } from '../store.js';
import { esc, eur, icon, pill, depuis, dateFr, evo, modal, toast, confirmer, moisCourt } from '../ui.js';
import { lienGPS, geocoder } from '../geo.js';
import { topbar, go } from '../app.js';

export async function render(root, [id]) {
  if (id === 'nouveau') { root.innerHTML = topbar('#/clients') + '<div class="page"></div>'; editer(null); return; }
  const c = st.client(id);
  if (!c) { root.innerHTML = topbar('#/clients') + `<div class="page"><h1>Client introuvable</h1><a class="btn btn-s" href="#/clients">Retour à la liste</a></div>`; return; }
  draw();

  function draw() {
    const s = st.statut(c.id), p12 = st.periode('12mois');
    const a = st.ca(c.id, p12.from, p12.to), b = st.ca(c.id, p12.pFrom, p12.pTo);
    const vis = st.visitesDe(c.id);
    const an = String(new Date().getFullYear());
    const mois = st.caMensuel(c.id, 24), max = Math.max(1, ...mois.map(m => m.montant));
    const adr = [c.adresse, [c.cp, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    root.innerHTML = topbar('#/clients') + `
    <div class="page">
      <a class="btn btn-g only-d" href="#/clients" style="align-self:flex-start;margin-left:-12px">${icon('back')}Tous les clients</a>
      <div class="page-head">
        <div style="flex:1;min-width:0"><h1>${esc(c.nom)}</h1>
          <p class="muted" style="margin-top:4px">${esc(c.ville || '')}${c.dep ? ` (${esc(c.dep)})` : ''}${(c.marques || []).length ? ' · ' + esc(c.marques.join(', ')) : ''}</p>
          <div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap">${pill(s)}<span class="muted">${depuis(c.id)}</span></div></div>
        <button class="btn btn-s btn-sm only-d" id="edit">${icon('edit', 'ic ic-s')}Modifier</button>
      </div>
      <button class="btn btn-p btn-xl btn-w" id="visite">${icon('check')}Visite faite</button>
      <div class="kpis">
        <div class="kpi"><span class="lbl">CA 12 mois</span><b class="num">${eur(a)}</b><span class="small">${evo(st.evolution(a, b))}</span></div>
        <div class="kpi"><span class="lbl">Dernière visite</span><b class="num">${vis[0] ? dateFr(vis[0].date) : '—'}</b></div>
        <div class="kpi"><span class="lbl">Visites ${an}</span><b class="num">${vis.filter(v => v.date.startsWith(an)).length}</b></div>
      </div>
      <div class="grid2">
        <div class="col-a">
          <div class="card"><div class="card-h"><h3>Chiffre d'affaires sur 24 mois</h3></div>
            <div class="chart" role="img" aria-label="Chiffre d'affaires mensuel">${mois.map((m, i) =>
              `<i class="${i < 12 ? 'b-prev' : 'b-now'}" style="height:${m.montant / max * 100}%;background:${i < 12 ? 'var(--bar-prev)' : 'var(--accent)'}" title="${esc(new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(m.mois))} : ${eur(m.montant)}"></i>`).join('')}</div>
            <div class="chart-x">${mois.filter((m, i) => i % 3 === 0).map(m => `<span>${moisCourt(m.mois).toUpperCase()}</span>`).join('')}</div>
            <div style="display:flex;gap:18px;margin-top:12px;flex-wrap:wrap" class="small">
              <span><span class="dot" style="background:var(--accent)"></span> 12 derniers mois <b class="num">${eur(a)}</b></span>
              <span><span class="dot" style="background:var(--bar-prev)"></span> 12 mois d'avant <b class="num">${eur(b)}</b></span></div>
          </div>
          <div class="card"><div class="card-h"><h3>Visites</h3></div>
            ${vis.length ? vis.map(v => `<div class="tl"><i></i><div style="display:flex;gap:8px;align-items:flex-start"><div style="flex:1"><b>${dateFr(v.date, true)}</b>
              ${v.note ? `<p class="muted">${esc(v.note)}</p>` : ''}</div>
              <button class="iconbtn" data-delv="${v.id}" style="border:0;width:40px;height:40px;color:var(--ink-3)" aria-label="Supprimer cette visite">${icon('trash', 'ic ic-s')}</button></div></div>`).join('')
              : '<p class="muted">Aucune visite enregistrée.</p>'}
          </div>
        </div>
        <div class="col-b">
          <div class="card contact">
            ${c.contact ? `<div style="padding-bottom:8px"><span class="lbl">Contact</span><p><b>${esc(c.contact)}</b></p></div>` : ''}
            ${c.tel ? `<a href="tel:${esc(c.tel.replace(/\s/g, ''))}">${icon('phone')}<span class="num">${esc(c.tel)}</span></a>` : ''}
            ${c.email ? `<a href="mailto:${esc(c.email)}">${icon('mail')}<span style="overflow-wrap:anywhere">${esc(c.email)}</span></a>` : ''}
            ${adr ? `<a ${c.lat != null ? `href="${lienGPS(null, [c])}" target="_blank" rel="noopener"` : ''}>${icon('pin')}<span>${esc(adr)}</span></a>` : ''}
            ${c.lat == null && adr ? `<p class="warnbox" style="margin-top:10px">Adresse introuvable sur la carte. Corrigez-la avec « Modifier ».</p>` : ''}
            ${c.lat != null ? `<a class="btn btn-s btn-w" style="margin-top:12px;justify-content:center;border:1.5px solid var(--line-2)" target="_blank" rel="noopener" href="${lienGPS(null, [c])}">${icon('go')}Y aller</a>` : ''}
          </div>
          <div class="card"><div class="card-h"><h3>Notes</h3><span class="small faint" id="saved"></span></div>
            <textarea class="area" id="notes" placeholder="Ce qu'il faut retenir sur ce client">${esc(c.notes || '')}</textarea></div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-s" style="flex:1" id="edit2">${icon('edit', 'ic ic-s')}Modifier</button>
            <button class="btn btn-d" style="flex:1" id="del">${icon('trash', 'ic ic-s')}Supprimer</button></div>
        </div>
      </div>
    </div>`;

    root.querySelector('#visite').onclick = visiteFaite;
    root.querySelector('#edit').onclick = () => editer(c);
    root.querySelector('#edit2').onclick = () => editer(c);
    root.querySelector('#del').onclick = async () => {
      if (await confirmer('Supprimer ce client ?', `${c.nom}, ses visites et son chiffre d'affaires seront effacés de l'application.`, 'Supprimer', true)) {
        await st.deleteClient(c.id); toast('Client supprimé'); go('#/clients');
      }
    };
    root.querySelectorAll('[data-delv]').forEach(b => b.onclick = async () => {
      if (await confirmer('Supprimer cette visite ?', 'Elle disparaîtra de l\'historique.', 'Supprimer', true)) { await st.deleteVisite(b.dataset.delv); draw(); }
    });
    const n = root.querySelector('#notes');
    let t;
    n.oninput = () => { clearTimeout(t); t = setTimeout(async () => { c.notes = n.value; await st.saveClient(c); root.querySelector('#saved').textContent = 'Enregistré'; }, 600); };
  }

  function visiteFaite() {
    modal(`<h2>Visite chez ${esc(c.nom)}</h2>
      <label class="f">Date<span class="field"><input type="date" id="vd" value="${st.today()}" max="${st.today()}"></span></label>
      <label class="f">Note (facultatif)<textarea class="area" id="vn" placeholder="Ce qui a été dit, ce qu'il faut préparer"></textarea></label>
      <button class="btn btn-p btn-xl" id="ok">${icon('check')}Enregistrer la visite</button>
      <button class="btn btn-s" data-close>Annuler</button>`, (m, close) => {
      m.querySelector('#ok').onclick = async () => {
        await st.addVisite(c.id, m.querySelector('#vn').value, m.querySelector('#vd').value || st.today());
        close(); toast('Visite enregistrée'); draw();
      };
    });
  }
}

// Formulaire de création ou de modification d'un client.
export function editer(c) {
  const neuf = !c; c = c || { nom: '', marques: [] };
  const f = (k, label, type = 'text', extra = '') => `<label class="f">${label}<span class="field"><input type="${type}" name="${k}" value="${esc(c[k] || '')}" ${extra}></span></label>`;
  modal(`<h2>${neuf ? 'Nouveau client' : 'Modifier le client'}</h2>
    <form id="fc" style="display:flex;flex-direction:column;gap:12px">
      ${f('nom', 'Nom du magasin', 'text', 'required')}
      ${f('contact', 'Contact')}
      ${f('tel', 'Téléphone', 'tel')}
      ${f('email', 'E-mail', 'email')}
      ${f('adresse', 'Adresse')}
      <div style="display:grid;grid-template-columns:120px 1fr;gap:10px">${f('cp', 'Code postal', 'text', 'inputmode="numeric"')}${f('ville', 'Ville')}</div>
      ${f('marques', 'Marques (séparées par des virgules)')}
      <button class="btn btn-p btn-xl" type="submit">Enregistrer</button>
      <button class="btn btn-s" type="button" data-close>Annuler</button>
    </form>`, (m, close) => {
    m.querySelector('[name=marques]').value = (c.marques || []).join(', ');
    m.querySelector('#fc').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const adrAvant = [c.adresse, c.cp, c.ville].join('|');
      Object.assign(c, { nom: d.nom.trim(), contact: d.contact.trim(), tel: d.tel.trim(), email: d.email.trim(), adresse: d.adresse.trim(), cp: d.cp.trim(), ville: d.ville.trim(),
        marques: d.marques.split(',').map(s => s.trim()).filter(Boolean) });
      if (c.cp) c.dep = c.cp.slice(0, 2);
      if (neuf || adrAvant !== [c.adresse, c.cp, c.ville].join('|')) {
        delete c.geoEchec; c.lat = c.lng = null;
        try { const g = await geocoder([c.adresse, c.cp, c.ville].join(' ')); if (g) { c.lat = g.lat; c.lng = g.lng; if (!c.cp) c.cp = g.cp; if (!c.dep) c.dep = g.dep; } else c.geoEchec = true; }
        catch { /* hors ligne : on réessaiera plus tard */ }
      }
      await st.saveClient(c); close(); toast(neuf ? 'Client ajouté' : 'Client modifié');
      go('#/client/' + c.id);
    };
    m.parentElement.addEventListener('click', e => { if (neuf && (e.target === m.parentElement || e.target.closest('[data-close]'))) history.back(); });
  });
}
