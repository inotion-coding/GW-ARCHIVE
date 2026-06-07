import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import handState from '../utils/handState'
import '../styles/timer-page.css'

const PRESETS = [
  { label: '1m',  seconds: 60  },
  { label: '3m',  seconds: 180 },
  { label: '5m',  seconds: 300 },
  { label: '10m', seconds: 600 },
]

function beep() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)()
    const times = [0, 0.42, 0.84]
    times.forEach(t => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type           = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.35, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.32)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.33)
    })
  } catch (_) {}
}

const R    = 115
const CIRC = 2 * Math.PI * R

export default function TimerPage() {
  const navigate    = useNavigate()
  const beepFired   = useRef(false)
  const hoveredRef  = useRef(null)   // 검지가 현재 가리키는 버튼 요소
  const [total,     setTotal]     = useState(300)
  const [remaining, setRemaining] = useState(300)
  const [running,   setRunning]   = useState(false)
  const [finished,  setFinished]  = useState(false)

  // 검지 제스처 통합 RAF 루프 — hover 추적 + tap 클릭 + 뒤로가기
  useEffect(() => {
    let rafId
    function poll() {
      // 엄지+검지 더블탭 → 홈 복귀
      if (handState.back) { handState.back = false; navigate('/'); return }

      const W = window.innerWidth
      const H = window.innerHeight

      // 검지 hover 추적
      const fx = handState.fingerX
      const btn = fx >= 0
        ? document.elementFromPoint(fx * W, handState.fingerY * H)?.closest?.('button')
        : null

      if (btn !== hoveredRef.current) {
        hoveredRef.current?.classList.remove('finger-hover')
        btn?.classList.add('finger-hover')
        hoveredRef.current = btn ?? null
      }

      // 검지 탭 → 버튼 클릭
      if (handState.click) {
        handState.click = false
        const x = handState.clickX * W
        const y = handState.clickY * H
        document.elementFromPoint(x, y)?.closest?.('button')?.click()
      }

      rafId = requestAnimationFrame(poll)
    }
    rafId = requestAnimationFrame(poll)
    return () => {
      cancelAnimationFrame(rafId)
      hoveredRef.current?.classList.remove('finger-hover')
      hoveredRef.current = null
      handState.back = false
    }
  }, [navigate])

  // 카운트다운 — setTimeout 체인으로 stale closure 없이 정확하게 동작
  useEffect(() => {
    if (!running || remaining <= 0) return
    const id = setTimeout(() => {
      const next = remaining - 1
      setRemaining(next)
      if (next <= 0) {
        setRunning(false)
        setFinished(true)
        if (!beepFired.current) { beepFired.current = true; beep() }
      }
    }, 1000)
    return () => clearTimeout(id)
  }, [running, remaining])

  const selectPreset = useCallback((seconds) => {
    setTotal(seconds)
    setRemaining(seconds)
    setRunning(false)
    setFinished(false)
    beepFired.current = false
  }, [])

  const toggle = useCallback(() => {
    if (finished || remaining === 0) return
    setRunning(r => !r)
  }, [finished, remaining])

  const reset = useCallback(() => {
    setRunning(false)
    setFinished(false)
    setRemaining(total)
    beepFired.current = false
  }, [total])

  const mm       = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss       = String(remaining % 60).padStart(2, '0')
  const progress = total > 0 ? remaining / total : 0
  const dash     = CIRC * progress
  const gap      = CIRC * (1 - progress)

  return (
    <div className="timer-page">
      <button className="motion-back" onClick={() => navigate('/')}>← Back</button>

      <h1 className="motion-title">Timer</h1>

      <div className="timer-ring-wrap">
        <svg viewBox="0 0 280 280" width="280" height="280" aria-hidden>
          <circle cx="140" cy="140" r={R}
            fill="none" stroke="var(--border)" strokeWidth="1.5" opacity="0.18" />
          <circle cx="140" cy="140" r={R}
            fill="none"
            stroke="var(--text)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={`${dash.toFixed(2)} ${gap.toFixed(2)}`}
            transform="rotate(-90 140 140)"
            style={{ transition: 'stroke-dasharray 0.85s linear', opacity: finished ? 0.2 : 0.72 }}
          />
        </svg>
        <div className={`timer-display${running ? ' timer-running' : ''}${finished ? ' timer-finished' : ''}`}>
          <span>{mm}</span>
          <span className="timer-colon">:</span>
          <span>{ss}</span>
        </div>
      </div>

      <div className="timer-presets">
        {PRESETS.map(p => (
          <button
            key={p.label}
            className={`timer-preset${total === p.seconds ? ' active' : ''}`}
            onClick={() => selectPreset(p.seconds)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="timer-controls">
        <button
          className="timer-btn timer-btn--main"
          onClick={toggle}
          disabled={finished || remaining === 0}
        >
          {running ? 'PAUSE' : 'START'}
        </button>
        <button className="timer-btn timer-btn--reset" onClick={reset}>
          RESET
        </button>
      </div>

      {finished && <p className="timer-done">TIME'S UP</p>}
    </div>
  )
}
