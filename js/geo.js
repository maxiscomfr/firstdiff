// Carte, adresses et itinéraires.
import { S } from './store.js';

let depsGeo;
export async function departements() {
  if (!depsGeo) depsGeo = fetch('data/departements.json').then(r => r.json());
  return depsGeo;
}
export async function nomsDepartements() {
  const g = await departements();
  return g.features.map(f => ({ code: f.properties.code, nom: f.properties.nom })).sort((a, b) => a.code.localeCompare(b.code));
}

export const getVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ---------- adresses (Base Adresse Nationale, gratuite) ----------
export async function geocoder(q) {
  const r = await fetch('https://api-adresse.data.gouv.fr/search/?limit=1&q=' + encodeURIComponent(q));
  if (!r.ok) throw new Error('adresse');
  const j = await r.json();
  const f = j.features && j.features[0];
  if (!f || f.properties.score < 0.35) return null;
  const [lng, lat] = f.geometry.coordinates;
  return { lat, lng, label: f.properties.label, cp: f.properties.postcode, ville: f.properties.city, dep: (f.properties.context || '').split(',')[0].trim() };
}
export async function suggestions(q) {
  if (q.trim().length < 4) return [];
  const r = await fetch('https://api-adresse.data.gouv.fr/search/?limit=5&q=' + encodeURIComponent(q));
  const j = await r.json();
  return (j.features || []).map(f => ({ label: f.properties.label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }));
}
// Place sur la carte les clients qui n'ont pas encore de position, un par un, sans bloquer l'écran.
let enCours = false;
export async function geocoderManquants(save, onProgress) {
  if (enCours || !navigator.onLine) return;
  enCours = true;
  try {
    for (const c of S.clients.filter(c => c.lat == null && !c.geoEchec)) {
      const q = [c.adresse, c.cp, c.ville].filter(Boolean).join(' ');
      if (!q) continue;
      try {
        const g = await geocoder(q);
        if (g) { c.lat = g.lat; c.lng = g.lng; if (!c.dep && g.dep) c.dep = g.dep; if (!c.cp && g.cp) c.cp = g.cp; }
        else c.geoEchec = true;
        await save(c); onProgress && onProgress();
      } catch { break; }
      await new Promise(r => setTimeout(r, 120));
    }
  } finally { enCours = false; }
}

// ---------- distances ----------
export function km(a, b) {
  const R = 6371, t = Math.PI / 180;
  const dLa = (b.lat - a.lat) * t, dLo = (b.lng - a.lng) * t;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Estimation hors ligne : la route fait environ 1,3 fois la distance à vol d'oiseau, à 70 km/h de moyenne.
export const estimRoute = (a, b) => { const d = km(a, b) * 1.3; return { km: d, min: d / 70 * 60 }; };

// Itinéraire routier réel (OSRM). En cas d'échec, on garde l'estimation.
export async function itineraire(points) {
  const coords = points.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=simplified&geometries=geojson`, { signal: ctl.signal });
    const j = await r.json();
    if (j.code !== 'Ok') throw 0;
    const route = j.routes[0];
    return { km: route.distance / 1000, min: route.duration / 60, legs: route.legs.map(l => ({ km: l.distance / 1000, min: l.duration / 60 })), ligne: route.geometry.coordinates.map(([x, y]) => [y, x]), reel: true };
  } catch {
    const legs = [];
    for (let i = 1; i < points.length; i++) legs.push(estimRoute(points[i - 1], points[i]));
    return { km: legs.reduce((s, l) => s + l.km, 0), min: legs.reduce((s, l) => s + l.min, 0), legs, ligne: points.map(p => [p.lat, p.lng]), reel: false };
  }
}

// ---------- GPS ----------
// Application de guidage choisie dans les Réglages : Plans (Apple), Google Maps ou Waze.
const ll = p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
export const appGPS = () => S.reglages.gps || (/iphone|ipad|ipod|macintosh/i.test(navigator.userAgent) ? 'plans' : 'google');
export const multiEtapes = () => appGPS() === 'google';
export function lienGPS(depart, etapes) {
  const app = appGPS();
  if (app === 'waze') return `https://waze.com/ul?ll=${ll(etapes[0])}&navigate=yes`;
  if (app === 'plans') return `https://maps.apple.com/?daddr=${ll(etapes[0])}&dirflg=d`;
  const dest = etapes[etapes.length - 1], via = etapes.slice(0, -1);
  let u = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${ll(dest)}`;
  if (depart) u += `&origin=${ll(depart)}`;
  if (via.length) u += `&waypoints=${via.map(ll).join('%7C')}`;
  return u;
}
export const lienHotels = p => appGPS() === 'plans' ? `https://maps.apple.com/?q=h%C3%B4tel&sll=${ll(p)}&z=13` : `https://www.google.com/maps/search/h%C3%B4tel/@${p.lat.toFixed(5)},${p.lng.toFixed(5)},13z`;
export const duree = min => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; };
