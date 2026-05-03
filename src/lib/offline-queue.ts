// IndexedDB-backed queue for mutations made while offline.
// The service worker reads the same DB via inline helpers in sw.js.

export interface QueuedMutation {
  id: string
  endpoint: string
  method: 'POST' | 'PATCH'
  body: Record<string, unknown>
  /** Temporary client-side ID used for POST mutations until the server returns the real ID. */
  tempId?: string
  /** List ID — used after sync to know which list to refetch. */
  listId: string
  queuedAt: number
}

const DB_NAME = 'homebase-offline-queue'
const STORE_NAME = 'mutations'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result as IDBDatabase)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export async function enqueueMutation(mutation: QueuedMutation): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).put(mutation)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve()
  })
}

export async function getAllMutations(): Promise<QueuedMutation[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAll()
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result as QueuedMutation[])
  })
}

export async function removeMutation(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).delete(id)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve()
  })
}

export async function getQueueCount(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).count()
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result as number)
  })
}
