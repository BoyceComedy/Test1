// IndexedDB persistence (projects, imported fonts, preferences). If IndexedDB
// is unavailable the app keeps working in memory and reports it.
const mem = { projects: new Map(), fonts: new Map(), kv: new Map() };
let dbp = null;
export let persistent = true;

function open() {
  if (dbp) return dbp;
  dbp = new Promise(resolve => {
    try {
      const rq = indexedDB.open('logo-lab', 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('fonts', { keyPath: 'key' });
        db.createObjectStore('kv');
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = rq.onblocked = () => { persistent = false; resolve(null); };
    } catch (e) { persistent = false; resolve(null); }
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const db = await open();
  if (!db) return fn(null);
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode), rq = fn(t.objectStore(store));
    t.oncomplete = () => resolve(rq && rq.result);
    t.onerror = t.onabort = () => reject(t.error);
  });
}
const keyOf = (store, v) => (store === 'projects' ? v.id : v.key);
export const put = (store, value, key) => tx(store, 'readwrite', s => s ? (key !== undefined ? s.put(value, key) : s.put(value)) : (mem[store].set(key !== undefined ? key : keyOf(store, value), value), null));
export const get = (store, key) => tx(store, 'readonly', s => s ? s.get(key) : { result: mem[store].get(key) });
export const del = (store, key) => tx(store, 'readwrite', s => s ? s.delete(key) : (mem[store].delete(key), null));
export const all = store => tx(store, 'readonly', s => s ? s.getAll() : { result: [...mem[store].values()] });
