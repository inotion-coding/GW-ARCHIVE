import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import handState from '../utils/handState'
import '../styles/weather-page.css'

const WMO_LABEL = {
  0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog',
  51: 'Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
  61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
  71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains',
  80: 'Showers', 81: 'Showers', 82: 'Heavy Showers',
  85: 'Snow Showers', 86: 'Snow Showers',
  95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
}

const WMO_EMOJI = {
  0: '☀️',
  1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌦️', 63: '🌧️', 65: '🌧️',
  71: '❄️', 73: '🌨️', 75: '🌨️', 77: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// pinchMidX: 0=left, 1=right (mirrored)
const RIGHT_PANEL_THRESHOLD = 0.60
const DROP_ZONE_THRESHOLD   = 0.55

async function fetchWeatherData(lat, lon) {
  const [wRes, gRes] = await Promise.all([
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weathercode` +
      `&hourly=temperature_2m,weathercode,precipitation_probability` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max` +
      `&timezone=auto&forecast_days=7`
    ),
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`),
  ])
  const [w, g] = await Promise.all([wRes.json(), gRes.json()])
  const city = g.address?.city || g.address?.town || g.address?.village || g.address?.county || ''
  return { weather: w, city }
}

export default function WeatherPage() {
  const navigate = useNavigate()
  const [weather, setWeather] = useState(null)
  const [city,    setCity]    = useState('')
  const [error,   setError]   = useState(null)

  // drag state
  const [draggingDay,    setDraggingDay]    = useState(null)
  const [dropReady,      setDropReady]      = useState(false)
  const [pinchPos,       setPinchPos]       = useState({ x: 0, y: 0 })
  const [focusedDay,     setFocusedDay]     = useState(null)
  const [hourlyExpanded, setHourlyExpanded] = useState(false)

  const draggingDayRef    = useRef(null)
  const dropReadyRef      = useRef(false)
  const prevPinchRef      = useRef(false)
  const dailyRef          = useRef(null)
  const hourlyScrollRef   = useRef(null)
  const hourlyWrapRef     = useRef(null)
  const lastPinchXRef     = useRef(null)
  const hourlyExpandedRef = useRef(false)
  const zoomMidYRef       = useRef(null)
  const zoomProgressRef   = useRef(0)

  useEffect(() => {
    function load(lat, lon) {
      fetchWeatherData(lat, lon)
        .then(({ weather: w, city: c }) => { setWeather(w); setCity(c) })
        .catch(() => setError('Unable to load weather data.'))
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => load(pos.coords.latitude, pos.coords.longitude),
        ()  => load(37.5665, 126.9780)
      )
    } else {
      load(37.5665, 126.9780)
    }
  }, [])

  useEffect(() => {
    let rafId
    function poll() {
      if (handState.back) { handState.back = false; navigate('/') }

      const px     = handState.indexPinchMidX
      const py     = handState.indexPinchMidY
      const active = handState.indexPinchActive

      if (active) {
        // 시간별 예보 가로 스크롤 (정확히 hourly 영역 위에서만)
        if (draggingDayRef.current === null && hourlyScrollRef.current) {
          if (hourlyExpandedRef.current) {
            // 확장 모드: 엄지+검지 수직 스크롤 (어디서든)
            if (lastPinchXRef.current !== null) {
              const dy = py - lastPinchXRef.current
              if (Math.abs(dy) > 0.0003) {
                hourlyScrollRef.current.scrollTop += dy * window.innerHeight * 2.2
              }
            }
            lastPinchXRef.current = py
          } else {
            // 일반 모드: 수평 스크롤 (hourly 위에서만)
            const hr = hourlyScrollRef.current.getBoundingClientRect()
            const pxPixel = px * window.innerWidth
            const pyPixel = py * window.innerHeight
            if (pxPixel >= hr.left && pxPixel <= hr.right &&
                pyPixel >= hr.top  && pyPixel <= hr.bottom) {
              if (lastPinchXRef.current !== null) {
                const dx = px - lastPinchXRef.current
                if (Math.abs(dx) > 0.0003) {
                  hourlyScrollRef.current.scrollLeft -= dx * window.innerWidth * 2.5
                }
              }
              lastPinchXRef.current = px
            } else {
              lastPinchXRef.current = null
            }
          }
        }

        // 오른쪽 패널에서 날짜 잡기 (박스 전체 영역 정확히 히트 테스트)
        if (draggingDayRef.current === null) {
          const dayEls = dailyRef.current?.querySelectorAll('.weather-day')
          if (dayEls && dayEls.length > 0) {
            const pxPixel = px * window.innerWidth
            const pyPixel = py * window.innerHeight
            for (let i = 0; i < dayEls.length; i++) {
              const rect = dayEls[i].getBoundingClientRect()
              if (pxPixel >= rect.left && pxPixel <= rect.right &&
                  pyPixel >= rect.top  && pyPixel <= rect.bottom) {
                draggingDayRef.current = i
                setDraggingDay(i)
                break
              }
            }
          }
        }

        if (draggingDayRef.current !== null) {
          const inDrop = px < DROP_ZONE_THRESHOLD
          if (inDrop !== dropReadyRef.current) {
            dropReadyRef.current = inDrop
            setDropReady(inDrop)
          }
          setPinchPos({ x: px * window.innerWidth, y: py * window.innerHeight })
        }
        prevPinchRef.current = true

      } else {
        if (prevPinchRef.current && draggingDayRef.current !== null) {
          // 핀치 해제 → 드롭
          if (dropReadyRef.current) {
            setFocusedDay(draggingDayRef.current === 0 ? null : draggingDayRef.current)
          }
          draggingDayRef.current = null
          dropReadyRef.current   = false
          setDraggingDay(null)
          setDropReady(false)
        }
        lastPinchXRef.current = null
        prevPinchRef.current  = false
      }

      // 양손 엄지+검지 핀치: 위로(hourly 위에서만) → 확장, 아래로(어디서든) → 축소
      if (handState.bothZoomActive) {
        const zy = handState.zoomMidY
        if (zoomMidYRef.current !== null) {
          const dy = zy - zoomMidYRef.current
          if (Math.abs(dy) > 0.003) {
            if (!hourlyExpandedRef.current && dy < 0) {
              const hr = hourlyWrapRef.current?.getBoundingClientRect()
              const pyPx = zy * window.innerHeight
              if (hr && pyPx >= hr.top - 40 && pyPx <= hr.bottom + 40) {
                zoomProgressRef.current -= dy
                if (zoomProgressRef.current > 0.10) {
                  hourlyExpandedRef.current = true
                  setHourlyExpanded(true)
                  zoomProgressRef.current = 0
                  lastPinchXRef.current = null
                }
              }
            } else if (hourlyExpandedRef.current && dy > 0) {
              zoomProgressRef.current += dy
              if (zoomProgressRef.current > 0.08) {
                hourlyExpandedRef.current = false
                setHourlyExpanded(false)
                zoomProgressRef.current = 0
                lastPinchXRef.current = null
              }
            }
          }
        }
        zoomMidYRef.current = zy
      } else {
        zoomMidYRef.current     = null
        zoomProgressRef.current = 0
      }

      rafId = requestAnimationFrame(poll)
    }
    rafId = requestAnimationFrame(poll)
    return () => { cancelAnimationFrame(rafId); handState.back = false }
  }, [navigate])

  const cur    = weather?.current
  const hourly = weather?.hourly
  const daily  = weather?.daily

  const _now = new Date()
  const _p   = n => String(n).padStart(2, '0')
  const nowLocal = `${_now.getFullYear()}-${_p(_now.getMonth()+1)}-${_p(_now.getDate())}T${_p(_now.getHours())}`
  const hourIdx = hourly
    ? Math.max(0, hourly.time.findIndex(t => t.slice(0, 13) >= nowLocal))
    : 0

  // 선택된 날짜의 시간별 데이터
  const focusedDate  = focusedDay !== null && daily ? daily.time[focusedDay] : null
  const displayHours = focusedDate && hourly
    ? hourly.time.reduce((acc, t, i) => { if (t.startsWith(focusedDate)) acc.push(i); return acc }, []).slice(0, 24)
    : hourly ? Array.from({ length: 24 }, (_, k) => hourIdx + k).filter(i => i < hourly.time.length) : []

  // 7일 온도 범위
  const weekMin   = daily ? Math.min(...daily.temperature_2m_min) : 0
  const weekMax   = daily ? Math.max(...daily.temperature_2m_max) : 1
  const weekRange = weekMax - weekMin || 1

  // 히어로 값
  const isCurrentDay = focusedDay === null
  const heroCode  = isCurrentDay ? cur?.weathercode : daily?.weathercode[focusedDay]
  const heroTemp  = isCurrentDay
    ? (cur ? Math.round(cur.temperature_2m) : null)
    : (daily ? Math.round(daily.temperature_2m_max[focusedDay]) : null)
  const heroCond  = WMO_LABEL[heroCode] ?? ''
  const heroD     = focusedDay !== null && daily ? new Date(daily.time[focusedDay] + 'T12:00:00') : null
  const heroDay   = heroD ? DAYS[heroD.getDay()] : null

  return (
    <div className="weather-root">
      <button className="weather-back" onClick={() => navigate('/')}>←</button>

      {error ? (
        <p className="weather-status">{error}</p>
      ) : !cur ? (
        <p className="weather-status">Loading…</p>
      ) : (
        <>
          {/* ── 좌 패널 ── */}
          <div className={[
            'weather-main',
            dropReady      ? 'weather-main--drop'     : '',
            hourlyExpanded ? 'weather-main--expanded'  : '',
          ].filter(Boolean).join(' ')}>
            <div className="weather-header">
              <span className="weather-label">
                {!isCurrentDay ? heroDay : 'Weather'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {!isCurrentDay && (
                  <button className="weather-reset-btn" onClick={() => setFocusedDay(null)}>
                    Today ↩
                  </button>
                )}
                {city && <span className="weather-city">{city}</span>}
              </div>
            </div>

            <div className="weather-hero-group">
            <div className="weather-hero">
              <span className="weather-emoji">
                {WMO_EMOJI[heroCode] ?? '—'}
              </span>
              <div className="weather-hero-right">
                <div className="weather-temp-row">
                  <span className="weather-temp">{heroTemp}</span>
                  <span className="weather-unit">°C</span>
                </div>
                <span className="weather-condition">{heroCond}</span>
              </div>
            </div>

            <div className="weather-stats">
              {isCurrentDay ? (
                <>
                  <span>Feels {Math.round(cur.apparent_temperature)}°</span>
                  <span className="weather-sep">·</span>
                  <span>Humidity {cur.relative_humidity_2m}%</span>
                  <span className="weather-sep">·</span>
                  <span>Wind {Math.round(cur.wind_speed_10m)} km/h</span>
                </>
              ) : (
                <>
                  <span>Hi {Math.round(daily.temperature_2m_max[focusedDay])}°</span>
                  <span className="weather-sep">/</span>
                  <span>Lo {Math.round(daily.temperature_2m_min[focusedDay])}°</span>
                  {(daily.precipitation_probability_max?.[focusedDay] ?? 0) > 0 && (
                    <>
                      <span className="weather-sep">·</span>
                      <span className="weather-prec-accent">
                        {daily.precipitation_probability_max[focusedDay]}% rain
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
            </div>

            <div className="weather-hourly-wrap" ref={hourlyWrapRef}>
              <span className="weather-section-label">
                {isCurrentDay ? 'Hourly' : `${heroDay} — Hourly`}
              </span>
              <div className="weather-hourly" ref={hourlyScrollRef}>
                {displayHours.map((i, k) => {
                  const h    = new Date(hourly.time[i]).getHours()
                  const prec = hourly.precipitation_probability?.[i] ?? 0
                  const isNow = isCurrentDay && k === 0
                  return (
                    <div key={i} className={`weather-hour${isNow ? ' weather-hour--now' : ''}`}>
                      <span className="weather-hour-time">
                        {isNow ? 'Now' : `${String(h).padStart(2, '0')}:00`}
                      </span>
                      <span className="weather-hour-icon">
                        {WMO_EMOJI[hourly.weathercode[i]] ?? '—'}
                      </span>
                      <span className="weather-hour-temp">
                        {Math.round(hourly.temperature_2m[i])}°
                      </span>
                      {prec > 0 && (
                        <span className="weather-hour-prec">{prec}%</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── 우 패널: 7일 예보 ── */}
          <div className="weather-panel">
            <span className="weather-section-label">7-Day Forecast</span>
            <div className="weather-daily" ref={dailyRef}>
              {daily.time.map((date, i) => {
                const d        = new Date(date + 'T12:00:00')
                const lo       = daily.temperature_2m_min[i]
                const hi       = daily.temperature_2m_max[i]
                const prec     = daily.precipitation_probability_max?.[i] ?? 0
                const loRatio  = (lo - weekMin) / weekRange
                const hiRatio  = (hi - weekMin) / weekRange
                const isToday  = i === 0
                const isDragging = i === draggingDay
                const isFocused  = focusedDay === null ? i === 0 : i === focusedDay
                return (
                  <div
                    key={date}
                    className={[
                      'weather-day',
                      isToday    ? 'weather-day--today'    : '',
                      isDragging ? 'weather-day--dragging' : '',
                      isFocused  ? 'weather-day--focused'  : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <span className="weather-day-name">
                      {DAYS[d.getDay()]}
                    </span>
                    <span className="weather-day-icon">
                      {WMO_EMOJI[daily.weathercode[i]] ?? '—'}
                    </span>
                    <div className="weather-day-bar-wrap">
                      <div className="weather-day-bar">
                        <div
                          className="weather-day-bar-fill"
                          style={{ left: `${loRatio * 100}%`, width: `${(hiRatio - loRatio) * 100}%` }}
                        />
                      </div>
                      {prec > 0 && (
                        <span className="weather-day-prec">{prec}%</span>
                      )}
                    </div>
                    <div className="weather-day-range">
                      <span className="weather-day-hi">{Math.round(hi)}°</span>
                      <span className="weather-day-slash">/</span>
                      <span className="weather-day-lo">{Math.round(lo)}°</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── 드래그 고스트 카드 ── */}
          {draggingDay !== null && daily && (
            <div
              className={`weather-drag-ghost${dropReady ? ' weather-drag-ghost--drop' : ''}`}
              style={{ left: pinchPos.x, top: pinchPos.y }}
            >
              <span className="weather-drag-ghost-icon">
                {WMO_EMOJI[daily.weathercode[draggingDay]] ?? '—'}
              </span>
              <span className="weather-drag-ghost-name">
                {draggingDay === 0
                  ? 'Today'
                  : DAYS[new Date(daily.time[draggingDay] + 'T12:00').getDay()]}
              </span>
              <span className="weather-drag-ghost-temp">
                {Math.round(daily.temperature_2m_max[draggingDay])}°
                <span style={{ opacity: 0.45 }}>
                  {' / '}{Math.round(daily.temperature_2m_min[draggingDay])}°
                </span>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
