import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import handState from '../utils/handState'
import '../styles/clock-page.css'

const DAY_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// 선택 가능한 도시 프리셋 (IANA 타임존)
const CITY_PRESETS = [
  { tz: 'Asia/Seoul',        label: 'Seoul'        },
  { tz: 'Asia/Tokyo',        label: 'Tokyo'        },
  { tz: 'Asia/Shanghai',     label: 'Beijing'      },
  { tz: 'Asia/Singapore',    label: 'Singapore'    },
  { tz: 'Asia/Dubai',        label: 'Dubai'        },
  { tz: 'Europe/London',     label: 'London'       },
  { tz: 'Europe/Paris',      label: 'Paris'        },
  { tz: 'Europe/Berlin',     label: 'Berlin'       },
  { tz: 'America/New_York',  label: 'New York'     },
  { tz: 'America/Chicago',   label: 'Chicago'      },
  { tz: 'America/Los_Angeles', label: 'Los Angeles' },
  { tz: 'Australia/Sydney',  label: 'Sydney'       },
]

const CITIES_KEY = 'gw_clock_cities'
const H24_KEY    = 'gw_clock_24h'

function loadCities() {
  try {
    const v = JSON.parse(localStorage.getItem(CITIES_KEY) || 'null')
    if (Array.isArray(v)) return v
  } catch {}
  return ['America/New_York', 'Europe/London', 'Asia/Tokyo']
}

// 특정 타임존의 시/분과 로컬 대비 시차(시간)
function zoneParts(tz, hour12) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12,
  })
  const time = fmt.format(new Date())

  // 로컬 대비 시차 계산
  const now    = new Date()
  const here   = new Date(now.toLocaleString('en-US'))
  const there  = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const diffH  = Math.round((there - here) / 3600000)
  const offset = diffH === 0 ? 'LOCAL' : (diffH > 0 ? `+${diffH}H` : `${diffH}H`)
  return { time, offset }
}

export default function ClockPage() {
  const navigate = useNavigate()
  const [now,    setNow]    = useState(() => new Date(0))
  const [cities, setCities] = useState(loadCities)
  const [h24,    setH24]    = useState(() => localStorage.getItem(H24_KEY) !== '0')
  const [adding, setAdding] = useState('')

  // 1초 틱
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // 제스처: 더블탭 뒤로가기 + 리스트 핀치 스크롤
  useEffect(() => {
    let rafId
    let lastPinchY = null
    function poll() {
      if (handState.back) { handState.back = false; navigate('/'); return }
      const list = document.querySelector('.clk-list')
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

  function persistCities(next) {
    setCities(next)
    try { localStorage.setItem(CITIES_KEY, JSON.stringify(next)) } catch {}
  }
  function addCity() {
    if (!adding || cities.includes(adding)) return
    persistCities([...cities, adding])
    setAdding('')
  }
  function removeCity(tz) {
    persistCities(cities.filter(c => c !== tz))
  }
  function toggle24() {
    const next = !h24
    setH24(next)
    try { localStorage.setItem(H24_KEY, next ? '1' : '0') } catch {}
  }

  const hh   = h24 ? String(now.getHours()).padStart(2,'0')
                   : String(((now.getHours() + 11) % 12) + 1).padStart(2,'0')
  const mm   = String(now.getMinutes()).padStart(2,'0')
  const ss   = String(now.getSeconds()).padStart(2,'0')
  const ampm = now.getHours() < 12 ? 'AM' : 'PM'

  const available = CITY_PRESETS.filter(c => !cities.includes(c.tz))
  const labelOf   = tz => CITY_PRESETS.find(c => c.tz === tz)?.label ?? tz

  return (
    <div className="clk-root">
      <button className="clk-back" onClick={() => navigate('/')}>←</button>

      <div className="clk-header">
        <span className="clk-label">World Clock</span>
        <button className="clk-fmt" onClick={toggle24}>{h24 ? '24H' : '12H'}</button>
      </div>

      <div className="clk-hero">
        <div className="clk-hero-time">
          <span>{hh}</span><span className="clk-colon">:</span>
          <span>{mm}</span><span className="clk-colon">:</span>
          <span className="clk-sec">{ss}</span>
          {!h24 && <span className="clk-ampm">{ampm}</span>}
        </div>
        <span className="clk-hero-date">
          {DAY_LONG[now.getDay()]}, {MONTHS[now.getMonth()]} {String(now.getDate()).padStart(2,'0')} {now.getFullYear()}
        </span>
      </div>

      <div className="clk-list">
        {cities.map(tz => {
          const { time, offset } = zoneParts(tz, !h24)
          return (
            <div key={tz} className="clk-item">
              <span className="clk-city">{labelOf(tz)}</span>
              <span className="clk-offset">{offset}</span>
              <span className="clk-time">{time}</span>
              <button className="clk-del" onClick={() => removeCity(tz)} aria-label="remove">×</button>
            </div>
          )
        })}
      </div>

      <div className="clk-add">
        <select className="clk-select" value={adding} onChange={e => setAdding(e.target.value)}>
          <option value="">Add city…</option>
          {available.map(c => <option key={c.tz} value={c.tz}>{c.label}</option>)}
        </select>
        <button className="clk-add-btn" onClick={addCity} disabled={!adding}>ADD</button>
      </div>
    </div>
  )
}
