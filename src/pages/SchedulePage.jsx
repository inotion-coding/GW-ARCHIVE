import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllEvents, subscribeEvents } from '../data/calendarEvents'
import handState from '../utils/handState'
import '../styles/schedule-page.css'

const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const CAT_LABEL = { work: 'Work', personal: 'Personal', health: 'Health', social: 'Social' }

function getUpcoming(days = 60) {
  const today  = new Date()
  today.setHours(0, 0, 0, 0)
  const result = []

  for (let i = 0; i < days; i++) {
    const d   = new Date(today)
    d.setDate(today.getDate() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const evs = getAllEvents(key)
    if (evs.length) result.push({ date: d, key, events: evs })
  }
  return result
}

export default function SchedulePage() {
  const navigate   = useNavigate()
  const today      = new Date()
  today.setHours(0, 0, 0, 0)
  const [, setTick] = useState(0)
  useEffect(() => subscribeEvents(() => setTick(t => t + 1)), [])
  const upcoming   = getUpcoming(60)
  const events14   = getUpcoming(14).reduce((s, g) => s + g.events.length, 0)

  useEffect(() => {
    let rafId
    let lastPinchY = null
    const list = document.querySelector('.sch-list')

    function poll() {
      if (handState.back) { handState.back = false; navigate('/'); return }

      if (handState.indexPinchActive) {
        if (lastPinchY !== null) {
          const dy = handState.indexPinchMidY - lastPinchY
          if (list && Math.abs(dy) > 0.0005) {
            list.scrollTop += dy * window.innerHeight * 1.75
          }
        }
        lastPinchY = handState.indexPinchMidY
      } else {
        lastPinchY = null
      }

      rafId = requestAnimationFrame(poll)
    }
    rafId = requestAnimationFrame(poll)
    return () => { cancelAnimationFrame(rafId); handState.back = false }
  }, [navigate])

  return (
    <div className="sch-root">
      <button className="sch-back" onClick={() => navigate('/')}>←</button>

      <div className="sch-header">
        <div className="sch-header-left">
          <span className="sch-label">Schedule</span>
          <span className="sch-today">
            {DAY_SHORT[today.getDay()]},&nbsp;
            {MONTHS[today.getMonth()]}&nbsp;
            {today.getDate()}&nbsp;
            {today.getFullYear()}
          </span>
        </div>
        <div className="sch-stats">
          <div className="sch-stat">
            <span className="sch-stat-num">{events14}</span>
            <span className="sch-stat-label">in 14 days</span>
          </div>
        </div>
      </div>

      <div className="sch-list">
        {upcoming.length === 0
          ? <span className="sch-empty">No upcoming events</span>
          : upcoming.map(({ date, events }) => {
            const isToday = date.getTime() === today.getTime()
            return (
              <div key={date.toISOString()} className="sch-group">
                <div className={`sch-date-col${isToday ? ' sch-date-col--today' : ''}`}>
                  <span className="sch-date-day">{DAY_SHORT[date.getDay()]}</span>
                  <span className="sch-date-num">{String(date.getDate()).padStart(2,'0')}</span>
                  <span className="sch-date-mon">{MONTHS[date.getMonth()]}</span>
                  {isToday && <span className="sch-today-tag">Today</span>}
                </div>
                <div className="sch-events">
                  {events.map((ev, i) => (
                    <div key={i} className="sch-event">
                      <div className={`sch-cat-bar sch-cat-bar--${ev.category}`} />
                      <span className="sch-time">{ev.time}</span>
                      <span className="sch-title">{ev.title}</span>
                      <span className={`sch-badge sch-badge--${ev.category}`}>
                        {CAT_LABEL[ev.category]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        }
      </div>
    </div>
  )
}
