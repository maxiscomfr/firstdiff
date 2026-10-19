// Stockage local (IndexedDB). Tout reste sur l'appareil de Jérôme.
const NAME = 'firstdiff', VERSION = 1;
export const STORES = ['clients', 'visites', 'ventes', 'tarifs', 'meta'];
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

export const all = store => tx(store, 'readonly', s => s.getAll());
export const get = (store, id) => tx(store, 'readonly', s => s.get(id));
export const put = (store, obj) => tx(store, 'readwrite', s => { s.put(obj); });
export const del = (store, id) => tx(store, 'readwrite', s => { s.delete(id); });
export const clear = store => tx(store, 'readwrite', s => { s.clear(); });
export const putMany = (store, list) => tx(store, 'readwrite', s => { for (const o of list) s.put(o); });
export const delMany = (store, ids) => tx(store, 'readwrite', s => { for (const id of ids) s.delete(id); });

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Demande au navigateur de ne pas effacer les données en cas de manque de place.
export function persist() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
