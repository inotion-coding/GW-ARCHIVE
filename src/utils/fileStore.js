// ── 업로드 파일 영속 저장소 (IndexedDB) ──
// 원본 파일(Blob)을 저장해 새로고침 후에도 복원할 수 있게 한다.
// localStorage는 용량 한계(~5MB)가 있어 큰 파일(PDF·영상)에 부적합하므로 IndexedDB 사용.

const DB_NAME    = 'motion_files'
const STORE_NAME = 'files'
const DB_VERSION = 1

let _dbPromise = null

function openDB() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
  return _dbPromise
}

function tx(mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t     = db.transaction(STORE_NAME, mode)
    const store = t.objectStore(STORE_NAME)
    let result
    Promise.resolve(fn(store)).then(r => { result = r })
    t.oncomplete = () => resolve(result)
    t.onerror    = () => reject(t.error)
    t.onabort    = () => reject(t.error)
  }))
}

// 단순 증가 시퀀스로 업로드 순서를 보존
let _seqBase = 0

export async function saveFile(id, file) {
  const record = {
    id,
    name: file.name,
    blob: file,                 // File은 Blob을 상속 → 그대로 저장 가능
    seq:  ++_seqBase,
  }
  try {
    await tx('readwrite', store => store.put(record))
  } catch (err) {
    console.warn('[fileStore] save failed', err)
  }
}

export async function getAllFiles() {
  try {
    const all = await tx('readonly', store => new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror   = () => reject(req.error)
    }))
    all.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    if (all.length) _seqBase = all[all.length - 1].seq ?? all.length
    return all
  } catch (err) {
    console.warn('[fileStore] load failed', err)
    return []
  }
}

export async function deleteFile(id) {
  try {
    await tx('readwrite', store => store.delete(id))
  } catch (err) {
    console.warn('[fileStore] delete failed', err)
  }
}
