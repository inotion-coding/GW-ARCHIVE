import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllEvents, addEvent, subscribeEvents, moveEvent, deleteEvent } from '../data/calendarEvents'
import handState from '../utils/handState'
import '../styles/calendar-view.css'
import '../styles/calendar-page.css'

const WEEKDAYS  = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS    = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December']
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const CAT_LABEL  = { work: 'Work', personal: 'Personal', health: 'Health', social: 'Social' }
const CAT_COLORS = { work: '#5b8dee', personal: '#e07b54', health: '#5bbf8d', social: '#b07be0' }
const CATS       = ['work', 'personal', 'health', 'social']

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

  const [viewYear,    setViewYear]    = useState(today.getFullYear())
  const [viewMonth,   setViewMonth]   = useState(today.getMonth())
  const [selected,    setSelected]    = useState(today.getDate())
  const [, setTick]                   = useState(0)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formHour,    setFormHour]    = useState(9)
  const [formMin,     setFormMin]     = useState(0)
  const [formTitle,   setFormTitle]   = useState('')
  const [formCat,     setFormCat]     = useState('work')
  const selectedRef  = useRef(selected)
  const viewYearRef  = useRef(viewYear)
  const viewMonthRef = useRef(viewMonth)
  selectedRef.current  = selected
  viewYearRef.current  = viewYear
  viewMonthRef.current = viewMonth

  useEffect(() => subscribeEvents(() => setTick(t => t + 1)), [])

  useEffect(() => {
    let rafId
    let wasIndexPinch   = false
    let hoveredCell     = null
    let isDragging      = false
    let dragFromKey     = null
    let dragEventIdx    = -1
    let dragEventData   = null
    let dragHoveredCell = null
    let dragOverDelete  = false

    function applyHover(cell) {
      if (cell === hoveredCell) return
      hoveredCell?.classList.remove('cal-cell--pinch-hover')
      cell?.classList.add('cal-cell--pinch-hover')
      hoveredCell = cell ?? null
    }

    function applyDragHover(cell) {
      if (cell === dragHoveredCell) return
      dragHoveredCell?.classList.remove('cal-cell--drag-hover')
      cell?.classList.add('cal-cell--drag-hover')
      dragHoveredCell = cell ?? null
    }

    function applyDeleteHover(active) {
      document.querySelector('[data-delete-zone]')
        ?.classList.toggle('schedule-delete-zone--active', active)
    }

    function clearDragZone() {
      document.querySelector('[data-delete-zone]')
        ?.classList.remove('schedule-delete-zone--dragging', 'schedule-delete-zone--active')
    }

    function poll() {
      if (handState.back) { handState.back = false; navigate('/'); return }

      const idxPinch = handState.indexPinchActive
      const px = handState.indexPinchMidX * window.innerWidth
      const py = handState.indexPinchMidY * window.innerHeight

      if (!wasIndexPinch && idxPinch) {
        const el      = document.elementFromPoint(px, py)
        const eventEl = el?.closest?.('[data-event-idx]')
        if (eventEl) {
          isDragging   = true
          dragEventIdx = Number(eventEl.dataset.eventIdx)
          dragFromKey  = dateKey(viewYearRef.current, viewMonthRef.current, selectedRef.current)
          const evs    = getAllEvents(dragFromKey)
          dragEventData = evs[dragEventIdx] ?? null
          if (dragEventData) {
            eventEl.classList.add('schedule-event--dragging')
            handState.indexPinchColor = CAT_COLORS[dragEventData.category] ?? null
            document.querySelector('[data-delete-zone]')?.classList.add('schedule-delete-zone--dragging')
          }
        } else {
          isDragging = false
          const cell = el?.closest?.('[data-day]')
          if (cell?.dataset?.day) setSelected(Number(cell.dataset.day))
          applyHover(cell)
        }
      }

      if (idxPinch) {
        if (isDragging) {
          const el       = document.elementFromPoint(px, py)
          const inDelete = !!el?.closest?.('[data-delete-zone]')
          applyHover(null)
          applyDragHover(inDelete ? null : (el?.closest?.('[data-day]') ?? null))
          if (inDelete !== dragOverDelete) {
            dragOverDelete = inDelete
            applyDeleteHover(inDelete)
          }
        } else {
          const el = document.elementFromPoint(px, py)
          applyHover(el?.closest?.('[data-day]') ?? null)
        }
      } else {
        applyHover(null)
        if (wasIndexPinch && isDragging) {
          const dropCell = dragHoveredCell
          applyDragHover(null)
          applyDeleteHover(false)
          clearDragZone()
          document.querySelectorAll('.schedule-event--dragging')
            .forEach(el => el.classList.remove('schedule-event--dragging'))
          handState.indexPinchColor = null

          if (dragOverDelete && dragEventData) {
            deleteEvent(dragFromKey, dragEventIdx)
          } else if (dropCell?.dataset?.day && dragEventData) {
            const targetDay = Number(dropCell.dataset.day)
            const toKey = dateKey(viewYearRef.current, viewMonthRef.current, targetDay)
            if (toKey !== dragFromKey) moveEvent(dragFromKey, dragEventIdx, toKey)
          }

          isDragging     = false
          dragEventIdx   = -1
          dragFromKey    = null
          dragEventData  = null
          dragOverDelete = false
        }
      }

      wasIndexPinch = idxPinch
      rafId = requestAnimationFrame(poll)
    }

    rafId = requestAnimationFrame(poll)
    return () => {
      cancelAnimationFrame(rafId)
      handState.back = false
      handState.indexPinchColor = null
      hoveredCell?.classList.remove('cal-cell--pinch-hover')
      dragHoveredCell?.classList.remove('cal-cell--drag-hover')
      document.querySelectorAll('.schedule-event--dragging')
        .forEach(el => el.classList.remove('schedule-event--dragging'))
      clearDragZone()
    }
  }, [navigate])

  function resetForm() {
    setShowAddForm(false)
    setFormHour(9)
    setFormMin(0)
    setFormTitle('')
    setFormCat('work')
  }

  function handleAddEvent(e) {
    e.preventDefault()
    if (!formTitle.trim()) return
    const time = `${String(formHour).padStart(2,'0')}:${String(formMin).padStart(2,'0')}`
    addEvent(dateKey(viewYear, viewMonth, selected), {
      time,
      title:    formTitle.trim(),
      category: formCat,
    })
    resetForm()
  }

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
  const events          = getAllEvents(dateKey(viewYear, viewMonth, selected))

  const monthStats  = { work: 0, personal: 0, health: 0, social: 0 }
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    getAllEvents(dateKey(viewYear, viewMonth, d))
      .forEach(e => { if (monthStats[e.category] !== undefined) monthStats[e.category]++ })
  }

  return (
    <>
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
            const dayEvents  = getAllEvents(dateKey(viewYear, viewMonth, day))
            const dots       = dayEvents.slice(0, 5)
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
                {dots.length > 0 && (
                  <div className="cal-dots">
                    {dots.map((ev, di) => <span key={di} className={`cal-dot cal-dot--${ev.category}`} />)}
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
          {events.map((ev, i) => (
            <div key={i} className="schedule-event" data-event-idx={i}>
              <div className={`schedule-cat-bar schedule-cat-bar--${ev.category}`} />
              <div className="schedule-event-body">
                <span className="schedule-time">{ev.time}</span>
                <span className="schedule-title">{ev.title}</span>
                <span className={`schedule-badge schedule-badge--${ev.category}`}>
                  {CAT_LABEL[ev.category]}
                </span>
              </div>
            </div>
          ))}

          <div className="schedule-add-row" onClick={() => setShowAddForm(true)}>+</div>
        </div>

        <div className="schedule-delete-zone" data-delete-zone="">
          × Delete
        </div>
      </div>
    </div>

    {showAddForm && (
      <div className="add-modal-overlay" onClick={e => { if (e.target === e.currentTarget) resetForm() }}>
        <form className="add-modal" onSubmit={handleAddEvent}>
          <div className="add-modal-header">
            <span className="add-modal-date">
              {DAY_NAMES[selectedObj.getDay()]}&nbsp;·&nbsp;{MONTHS[viewMonth]}&nbsp;{selected}
            </span>
            <button type="button" className="add-modal-close" onClick={resetForm}>×</button>
          </div>

          <div className="add-modal-cats">
            {CATS.map(cat => (
              <button
                key={cat}
                type="button"
                className={`add-modal-cat-btn${formCat === cat ? ' add-modal-cat-btn--active' : ''}`}
                onClick={() => setFormCat(cat)}
              >
                <span className="add-modal-cat-dot" style={{ background: CAT_COLORS[cat] }} />
                {CAT_LABEL[cat]}
              </button>
            ))}
          </div>

          <input
            className="add-modal-title-input"
            type="text"
            placeholder="Event name"
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
            autoFocus
            onKeyDown={e => e.key === 'Escape' && resetForm()}
          />

          <div className="add-time-picker">
            <div className="add-time-col">
              <button type="button" className="add-time-btn" onClick={() => setFormHour(h => (h + 1) % 24)}>▲</button>
              <span className="add-time-val">{String(formHour).padStart(2,'0')}</span>
              <button type="button" className="add-time-btn" onClick={() => setFormHour(h => (h - 1 + 24) % 24)}>▼</button>
            </div>
            <span className="add-time-sep">:</span>
            <div className="add-time-col">
              <button type="button" className="add-time-btn" onClick={() => setFormMin(m => (m + 5) % 60)}>▲</button>
              <span className="add-time-val">{String(formMin).padStart(2,'0')}</span>
              <button type="button" className="add-time-btn" onClick={() => setFormMin(m => (m - 5 + 60) % 60)}>▼</button>
            </div>
          </div>

          <button type="submit" className="add-modal-submit">Add event</button>
        </form>
      </div>
    )}
    </>
  )
}
