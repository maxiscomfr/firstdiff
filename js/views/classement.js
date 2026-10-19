// Classement des clients par chiffre d'affaires sur une période.
import * as st from '../store.js';
import { S } from '../store.js';
import { esc, eur, icon, evo, pct, dateFr, modal } from '../ui.js';
import { topbar, go } from '../app.js';

const F = { per: 'annee', dep: 'tous', libre: null, tout: false };
const PER = [['semaine', 'Semaine'], ['mois', 'Mois'], ['trimestre', 'Trimestre'], ['annee', 'Année'], ['libre', 'Dates libres']];

export async function render(root) {
  root.innerHTML = topbar() + `<div class="page"><div class="page-head"><h1>Classement</h1></div>
    <div class="seg" id="per">${PER.map(([k, l]) => `<button data-p="${k}">${l}</button>`).join('')}</div>
    <div class="chips" id="deps"></div><div id="out" style="display:flex;flex-direction:column;gap:16px"></div></div>`;
  root.querySelectorAll('[data-p]').forEach(b => b.onclick = () => b.dataset.p === 'libre' ? choisirDates() : (F.per = b.dataset.p, draw()));
  draw();

  function choisirDates() {
    const t = st.today(), d = F.libre || { from: t.slice(0, 4) + '-01-01', to: t };
    modal(`<h2>Choisir les dates</h2>
      <label class="f">Du<span class="field"><input type="date" id="df" value="${d.from}"></span></label>
      <label class="f">Au<span class="field"><input type="date" id="dt" value="${d.to}"></span></label>
      <button class="btn btn-p" id="ok">Afficher</button><button class="btn btn-s" data-close>Annuler</button>`, (m, close) => {
      m.querySelector('#ok').onclick = () => {
        let from = m.querySelector('#df').value, to = m.querySelector('#dt').value;
        if (!from || !to) return; if (from > to) [from, to] = [to, from];
        F.libre = { from, to }; F.per = 'libre'; close(); draw();
      };
    });
  }

  function draw() {
    root.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === F.per));
    const deps = S.reglages.deps.slice().sort();
    root.querySelector('#deps').innerHTML = [['tous', 'Tous les départements'], ...deps.map(d => [d, d])]
      .map(([k, l]) => `<button class="chip${F.dep === k ? ' on' : ''}" data-d="${k}">${l}</button>`).join('');
    root.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { F.dep = b.dataset.d; draw(); });

    const p = st.periode(F.per, F.libre);
    const cl = st.clientsSecteur().filter(c => F.dep === 'tous' || c.dep === F.dep);
    const rows = cl.map(c => ({ c, ca: st.ca(c.id, p.from, p.to), prev: st.ca(c.id, p.pFrom, p.pTo) })).filter(r => r.ca > 0 || r.prev > 0).sort((a, b) => b.ca - a.ca);
    const tot = rows.reduce((s, r) => s + r.ca, 0), totp = rows.reduce((s, r) => s + r.prev, 0);
    const max = rows[0] ? Math.max(1, rows[0].ca) : 1;
    const out = root.querySelector('#out');
    if (!rows.length) { out.innerHTML = `<div class="card empty"><h3>Pas de chiffre d'affaires sur cette période</h3><p style="margin:8px 0 16px">Importez un fichier de chiffre d'affaires pour voir le classement.</p><a class="btn btn-p" href="#/import">Importer</a></div>`; return; }
    const shown = F.tout ? rows : rows.slice(0, 10);

    // CA par département (seulement quand tous les départements sont affichés)
    const parDep = new Map();
    for (const r of rows) parDep.set(r.c.dep || '?', (parDep.get(r.c.dep || '?') || 0) + r.ca);
    const dl = [...parDep.entries()].sort((a, b) => b[1] - a[1]), dmax = Math.max(1, ...dl.map(x => x[1]));

    out.innerHTML = `
      <div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="kpi"><span class="lbl">Total ${esc(dateFr(p.from))} – ${esc(dateFr(p.to))}</span><b class="num">${eur(tot)}</b></div>
        <div class="kpi"><span class="lbl">Par rapport à l'an dernier</span><b class="num" style="font-size:22px">${evo(st.evolution(tot, totp))}</b><span class="small faint num">${eur(totp)} l'an dernier</span></div>
      </div>
      <div class="grid2">
        <div class="card" style="padding:6px 16px">
          ${shown.map((r, i) => `<a class="row" href="#/client/${r.c.id}" style="align-items:flex-start">
            <span class="disp num" style="width:28px;font-size:20px;color:var(--ink-3);padding-top:2px">${i + 1}</span>
            <span class="grow"><span style="display:flex;gap:10px;align-items:baseline"><span class="t" style="flex:1">${esc(r.c.nom)}</span><b class="num" style="white-space:nowrap">${eur(r.ca)}</b></span>
              <span style="display:flex;gap:10px;align-items:center;margin:6px 0 2px"><span class="bar" style="flex:1"><i style="width:${r.ca / max * 100}%"></i></span>
              <span class="small num" style="width:52px;text-align:right">${tot ? pct(r.ca / tot * 100).replace('+', '') : ''}</span></span>
              <span style="display:flex;justify-content:space-between" class="s"><span>${esc(r.c.ville || '')} ${esc(r.c.dep ? '(' + r.c.dep + ')' : '')}</span>${evo(st.evolution(r.ca, r.prev))}</span></span></a>`).join('')}
          ${rows.length > 10 ? `<button class="btn btn-g btn-w" id="tout">${F.tout ? 'Voir seulement les 10 premiers' : `Voir les ${rows.length} clients`}</button>` : ''}
        </div>
        ${F.dep === 'tous' && dl.length > 1 ? `<div class="card"><div class="card-h"><h3>Par département</h3></div>
          ${dl.map(([d, v]) => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between"><b>${esc(d)}</b><span class="num">${eur(v)}</span></div>
          <div class="bar" style="margin-top:6px"><i style="width:${v / dmax * 100}%"></i></div></div>`).join('')}</div>` : ''}
      </div>`;
    const t = out.querySelector('#tout'); if (t) t.onclick = () => { F.tout = !F.tout; draw(); };
  }
}
