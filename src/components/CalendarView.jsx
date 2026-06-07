import { useState, useEffect, useRef } from 'react'
import handState from '../utils/handState'
import { CALENDAR_EVENTS } from '../data/calendarEvents'
import '../styles/calendar-view.css'

const WEEKDAYS  = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS    = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December']
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function dateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildCells(year, month) {
  // getDay(): 0=Sun … 6=Sat → Monday-first offset
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const offset      = (firstDay + 6) % 7   // Mon=0 … Sun=6
  const cells = Array(offset).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export default function CalendarView() {
  const today     = new Date()
  const year      = today.getFullYear()
  const month     = today.getMonth()
  const todayDate = today.getDate()

  const [visible,  setVisible]  = useState(false)
  const [selected, setSelected] = useState(todayDate)
  const visibleRef = useRef(false)

  // RAF 루프 — Carousel이 위로 dismissed됐을 때만 표시
  useEffect(() => {
    let rafId
    function poll() {
      const show = handState.dismissed && handState.dismissDir === 'up'
      if (show !== visibleRef.current) {
        visibleRef.current = show
        setVisible(show)
      }
      rafId = requestAnimationFrame(poll)
    }
    rafId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // 달력이 열릴 때마다 오늘로 초기화
  useEffect(() => {
    if (visible) setSelected(todayDate)
  }, [visible, todayDate])

  const cells = buildCells(year, month)
  const selectedObj = new Date(year, month, selected)
  const events      = CALENDAR_EVENTS[dateKey(selectedObj)] ?? []

  return (
    <div className={`calendar-view${visible ? ' calendar-view--visible' : ''}`}>

      {/* ── 달력 (좌 2/3) ── */}
      <div className="cal-panel">
        <div className="cal-header">
          <span className="cal-month-label">
            {MONTHS[month].toUpperCase()}&nbsp;&nbsp;{year}
          </span>
        </div>

        <div className="cal-weekdays">
          {WEEKDAYS.map(d => (
            <span key={d} className="cal-weekday">{d}</span>
          ))}
        </div>

        <div className="cal-grid">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="cal-cell cal-cell--empty" />
            const isToday    = day === todayDate
            const isSelected = day === selected
            const hasEv      = !!(CALENDAR_EVENTS[dateKey(new Date(year, month, day))]?.length)
            return (
              <div
                key={i}
                className={[
                  'cal-cell',
                  isToday    ? 'cal-cell--today'    : '',
                  isSelected ? 'cal-cell--selected' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelected(day)}
              >
                <span className="cal-day-num">{day}</span>
                {hasEv && <span className="cal-dot" />}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 일정 (우 1/3) ── */}
      <div className="schedule-panel">
        <div className="schedule-header">
          <span className="schedule-weekday">{DAY_NAMES[selectedObj.getDay()]}</span>
          <span className="schedule-date-num">{String(selected).padStart(2, '0')}</span>
        </div>

        <div className="schedule-events">
          {events.length === 0
            ? <span className="schedule-empty">No events scheduled</span>
            : events.map((ev, i) => (
              <div key={i} className="schedule-event">
                <span className="schedule-time">{ev.time}</span>
                <span className="schedule-title">{ev.title}</span>
              </div>
            ))
          }
        </div>
      </div>

    </div>
  )
}
