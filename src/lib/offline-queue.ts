// IndexedDB-backed queue for mutations made while offline.
// The service worker reads the same DB via inline helpers in sw.js.
//
// Flushing is GLOBAL: useGlobalOfflineFlush (mounted once in AppShell) replays
// the whole queue on reconnect/visibility/SW sync, regardless of which page is
// open. Pages that own optimistic state (e.g. useOfflineQueue per list) listen
// for OFFLINE_QUEUE_FLUSHED and refetch if their collection was affected.

/** window CustomEvent fired after a flush syncs at least one mutation.
    detail: { listIds: string[] } — the collection keys that changed. */
export const OFFLINE_QUEUE_FLUSHED = 'offline-queue-flushed'

/** window CustomEvent carrying the current total queue size.
    detail: { count: number } — consumed by OfflineBanner. */
export const OFFLINE_QUEUE_UPDATE = 'offline-queue-update'

export interface QueuedMutation {
  id: string
  endpoint: string
  method: 'POST' | 'PATCH' | 'DELETE'
  /** Request body — omitted for DELETE. */
  body?: Record<string, unknown>
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

/**
 * Cancel every queued mutation belonging to an offline-created (tmp_) item:
 * the original POST (matched by tempId) plus any follow-up PATCHes queued
 * against the temp endpoint. Used when the item is deleted before it ever
 * reaches the server — nothing needs to sync.
 */
export async function removeMutationsByTempId(tempId: string): Promise<void> {
  const all = await getAllMutations()
  const doomed = all.filter(m => m.tempId === tempId || m.endpoint.includes(tempId))
  for (const m of doomed) await removeMutation(m.id)
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

async function registerBackgroundSync() {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return
  try {
    const reg = await navigator.serviceWorker.ready
    await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register('homebase-list-sync')
  } catch {
    // Not supported or permission denied — the online/visibilitychange fallback covers this
  }
}

/** Broadcast the total queue size to OfflineBanner. */
export async function broadcastQueueCount(): Promise<void> {
  try {
    const count = await getQueueCount()
    window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_UPDATE, { detail: { count } }))
  } catch {
    // IndexedDB unavailable
  }
}

/**
 * Enqueue a mutation made while offline and kick off the sync plumbing
 * (Background Sync registration + banner count). Single entry point for
 * every feature that queues offline work.
 */
export async function queueOfflineMutation(mutation: QueuedMutation): Promise<void> {
  await enqueueMutation(mutation)
  await registerBackgroundSync()
  await broadcastQueueCount()
}

let isFlushing = false

/**
 * Replay the entire queue in queuedAt order. Returns the listIds whose
 * mutations were resolved (synced or permanently rejected) so listeners can
 * refetch affected collections. Re-entrant calls are no-ops — only one flush
 * runs at a time.
 */
export async function flushQueuedMutations(): Promise<string[]> {
  if (isFlushing) return []
  isFlushing = true
  try {
    let mutations: QueuedMutation[]
    try {
      mutations = await getAllMutations()
    } catch {
      return []
    }
    const pending = mutations.sort((a, b) => a.queuedAt - b.queuedAt)
    if (pending.length === 0) return []

    // Maps tmp_ IDs of offline-created items to the real IDs the server assigned
    // when their POST replayed earlier in this flush. Later mutations queued
    // against the temp ID (toggle, edit, delete, reorder) are rewritten before
    // being sent.
    const idMap = new Map<string, string>()
    const resolved = new Set<string>()

    for (const mutation of pending) {
      let endpoint = mutation.endpoint
      let payload = mutation.body !== undefined ? JSON.stringify(mutation.body) : undefined
      for (const [tempId, realId] of idMap) {
        endpoint = endpoint.split(tempId).join(realId)
        if (payload !== undefined) payload = payload.split(tempId).join(realId)
      }

      try {
        const res = await fetch(endpoint, {
          method: mutation.method,
          headers: { 'Content-Type': 'application/json' },
          ...(payload !== undefined && { body: payload }),
        })
        if (res.ok) {
          if (mutation.tempId) {
            // POST replay — capture the server-assigned ID so follow-up
            // mutations against the temp ID can be rewritten.
            const created = await res.json().catch(() => null)
            if (created?.id) idMap.set(mutation.tempId, created.id)
          }
          await removeMutation(mutation.id)
          resolved.add(mutation.listId)
        } else if (res.status >= 400 && res.status < 500) {
          // Permanent rejection (validation, deleted elsewhere, locked) —
          // retrying can never succeed, so drop it instead of wedging the queue.
          // Still counts as resolved: the refetch re-aligns optimistic state.
          await removeMutation(mutation.id)
          resolved.add(mutation.listId)
        } else {
          break // 5xx — server trouble; preserve order and retry next flush
        }
      } catch {
        break // Still offline — stop and retry next time
      }
    }

    return [...resolved]
  } finally {
    isFlushing = false
  }
}
