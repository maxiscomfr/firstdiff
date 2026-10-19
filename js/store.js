// Données en mémoire + règles métier (statuts, chiffre d'affaires, rappels).
import * as db from './db.js';

export const DEPS_SECTEUR = ['41', '37', '86', '85', '79', '17', '16', '87', '33', '24', '47'];

const DEFAULTS = {
  id: 'reglages',
  deps: DEPS_SECTEUR.slice(),
  domicile: null,              // {adresse, lat, lng}
  seuilOrange: 30,             // jours sans visite avant orange
  seuilRouge: 60,              // jours sans visite avant rouge
  maxParJour: 3,
  hotelKm: 150,                // au-delà, nuit à l'hôtel proposée
  notifs: { retard: true, grosClients: true, baisse: true, tarifs: true, sauvegarde: true },
  theme: 'auto',
  gps: null,                   // 'plans' | 'google' | 'waze' (null : selon l'appareil)
  demo: false,
  derniereSauvegarde: null,
};

export const S = { clients: [], visites: [], ventes: [], tarifs: [], reglages: { ...DEFAULTS } };
const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const emit = () => listeners.forEach(f => f());

export async function load() {
  const [clients, visites, ventes, tarifs, meta] = await Promise.all(db.STORES.map(s => db.all(s)));
  S.clients = clients; S.visites = visites; S.ventes = ventes; S.tarifs = tarifs;
  const r = meta.find(m => m.id === 'reglages');
  S.reglages = { ...DEFAULTS, ...(r || {}), notifs: { ...DEFAULTS.notifs, ...((r && r.notifs) || {}) } };
  index();
}

let visitesPar = new Map(), ventesPar = new Map();
function index() {
  visitesPar = new Map(); ventesPar = new Map();
  for (const v of S.visites) { if (!visitesPar.has(v.clientId)) visitesPar.set(v.clientId, []); visitesPar.get(v.clientId).push(v); }
  for (const l of visitesPar.values()) l.sort((a, b) => b.date.localeCompare(a.date));
  for (const v of S.ventes) { if (!ventesPar.has(v.clientId)) ventesPar.set(v.clientId, []); ventesPar.get(v.clientId).push(v); }
}

export async function saveReglages(patch) {
  Object.assign(S.reglages, patch);
  await db.put('meta', S.reglages);
  emit();
}

// ---------- dates ----------
export const today = () => isoDay(new Date());
export function isoDay(d) { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
export function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); }
export const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
export function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return isoDay(d); }
export function addYears(s, n) { const d = parseDay(s); d.setFullYear(d.getFullYear() + n); return isoDay(d); }

// ---------- clients ----------
export const client = id => S.clients.find(c => c.id === id);
export const visitesDe = id => visitesPar.get(id) || [];
export const derniereVisite = id => (visitesPar.get(id) || [])[0] || null;
export function joursSansVisite(id) { const v = derniereVisite(id); return v ? daysBetween(v.date, today()) : null; }
export function statut(id) {
  const j = joursSansVisite(id);
  if (j === null || j >= S.reglages.seuilRouge) return 'late';
  if (j >= S.reglages.seuilOrange) return 'warn';
  return 'ok';
}
export const STATUT_LABEL = { ok: 'À jour', warn: 'Bientôt', late: 'En retard' };
export function clientsSecteur() { const d = new Set(S.reglages.deps); return S.clients.filter(c => !c.dep || d.has(c.dep)); }

export async function saveClient(c) {
  if (!c.id) c.id = db.uid();
  const i = S.clients.findIndex(x => x.id === c.id);
  if (i >= 0) S.clients[i] = c; else S.clients.push(c);
  await db.put('clients', c); emit();
  return c;
}
export async function deleteClient(id) {
  const vis = visitesDe(id).map(v => v.id), ven = (ventesPar.get(id) || []).map(v => v.id);
  S.clients = S.clients.filter(c => c.id !== id);
  S.visites = S.visites.filter(v => v.clientId !== id);
  S.ventes = S.ventes.filter(v => v.clientId !== id);
  await Promise.all([db.del('clients', id), db.delMany('visites', vis), db.delMany('ventes', ven)]);
  index(); emit();
}

