// Lecture des fichiers Excel / CSV / PDF et rapprochement avec les données existantes.
import { normalise } from './ui.js';
import { S, isoDay } from './store.js';

// ---------- lecture ----------
export async function lireFichier(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf' || file.type === 'application/pdf') return { kind: 'pdf', lignes: await lirePDF(file) };
  await chargerXLSX();
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  // On prend la feuille qui contient le plus de lignes remplies.
  let best = [];
  for (const n of wb.SheetNames) {
    const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' })
      .filter(r => r.some(v => String(v).trim() !== ''));
    if (rows.length > best.length) best = rows;
  }
  return { kind: 'tableur', lignes: best };
}
function chargerXLSX() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

// Reconstitue les lignes d'un tableau à partir du texte du PDF (position des mots).
async function lirePDF(file) {
  const pdfjs = await import('../vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lignes = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter(i => i.str.trim()).map(i => ({ x: i.transform[4], y: i.transform[5], w: i.width, s: i.str.trim() }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const groupes = [];
    for (const it of items) {
      const g = groupes.find(g => Math.abs(g.y - it.y) < 3);
      if (g) g.items.push(it); else groupes.push({ y: it.y, items: [it] });
    }
    for (const g of groupes) {
      g.items.sort((a, b) => a.x - b.x);
      const cells = [];
      for (const it of g.items) {
        const last = cells[cells.length - 1];
        if (last && it.x - (last.x + last.w) < 6) { last.s += (it.x - (last.x + last.w) > 1.5 ? ' ' : '') + it.s; last.w = it.x + it.w - last.x; }
        else cells.push({ ...it });
      }
      lignes.push(cells);
    }
  }
  return lignes;   // tableau de lignes, chaque ligne = [{x, w, s}]
}

// ---------- colonnes ----------
export const CHAMPS = {
  clients: {
    code: ['code', 'code client', 'n client', 'no client', 'numero client', 'num client', 'ref client', 'reference client', 'compte', 'id client'],
    nom: ['nom', 'raison sociale', 'client', 'societe', 'enseigne', 'magasin', 'nom client', 'nom du client', 'denomination', 'nom magasin'],
    contact: ['contact', 'interlocuteur', 'responsable', 'gerant', 'nom contact', 'dirigeant'],
    tel: ['tel', 'telephone', 'portable', 'mobile', 'tel fixe', 'telephone fixe', 'tel portable', 'phone'],
    email: ['email', 'e mail', 'mail', 'courriel', 'adresse mail', 'adresse email'],
    adresse: ['adresse', 'adresse 1', 'adresse1', 'rue', 'adresse postale', 'voie'],
    cp: ['cp', 'code postal', 'postal', 'c p'],
    ville: ['ville', 'commune', 'localite', 'city'],
    marques: ['marque', 'marques', 'fournisseur'],
  },
  ca: {
    code: ['code', 'code client', 'n client', 'no client', 'numero client', 'num client', 'ref client', 'compte', 'id client'],
    nom: ['nom', 'client', 'raison sociale', 'societe', 'enseigne', 'magasin', 'nom client'],
    cp: ['cp', 'code postal'],
    ville: ['ville', 'commune'],
    date: ['date', 'date facture', 'date de facture', 'mois', 'periode', 'date commande', 'date de commande', 'jour'],
    montant: ['montant', 'ca', 'c a', 'chiffre d affaires', 'chiffre affaires', 'total ht', 'montant ht', 'ht', 'net ht', 'total', 'ca ht', 'montant net', 'net'],
    marque: ['marque', 'fournisseur'],
  },
};
export const LIBELLES = { code: 'Code client', nom: 'Nom', contact: 'Contact', tel: 'Téléphone', email: 'E-mail', adresse: 'Adresse', cp: 'Code postal', ville: 'Ville', marques: 'Marques', date: 'Date', montant: 'Montant', marque: 'Marque' };

const MOIS = { janv: 1, janvier: 1, jan: 1, fev: 2, fevr: 2, fevrier: 2, feb: 2, mars: 3, mar: 3, avr: 4, avril: 4, apr: 4, mai: 5, may: 5, juin: 6, jun: 6, juil: 7, juillet: 7, jul: 7, aout: 8, aug: 8, sept: 9, sep: 9, septembre: 9, oct: 10, octobre: 10, nov: 11, novembre: 11, dec: 12, decembre: 12 };

