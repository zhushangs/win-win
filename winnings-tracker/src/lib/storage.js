// Persistent key-value storage for Win Win.
//
// Data lives in IndexedDB, which browsers keep more reliably than localStorage
// and which isn't capped at ~5MB. If IndexedDB is unavailable (some private
// modes), it falls back to localStorage. Values saved by older versions in
// localStorage are migrated into IndexedDB the first time they're read.

const DB_NAME = 'win-win';
const STORE = 'kv';

let dbPromise = null;

const openDb = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
};

const idbRequest = async (mode, run) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

const readLocalStorage = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

// Returns the stored value, or undefined if nothing is stored under `key`.
export const loadValue = async (key) => {
  try {
    const value = await idbRequest('readonly', (s) => s.get(key));
    if (value !== undefined) return value;
    // Nothing in IndexedDB yet: migrate from localStorage if an older version saved there.
    const legacy = readLocalStorage(key);
    if (legacy !== undefined) await saveValue(key, legacy);
    return legacy;
  } catch (e) {
    console.warn('IndexedDB read failed, using localStorage', e);
    return readLocalStorage(key);
  }
};

export const saveValue = async (key, value) => {
  try {
    await idbRequest('readwrite', (s) => s.put(value, key));
  } catch (e) {
    console.warn('IndexedDB write failed, using localStorage', e);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e2) {
      console.warn('Failed to save', key, e2);
    }
  }
};

// Kept for existing callers: returns [] when nothing is stored.
export const loadWinnings = async (key) => {
  const value = await loadValue(key);
  return value === undefined ? [] : value;
};

export const saveWinnings = saveValue;

// Ask the browser not to evict our data under storage pressure.
// Returns true if storage is (now) persistent, false if not, null if unsupported.
export const requestPersistentStorage = async () => {
  try {
    if (!navigator.storage || !navigator.storage.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
};
