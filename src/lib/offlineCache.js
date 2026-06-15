// Tier-1 offline: a last-known-good snapshot of the household dataset, kept in
// IndexedDB so a cold launch (or a refresh) can paint instantly from cache while
// the network revalidates in the background. This is a READ-ONLY safety net —
// writes still go straight to Supabase; nothing here queues mutations. Keyed by
// household id so switching households (or a different user on this device)
// reads its own snapshot, and cleared on sign-out for privacy.
const DB_NAME = 'salernidex-offline'
const STORE = 'snapshots'
const VERSION = 1

let dbPromise
function openDB() {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no indexedDB'))
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

// Read the snapshot for a household. Resolves to the stored object, or null if
// there's nothing cached / IndexedDB is unavailable (private mode, etc.).
export async function loadSnapshot(key) {
  if (!key) return null
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

// Persist a household snapshot. Best-effort: a failure (quota, private mode)
// just means the next cold start falls back to the network, so we swallow it.
export async function saveSnapshot(key, data) {
  if (!key) return
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(data, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* offline cache is non-critical */
  }
}

// Wipe every cached snapshot — called on sign-out so the next user (or the
// signed-out state) never reads the previous user's household data from disk.
export async function clearSnapshots() {
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* ignore */
  }
}