function score(h, syn) {
  const n = normalise(h);
  if (!n) return 0;
  let best = 0;
  for (const s of syn) { if (n === s) return 3; if (n.startsWith(s + ' ') || n.endsWith(' ' + s)) best = Math.max(best, 2); else if (s.length > 3 && n.includes(s)) best = Math.max(best, 1); }
  return best;
}
// Associe chaque champ à une colonne d'en-tête.
export function deviner(entetes, type) {
  const champs = CHAMPS[type], map = {}, pris = new Set();
  const cand = [];
  for (const [k, syn] of Object.entries(champs)) entetes.forEach((h, i) => { const s = score(h, syn); if (s) cand.push({ k, i, s }); });
  cand.sort((a, b) => b.s - a.s);
  for (const c of cand) if (!(c.k in map) && !pris.has(c.i)) { map[c.k] = c.i; pris.add(c.i); }
  return map;
}
export function moisColonnes(entetes) {
  // Format « large » : une colonne par mois (janv. 2025, 01/2025, 2025-01…)
  const out = [];
  entetes.forEach((h, i) => { const d = lireMois(h); if (d) out.push({ i, date: d }); });
  return out.length >= 2 ? out : [];
}
function lireMois(h) {
  if (h instanceof Date) return isoDay(new Date(h.getFullYear(), h.getMonth(), 1));
  const n = normalise(h);
  let m = n.match(/^([a-z]+) (\d{2,4})$/);
  if (m && MOIS[m[1]]) return `${m[2].length === 2 ? '20' + m[2] : m[2]}-${String(MOIS[m[1]]).padStart(2, '0')}-01`;
  m = n.match(/^(\d{1,2}) (\d{4})$/) ; if (m && +m[1] <= 12) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  m = n.match(/^(\d{4}) (\d{1,2})$/) ; if (m && +m[2] <= 12) return `${m[1]}-${m[2].padStart(2, '0')}-01`;
  return null;
}

// Trouve la ligne d'en-tête (la première qui ressemble à des titres de colonnes).
export function preparer(lu, type) {
  const brutes = lu.kind === 'pdf' ? lu.lignes.map(l => l.map(c => c.s)) : lu.lignes.map(r => r.map(v => v));
  let hi = 0, bestScore = -1;
  for (let i = 0; i < Math.min(brutes.length, 25); i++) {
    const m = deviner(brutes[i].map(String), type);
    const s = Object.keys(m).length + (type === 'ca' ? moisColonnes(brutes[i]).length / 2 : 0);
    if (s > bestScore) { bestScore = s; hi = i; }
  }
  const entetes = brutes[hi].map(v => v instanceof Date ? v : String(v).trim());
  let rows;
  if (lu.kind === 'pdf') {
    // Range chaque morceau de texte sous la colonne d'en-tête la plus proche.
    const hx = lu.lignes[hi].map(c => c.x);
    rows = lu.lignes.slice(hi + 1).map(l => {
      const r = new Array(hx.length).fill('');
      for (const c of l) {
        let k = 0, d = Infinity;
        hx.forEach((x, j) => { const dd = Math.abs(c.x - x); const dd2 = Math.abs(c.x + c.w - (lu.lignes[hi][j].x + lu.lignes[hi][j].w)); const m = Math.min(dd, dd2); if (m < d) { d = m; k = j; } });
        r[k] = r[k] ? r[k] + ' ' + c.s : c.s;
      }
      return r;
    });
  } else rows = brutes.slice(hi + 1);
  rows = rows.filter(r => r.some(v => String(v).trim() !== ''));
  return { entetes: entetes.map(String), entetesBrutes: entetes, rows, map: deviner(entetes.map(String), type), mois: type === 'ca' ? moisColonnes(entetes) : [] };
}

// Devine le type de fichier d'après ses en-têtes.
export function typeProbable(lu) {
  const c = preparer(lu, 'clients'), v = preparer(lu, 'ca');
  const sc = Object.keys(c.map).length, sv = ('montant' in v.map ? 2 : 0) + ('date' in v.map ? 2 : 0) + (v.mois.length ? 3 : 0);
  if (lu.kind === 'pdf' && sc < 3 && sv < 3) return 'tarifs';
  if (sv >= 3 && sv >= sc - 2) return 'ca';
  if (sc >= 2) return 'clients';
  return lu.kind === 'pdf' ? 'tarifs' : 'clients';
}