// ---------- visites ----------
export async function addVisite(clientId, note = '', date = today()) {
  const v = { id: db.uid(), clientId, date, note: note.trim() };
  S.visites.push(v); await db.put('visites', v); index(); emit();
  return v;
}
export async function deleteVisite(id) {
  S.visites = S.visites.filter(v => v.id !== id); await db.del('visites', id); index(); emit();
}

// ---------- chiffre d'affaires ----------
export function ca(clientId, from, to) {
  let t = 0;
  for (const v of ventesPar.get(clientId) || []) if (v.date >= from && v.date <= to) t += v.montant;
  return t;
}
export function caTotal(ids, from, to) { let t = 0; for (const id of ids) t += ca(id, from, to); return t; }
export function caMensuel(clientId, nbMois = 24) {
  const d = new Date(); d.setDate(1);
  const out = [];
  for (let i = nbMois - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = isoDay(m).slice(0, 7);
    let t = 0;
    for (const v of ventesPar.get(clientId) || []) if (v.date.slice(0, 7) === key) t += v.montant;
    out.push({ mois: m, montant: t });
  }
  return out;
}
// Périodes : du début de la période à aujourd'hui, comparée à la même période un an plus tôt.
export function periode(kind, libre) {
  const t = new Date(); let from;
  if (kind === 'semaine') { from = new Date(t); from.setDate(t.getDate() - ((t.getDay() + 6) % 7)); }
  else if (kind === 'mois') from = new Date(t.getFullYear(), t.getMonth(), 1);
  else if (kind === 'trimestre') from = new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1);
  else if (kind === '12mois') { from = new Date(t); from.setFullYear(t.getFullYear() - 1); from.setDate(from.getDate() + 1); }
  else if (kind === 'libre' && libre) return withPrev(libre.from, libre.to);
  else from = new Date(t.getFullYear(), 0, 1);
  return withPrev(isoDay(from), isoDay(t));
}
function withPrev(from, to) { return { from, to, pFrom: addYears(from, -1), pTo: addYears(to, -1) }; }
export const evolution = (a, b) => (b > 0 ? (a - b) / b * 100 : null);

// Importe des lignes de CA agrégées par client et par mois (une ligne par mois et par marque).
export async function upsertVentes(rows) {
  const map = new Map(S.ventes.map(v => [v.id, v]));
  for (const r of rows) map.set(r.id, r);
  S.ventes = [...map.values()];
  await db.putMany('ventes', rows); index(); emit();
}

// ---------- tarifs ----------
export async function saveTarif(t) {
  if (!t.id) t.id = db.uid();
  S.tarifs = S.tarifs.filter(x => x.id !== t.id).concat(t);
  await db.put('tarifs', t); emit();
}
export async function deleteTarif(id) { S.tarifs = S.tarifs.filter(x => x.id !== id); await db.del('tarifs', id); emit(); }

// ---------- rappels « À ne pas oublier » ----------
export function rappels() {
  const R = S.reglages, out = [];
  const cl = clientsSecteur();
  const p12 = periode('12mois');
  const caAn = new Map(cl.map(c => [c.id, ca(c.id, p12.from, p12.to)]));
  const tri = [...caAn.values()].sort((a, b) => b - a);
  const seuilGros = tri[Math.max(0, Math.floor(tri.length * 0.2) - 1)] || Infinity;
  if (R.notifs.retard) {
    const late = cl.filter(c => statut(c.id) === 'late').sort((a, b) => (joursSansVisite(b.id) ?? 1e9) - (joursSansVisite(a.id) ?? 1e9));
    for (const c of late.slice(0, 5)) {
      const j = joursSansVisite(c.id);
      out.push({ kind: 'late', clientId: c.id, titre: c.nom, texte: j === null ? 'Jamais visité' : `Pas vu depuis ${j} jours` });
    }
  }
  if (R.notifs.grosClients) {
    for (const c of cl) {
      const j = joursSansVisite(c.id);
      if (j !== null && statut(c.id) === 'warn' && caAn.get(c.id) >= seuilGros && caAn.get(c.id) > 0)
        out.push({ kind: 'warn', clientId: c.id, titre: c.nom, texte: `Gros client, pas vu depuis ${j} jours` });
    }
  }
  if (R.notifs.baisse) {
    for (const c of cl) {
      const a = caAn.get(c.id), b = ca(c.id, p12.pFrom, p12.pTo), e = evolution(a, b);
      if (e !== null && e <= -15 && b >= 5000)
        out.push({ kind: 'warn', clientId: c.id, titre: c.nom, texte: `Chiffre d'affaires en baisse de ${Math.round(-e)} % sur 12 mois` });
    }
  }
  if (R.notifs.tarifs) {
    for (const t of S.tarifs) if (t.ajoute && daysBetween(t.ajoute, today()) <= 7)
      out.push({ kind: 'info', href: '#/import', titre: `Nouveau tarif ${t.marque}`, texte: 'Ajouté cette semaine' });
  }
  if (R.notifs.sauvegarde && S.clients.length && !R.demo) {
    const j = R.derniereSauvegarde ? daysBetween(R.derniereSauvegarde, today()) : null;
    if (j === null || j > 30) out.push({ kind: 'info', href: '#/reglages', titre: 'Faire une sauvegarde', texte: j === null ? 'Aucune sauvegarde pour le moment' : `Dernière sauvegarde il y a ${j} jours` });
  }
  // Un seul rappel par client, avec toutes ses raisons.
  const parClient = new Map(), fusion = [];
  for (const r of out) {
    if (!r.clientId) { fusion.push(r); continue; }
    const ex = parClient.get(r.clientId);
    if (ex) { ex.texte += ' · ' + r.texte; if (r.kind === 'late') ex.kind = 'late'; }
    else { const c = { ...r }; parClient.set(r.clientId, c); fusion.push(c); }
  }
  return fusion;
}

