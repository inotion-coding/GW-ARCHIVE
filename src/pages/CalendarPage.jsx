import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CALENDAR_EVENTS } from '../data/calendarEvents'
import handState from '../utils/handState'
import '../styles/calendar-view.css'
import '../styles/calendar-page.css'

const WEEKDAYS  = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS    = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December']
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const CAT_LABEL = { work: 'Work', personal: 'Personal', health: 'Health', social: 'Social' }

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

function buildCells(year, month) {
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const offset      = (firstDay + 6) % 7
  const cells       = Array(offset).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const today    = new Date()

  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selected,  setSelected]  = useState(today.getDate())

  // 뒤로가기 + 핀치 셀 선택 통합 루프
  useEffect(() => {
    let rafId
    let wasIndexPinch = false
    let hoveredCell   = null

    function hitTest(nx, ny) {
      const el = document.elementFromPoint(nx * window.innerWidth, ny * window.innerHeight)
      return el?.closest?.('[data-day]') ?? null
    }

    function applyHover(cell) {
      if (cell === hoveredCell) return
      hoveredCell?.classList.remove('cal-cell--pinch-hover')
      cell?.classList.add('cal-cell--pinch-hover')
      hoveredCell = cell ?? null
    }

    function poll() {
      if (handState.back) { handState.back = false; navigate('/'); return }

      // 엄지+검지 핀치만 날짜 선택
      const idxPinch = handState.indexPinchActive
      if (idxPinch) {
        const cell = hitTest(handState.indexPinchMidX, handState.indexPinchMidY)
        applyHover(cell)
        if (!wasIndexPinch && cell?.dataset?.day) setSelected(Number(cell.dataset.day))
      } else {
        applyHover(null)
      }
      wasIndexPinch = idxPinch
      rafId = requestAnimationFrame(poll)
    }

    rafId = requestAnimationFrame(poll)
    return () => {
      cancelAnimationFrame(rafId)
      handState.back = false
      hoveredCell?.classList.remove('cal-cell--pinch-hover')
    }
  }, [navigate])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
    setSelected(1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
    setSelected(1)
  }
  const goToday = () => {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setSelected(today.getDate())
  }

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()
  const cells           = buildCells(viewYear, viewMonth)
  const selectedObj     = new Date(viewYear, viewMonth, selected)
  const events          = CALENDAR_EVENTS[dateKey(viewYear, viewMonth, selected)] ?? []

  const monthStats = { work: 0, personal: 0, health: 0, social: 0 }
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    ;(CALENDAR_EVENTS[dateKey(viewYear, viewMonth, d)] ?? [])
      .forEach(e => { if (monthStats[e.category] !== undefined) monthStats[e.category]++ })
  }

  return (
    <div className="cal-page-root">
      <button className="cal-page-back" onClick={() => navigate('/')}>←</button>

      <div className="cal-panel">
        <div className="cal-header">
          <button className="cal-nav" onClick={prevMonth}>‹</button>
          <span className="cal-month-label">
            {MONTHS[viewMonth].toUpperCase()}&nbsp;&nbsp;{viewYear}
          </span>
          <div className="cal-header-right">
            {!isCurrentMonth && (
              <button className="cal-today-btn" onClick={goToday}>Today</button>
            )}
            <button className="cal-nav" onClick={nextMonth}>›</button>
          </div>
        </div>

        <div className="cal-weekdays">
          {WEEKDAYS.map(d => <span key={d} className="cal-weekday">{d}</span>)}
        </div>

        <div className="cal-grid">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="cal-cell cal-cell--empty" />
            const isToday    = isCurrentMonth && day === today.getDate()
            const isSelected = day === selected
            const dayEvents  = CALENDAR_EVENTS[dateKey(viewYear, viewMonth, day)] ?? []
            const cats       = [...new Set(dayEvents.map(e => e.category))]
            return (
              <div
                key={i}
                data-day={day}
                className={[
                  'cal-cell',
                  isToday    ? 'cal-cell--today'    : '',
                  isSelected ? 'cal-cell--selected' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelected(day)}
              >
                <span className="cal-day-num">{day}</span>
                {cats.length > 0 && (
                  <div className="cal-dots">
                    {cats.map(c => <span key={c} className={`cal-dot cal-dot--${c}`} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="cal-stats">
          {Object.entries(monthStats).filter(([, n]) => n > 0).map(([cat, n]) => (
            <span key={cat} className="cal-stat">
              <span className={`cal-stat-dot cal-stat-dot--${cat}`} />
              {CAT_LABEL[cat]}&nbsp;{n}
            </span>
          ))}
        </div>
      </div>

      <div className="schedule-panel">
        <div className="schedule-header">
          <span className="schedule-weekday">{DAY_NAMES[selectedObj.getDay()]}</span>
          <span className="schedule-date-num">{String(selected).padStart(2, '0')}</span>
          <span className="schedule-month-label">{MONTHS[viewMonth]}&nbsp;{viewYear}</span>
        </div>

        <div className="schedule-events">
          {events.length === 0
            ? <span className="schedule-empty">No events</span>
            : events.map((ev, i) => (
              <div key={i} className="schedule-event">
                <div className={`schedule-cat-bar schedule-cat-bar--${ev.category}`} />
                <div className="schedule-event-body">
                  <span className="schedule-time">{ev.time}</span>
                  <span className="schedule-title">{ev.title}</span>
                  <span className={`schedule-badge schedule-badge--${ev.category}`}>
                    {CAT_LABEL[ev.category]}
                  </span>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}
