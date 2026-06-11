import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDdays, addDday, deleteDday, subscribeDdays, daysUntil } from '../data/ddayStore'
import handState from '../utils/handState'
import '../styles/dday-page.css'

const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// 남은 일수를 D-표기로 변환 (오늘=D-DAY, 미래=D-n, 과거=D+n)
function ddayLabel(days) {
  if (days === 0) return 'D-DAY'
  return days > 0 ? `D-${days}` : `D+${-days}`
}

function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${DAY_SHORT[dt.getDay()]}, ${MONTHS[m - 1]} ${String(d).padStart(2,'0')} ${y}`
}

export default function DdayPage() {
  const navigate    = useNavigate()
  const [, setTick] = useState(0)
  const [title, setTitle] = useState('')
  const [date,  setDate]  = useState('')

  useEffect(() => subscribeDdays(() => setTick(t => t + 1)), [])

  // 자정 경과 시 D-day 갱신 — 60초마다 재계산
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // 제스처: 더블탭 뒤로가기 + 리스트 핀치 스크롤
  useEffect(() => {
    let rafId
    let lastPinchY = null
    function poll() {
      if (handState.back) { handState.back = false; navigate('/'); return }
      const list = document.querySelector('.dday-list')
      if (handState.indexPinchActive) {
        if (lastPinchY !== null && list) {
          const dy = handState.indexPinchMidY - lastPinchY
          if (Math.abs(dy) > 0.0005) list.scrollTop += dy * window.innerHeight * 1.75
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

  const list    = getDdays()
  const primary = list.length ? list[0] : null
  const rest    = list.slice(1)

  function submit(e) {
    e.preventDefault()
    if (!title.trim() || !date) return
    addDday(title, date)
    setTitle('')
    setDate('')
  }

  return (
    <div className="dday-root">
      <button className="dday-back" onClick={() => navigate('/')}>←</button>

      <div className="dday-header">
        <span className="dday-label">D-Day</span>
      </div>

      {primary ? (
        <div className="dday-hero">
          <span className="dday-hero-num">{ddayLabel(daysUntil(primary.date))}</span>
          <span className="dday-hero-title">{primary.title}</span>
          <span className="dday-hero-date">{fmtDate(primary.date)}</span>
          <button className="dday-hero-del" onClick={() => deleteDday(primary.id)} aria-label="delete">×</button>
        </div>
      ) : (
        <div className="dday-hero dday-hero--empty">
          <span className="dday-empty">No D-Day yet</span>
        </div>
      )}

      <div className="dday-list">
        {rest.map(d => {
          const days = daysUntil(d.date)
          return (
            <div key={d.id} className={`dday-item${days < 0 ? ' dday-item--past' : ''}`}>
              <span className="dday-item-num">{ddayLabel(days)}</span>
              <div className="dday-item-mid">
                <span className="dday-item-title">{d.title}</span>
                <span className="dday-item-date">{fmtDate(d.date)}</span>
              </div>
              <button className="dday-del" onClick={() => deleteDday(d.id)} aria-label="delete">×</button>
            </div>
          )
        })}
      </div>

      <form className="dday-form" onSubmit={submit}>
        <input
          className="dday-input dday-input--title"
          type="text"
          placeholder="Title"
          value={title}
          maxLength={40}
          onChange={e => setTitle(e.target.value)}
        />
        <input
          className="dday-input dday-input--date"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
        <button className="dday-add" type="submit">ADD</button>
      </form>
    </div>
  )
}