// ---------- valeurs ----------
const txt = v => (v instanceof Date ? isoDay(v) : String(v ?? '')).trim();
export function montant(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[€\s  ]/g, '').replace(/eur$/i, '');
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-') || s.startsWith('−'); s = s.replace(/[()\-−+]/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : (neg ? -n : n);
}
export function dateMois(v) {
  if (v instanceof Date && !isNaN(v)) return isoDay(new Date(v.getFullYear(), v.getMonth(), 1));
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return isoDay(new Date(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-01`; }
  m = s.match(/^(\d{4})[\/.\-](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`;
  return lireMois(s);
}
const nettoyerTel = t => { const d = String(t).replace(/\D/g, ''); const n = d.length === 9 ? '0' + d : d.startsWith('33') && d.length === 11 ? '0' + d.slice(2) : d; return n.length === 10 ? n.replace(/(\d{2})(?=\d)/g, '$1 ') : String(t).trim(); };
const nettoyerCP = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 4 ? '0' + d : d.slice(0, 5); };

// ---------- rapprochement ----------
function indexClients() {
  const parCode = new Map(), parNomCP = new Map(), parNom = new Map();
  for (const c of S.clients) {
    if (c.code) parCode.set(normalise(c.code), c);
    const n = normalise(c.nom);
    parNomCP.set(n + '|' + (c.cp || ''), c); parNomCP.set(n + '|' + normalise(c.ville), c);
    parNom.set(n, parNom.has(n) ? null : c);   // null = plusieurs clients avec ce nom
  }
  return ({ code, nom, cp, ville }) => (code && parCode.get(normalise(code)))
    || (nom && (parNomCP.get(normalise(nom) + '|' + (cp || '')) || parNomCP.get(normalise(nom) + '|' + normalise(ville))))
    || (nom && parNom.get(normalise(nom))) || null;
}

export function analyserClients(p) {
  const trouver = indexClients(), M = p.map, get = (r, k) => k in M ? txt(r[M[k]]) : '';
  const res = { nouveaux: [], majs: [], ignores: [], inchanges: 0 }, vus = new Set();
  for (const r of p.rows) {
    const d = { code: get(r, 'code'), nom: get(r, 'nom'), contact: get(r, 'contact'), tel: get(r, 'tel') && nettoyerTel(get(r, 'tel')), email: get(r, 'email').toLowerCase(),
      adresse: get(r, 'adresse'), cp: nettoyerCP(get(r, 'cp')), ville: get(r, 'ville'), marques: get(r, 'marques') ? get(r, 'marques').split(/[,;/]/).map(s => s.trim()).filter(Boolean) : null };
    if (!d.nom) { res.ignores.push({ ligne: r, raison: 'Nom manquant' }); continue; }
    if (/^(total|sous total)/i.test(normalise(d.nom))) { res.ignores.push({ ligne: r, raison: 'Ligne de total' }); continue; }
    const cle = normalise(d.code || d.nom + '|' + d.cp + '|' + d.ville);
    if (vus.has(cle)) { res.ignores.push({ ligne: r, raison: 'En double dans le fichier' }); continue; }
    vus.add(cle);
    const ex = trouver(d);
    if (!ex) { res.nouveaux.push({ ...d, dep: d.cp ? d.cp.slice(0, 2) : '', marques: d.marques || [], notes: '' }); continue; }
    const champs = [], maj = { ...ex };
    for (const k of ['code', 'contact', 'tel', 'email', 'adresse', 'cp', 'ville']) if (d[k] && d[k] !== (ex[k] || '')) { maj[k] = d[k]; champs.push(LIBELLES[k]); }
    if (d.marques && d.marques.join(',') !== (ex.marques || []).join(',')) { maj.marques = d.marques; champs.push('Marques'); }
    if (champs.length) {
      if (champs.some(c => ['Adresse', 'Code postal', 'Ville'].includes(c))) { maj.lat = maj.lng = null; delete maj.geoEchec; if (maj.cp) maj.dep = maj.cp.slice(0, 2); }
      res.majs.push({ client: maj, champs });
    } else res.inchanges++;
  }
  return res;
}

export function analyserCA(p, clientsAjoutes = []) {
  const trouver = indexClients(), M = p.map, get = (r, k) => k in M ? r[M[k]] : '';
  const existantes = new Map(S.ventes.map(v => [v.id, v]));
  const agg = new Map(), ignores = [], inconnus = new Map();
  const ajouter = (c, date, mt, marque) => {
    const id = `${c.id}|${date.slice(0, 7)}|${marque || ''}`;
    const a = agg.get(id) || { id, clientId: c.id, date, montant: 0, marque: marque || '' };
    a.montant += mt; agg.set(id, a);
  };
  for (const r of p.rows) {
    const ident = { code: txt(get(r, 'code')), nom: txt(get(r, 'nom')), cp: nettoyerCP(get(r, 'cp')), ville: txt(get(r, 'ville')) };
    if (!ident.code && !ident.nom) { ignores.push({ ligne: r, raison: 'Client non indiqué' }); continue; }
    if (/^(total|sous total)/.test(normalise(ident.nom || ident.code))) { ignores.push({ ligne: r, raison: 'Ligne de total' }); continue; }
    const c = trouver(ident);
    if (!c) { const k = ident.nom || ident.code; inconnus.set(k, (inconnus.get(k) || 0) + 1); ignores.push({ ligne: r, raison: `Client inconnu : ${k}` }); continue; }
    const marque = txt(get(r, 'marque'));
    if (p.mois.length) {
      let ok = false;
      for (const col of p.mois) { const mt = montant(r[col.i]); if (mt) { ajouter(c, col.date, mt, marque); ok = true; } }
      if (!ok) ignores.push({ ligne: r, raison: 'Aucun montant' });
    } else {
      const date = dateMois(get(r, 'date')), mt = montant(get(r, 'montant'));
      if (!date) { ignores.push({ ligne: r, raison: 'Date illisible' }); continue; }
      if (mt === null) { ignores.push({ ligne: r, raison: 'Montant illisible' }); continue; }
      ajouter(c, date, mt, marque);
    }
  }
  const res = { nouveaux: [], majs: [], ignores, inchanges: 0, inconnus: [...inconnus.entries()] };
  for (const a of agg.values()) {
    a.montant = Math.round(a.montant * 100) / 100;
    const ex = existantes.get(a.id);
    if (!ex) res.nouveaux.push(a); else if (Math.abs(ex.montant - a.montant) > 0.005) res.majs.push({ vente: a, avant: ex.montant }); else res.inchanges++;
  }
  return res;
}
