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
export const CALENDAR_EVENTS = {
  // ── May 2026 ──
  '2026-05-08': [
    { time: '10:00', title: 'Quarterly OKR Review', category: 'work' },
    { time: '15:00', title: 'Team Happy Hour',      category: 'social' },
  ],
  '2026-05-13': [
    { time: '09:00', title: 'Morning Run',           category: 'health' },
    { time: '14:00', title: 'Product Demo',          category: 'work' },
  ],
  '2026-05-20': [
    { time: '11:00', title: 'Lunch with Sarah',      category: 'social' },
  ],
  '2026-05-27': [
    { time: '09:30', title: 'Dentist',               category: 'health' },
    { time: '16:00', title: 'Sprint Planning',       category: 'work' },
  ],

  // ── June 2026 ──
  '2026-06-03': [
    { time: '10:00', title: 'Kickoff Meeting',       category: 'work' },
  ],
  '2026-06-05': [
    { time: '14:00', title: 'Design Sync',           category: 'work' },
    { time: '17:00', title: 'Code Review',           category: 'work' },
  ],
  '2026-06-07': [
    { time: '09:30', title: 'Team Standup',          category: 'work' },
    { time: '14:00', title: 'Design Review',         category: 'work' },
    { time: '18:30', title: 'Book Club',             category: 'personal' },
  ],
  '2026-06-10': [
    { time: '11:00', title: 'Client Call',           category: 'work' },
    { time: '16:00', title: 'Sprint Planning',       category: 'work' },
  ],
  '2026-06-12': [
    { time: '07:00', title: 'Morning Yoga',          category: 'health' },
    { time: '09:00', title: 'Architecture Review',   category: 'work' },
  ],
  '2026-06-14': [
    { time: '19:00', title: 'Dinner with family',    category: 'personal' },
  ],
  '2026-06-16': [
    { time: '13:00', title: 'Lunch with Alex',       category: 'social' },
    { time: '15:30', title: 'UX Walkthrough',        category: 'work' },
  ],
  '2026-06-19': [
    { time: '10:00', title: 'Product Demo',          category: 'work' },
    { time: '14:30', title: 'Retrospective',         category: 'work' },
  ],
  '2026-06-21': [
    { time: '09:00', title: 'All Hands',             category: 'work' },
    { time: '17:00', title: 'Team Dinner',           category: 'social' },
  ],
  '2026-06-24': [
    { time: '11:30', title: 'Investor Update',       category: 'work' },
  ],
  '2026-06-26': [
    { time: '10:00', title: 'Q3 Planning',           category: 'work' },
    { time: '15:00', title: 'Board Prep',            category: 'work' },
  ],
  '2026-06-28': [
    { time: '09:00', title: 'Quarterly Review',      category: 'work' },
    { time: '15:00', title: 'Planning Session',      category: 'work' },
  ],

  // ── July 2026 ──
  '2026-07-01': [
    { time: '09:00', title: 'Q3 Kickoff',            category: 'work' },
  ],
  '2026-07-04': [
    { time: '19:00', title: 'Independence Day BBQ',  category: 'social' },
  ],
  '2026-07-09': [
    { time: '08:00', title: 'Annual Checkup',        category: 'health' },
    { time: '14:00', title: 'Strategy Workshop',     category: 'work' },
  ],
  '2026-07-14': [
    { time: '11:00', title: 'Investor Meeting',      category: 'work' },
    { time: '17:30', title: 'Evening Jog',           category: 'health' },
  ],
  '2026-07-21': [
    { time: '13:00', title: 'Lunch & Learn',         category: 'work' },
  ],
  '2026-07-28': [
    { time: '10:00', title: 'Sprint Review',         category: 'work' },
    { time: '18:00', title: 'Team Outing',           category: 'social' },
  ],
}