// ---------- sauvegarde / restauration ----------
const toB64 = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
export async function exportJSON() {
  const tarifs = await Promise.all(S.tarifs.map(async t => ({ ...t, blob: undefined, data: t.blob ? await toB64(t.blob) : null })));
  return JSON.stringify({ app: 'FirstDiff', version: 1, date: new Date().toISOString(), clients: S.clients, visites: S.visites, ventes: S.ventes, tarifs, reglages: S.reglages });
}
export async function importJSON(text) {
  const d = JSON.parse(text);
  if (d.app !== 'FirstDiff') throw new Error('Ce fichier n\'est pas une sauvegarde FirstDiff.');
  const tarifs = await Promise.all((d.tarifs || []).map(async t => {
    const o = { ...t }; if (t.data) o.blob = await (await fetch(t.data)).blob(); delete o.data; return o;
  }));
  for (const s of db.STORES) await db.clear(s);
  await db.putMany('clients', d.clients || []); await db.putMany('visites', d.visites || []);
  await db.putMany('ventes', d.ventes || []); await db.putMany('tarifs', tarifs);
  await db.put('meta', { ...d.reglages, id: 'reglages' });
  await load(); emit();
}
export async function resetAll() {
  for (const s of db.STORES) await db.clear(s);
  await load(); emit();
}

// ---------- données d'exemple ----------
export async function loadDemo() {
  const d = await (await fetch('data/demo.json')).json();
  const t = new Date(), clients = [], visites = [], ventes = [];
  for (const c of d.clients) {
    const id = db.uid();
    clients.push({ id, demo: true, nom: c.nom, contact: c.contact, tel: c.tel, email: c.email, adresse: c.adresse, cp: c.cp, ville: c.ville, dep: c.dep, lat: c.lat, lng: c.lng, marques: c.marques, notes: c.notes });
    for (const [j, note] of c.visites) visites.push({ id: db.uid(), clientId: id, date: addDays(today(), -j), note, demo: true });
    for (const [m, montant] of c.ventes) {
      const date = isoDay(new Date(t.getFullYear(), t.getMonth() - m, 1));
      ventes.push({ id: `${id}|${date.slice(0, 7)}|`, clientId: id, date, montant, demo: true });
    }
  }
  await db.putMany('clients', clients); await db.putMany('visites', visites); await db.putMany('ventes', ventes);
  const patch = { demo: true };
  if (!S.reglages.domicile) patch.domicile = d.domicile;
  await load(); await saveReglages(patch);
}
export async function clearDemo() {
  await db.delMany('clients', S.clients.filter(c => c.demo).map(c => c.id));
  await db.delMany('visites', S.visites.filter(c => c.demo).map(c => c.id));
  await db.delMany('ventes', S.ventes.filter(c => c.demo).map(c => c.id));
  await load(); await saveReglages({ demo: false });
}
