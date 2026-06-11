// ── D-Day 스토어 ── localStorage 영속 + 구독 (calendarEvents 패턴 차용)
const STORAGE_KEY = 'gw_ddays'

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

let _ddays = load()
let _seq   = _ddays.reduce((m, d) => Math.max(m, d.id), 0)
const _listeners = new Set()

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_ddays)) } catch {}
  _listeners.forEach(fn => fn())
}

// 목표일까지 남은 일수. 음수면 지난 D-day (D+N).
export function daysUntil(dateStr) {
  const today  = new Date()
  today.setHours(0, 0, 0, 0)
  const [y, m, d] = dateStr.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  target.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

// 가까운 순 정렬: 다가오는 일정(>=0) 우선, 그다음 지난 일정.
export function getDdays() {
  return [..._ddays].sort((a, b) => {
    const da = daysUntil(a.date)
    const db = daysUntil(b.date)
    const fa = da < 0 ? 1 : 0
    const fb = db < 0 ? 1 : 0
    if (fa !== fb) return fa - fb
    return fa ? db - da : da - db
  })
}

export function addDday(title, date) {
  _ddays.push({ id: ++_seq, title: title.trim(), date })
  persist()
}

export function deleteDday(id) {
  _ddays = _ddays.filter(d => d.id !== id)
  persist()
}

export function subscribeDdays(fn) {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}
