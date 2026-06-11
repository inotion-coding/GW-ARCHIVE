// ── 동적 이벤트 스토어 ──
const STORAGE_KEY   = 'motion_custom_events'
const OVERRIDES_KEY = 'motion_event_overrides'

function loadCustom() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}
function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}') } catch { return {} }
}

let _custom    = loadCustom()
let _overrides = loadOverrides()
const _listeners = new Set()

// ── 1회성 정리: 데모(시드) 일정을 제거하면서, 과거 테스트 중 시드 일정을
//    이동/삭제하며 생긴 override 잔여물도 한 번 비운다. 사용자가 폼으로 직접
//    추가한 _custom 은 보존. 플래그로 단 한 번만 실행되어 이후 정상 이동/삭제는 유지된다.
const PURGE_FLAG = 'motion_seed_purged_v1'
try {
  if (!localStorage.getItem(PURGE_FLAG)) {
    localStorage.removeItem(OVERRIDES_KEY)
    _overrides = {}
    localStorage.setItem(PURGE_FLAG, '1')
  }
} catch {}

export function getAllEvents(key) {
  if (_overrides[key] !== undefined) return [..._overrides[key]]
  return [...(CALENDAR_EVENTS[key] ?? []), ...(_custom[key] ?? [])]
}

export function addEvent(key, event) {
  if (_overrides[key] !== undefined) {
    _overrides[key] = [..._overrides[key], event].sort((a, b) => a.time.localeCompare(b.time))
    try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(_overrides)) } catch {}
  } else {
    if (!_custom[key]) _custom[key] = []
    _custom[key].push(event)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_custom)) } catch {}
  }
  _listeners.forEach(fn => fn())
}

export function moveEvent(fromKey, eventIdx, toKey) {
  const fromEvents = getAllEvents(fromKey)
  const toEvents   = getAllEvents(toKey)
  if (eventIdx < 0 || eventIdx >= fromEvents.length) return
  const [event]  = fromEvents.splice(eventIdx, 1)
  const toSorted = [...toEvents, { ...event }].sort((a, b) => a.time.localeCompare(b.time))
  _overrides[fromKey] = fromEvents
  _overrides[toKey]   = toSorted
  try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(_overrides)) } catch {}
  _listeners.forEach(fn => fn())
}

export function deleteEvent(key, eventIdx) {
  const events = getAllEvents(key)
  if (eventIdx < 0 || eventIdx >= events.length) return
  events.splice(eventIdx, 1)
  _overrides[key] = events
  try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(_overrides)) } catch {}
  _listeners.forEach(fn => fn())
}

export function subscribeEvents(fn) {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

// category: 'work' | 'personal' | 'health' | 'social'
// 데모(시드) 일정 제거 — 사용자가 직접 입력한 일정만 표시된다.
export const CALENDAR_EVENTS = {}
