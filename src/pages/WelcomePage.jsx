import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import handState from '../utils/handState'
import '../styles/welcome-page.css'

// 제스처 튜토리얼 항목 — GESTURE.md 명세 기반
const GESTURES = [
  {
    icon: 'unlock',
    title: '손 활성화 / 잠금',
    mechanic: 'FIST · HOLD 0.5s',
    desc: '손바닥을 카메라로 향한 채 주먹을 쥐고 약 0.5초 유지하면 해당 손이 활성화됩니다. 한 번 더 하면 다시 잠깁니다.',
  },
  {
    icon: 'pinch',
    title: '카드 넘기기',
    mechanic: 'THUMB + MIDDLE',
    desc: '엄지와 중지를 맞붙여(핀치) 좌우로 움직이면 카드가 따라 넘어가고, 손을 떼면 가장 가까운 카드로 스냅됩니다.',
  },
  {
    icon: 'roll',
    title: '빠르게 스크롤',
    mechanic: 'PALM ROLL',
    desc: '손바닥을 보인 채 손목을 좌우로 굴리면(roll) 한 번에 여러 장이 관성으로 연속 이동합니다.',
  },
  {
    icon: 'tap',
    title: '카드 열기',
    mechanic: 'INDEX TAP',
    desc: '검지만 펴고 원하는 카드를 향해 아래로 톡 내리찍으면 해당 카드의 상세 화면이 열립니다.',
  },
  {
    icon: 'back',
    title: '뒤로 가기',
    mechanic: 'THUMB + MIDDLE · DOUBLE TAP',
    desc: '엄지+중지를 빠르게 두 번 탭하면 이전 화면으로 돌아갑니다.',
  },
  {
    icon: 'zoom',
    title: '확대 / 축소',
    mechanic: 'BOTH HANDS PINCH',
    desc: '양손 엄지+검지를 핀치한 뒤 손 간격을 벌리거나 좁히면 카드가 확대·축소됩니다.',
  },
  {
    icon: 'dismiss',
    title: '카드 밀어 치우기',
    mechanic: 'THREE-FINGER PINCH',
    desc: '엄지+검지+중지 세 손가락을 모아 바깥으로 밀면 카드 영역이 옆으로 사라집니다. 반대로 밀면 복귀합니다.',
  },
  {
    icon: 'calendar',
    title: '캘린더 날짜 선택',
    mechanic: 'THUMB + INDEX',
    desc: '캘린더 화면에서 엄지+검지를 핀치해 원하는 날짜 칸을 집으면 그 날짜가 선택됩니다.',
  },
]

function GestureIcon({ name }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (name) {
    case 'unlock':
      return <svg viewBox="0 0 24 24" {...p}><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 7-2.6" /></svg>
    case 'pinch':
      return <svg viewBox="0 0 24 24" {...p}><circle cx="8" cy="12" r="2.5" /><circle cx="16" cy="12" r="2.5" /><path d="M3 12h2M19 12h2" /></svg>
    case 'roll':
      return <svg viewBox="0 0 24 24" {...p}><path d="M5 12a7 7 0 1 1 2 4.9" /><path d="M5 12v-3M5 12h3" /></svg>
    case 'tap':
      return <svg viewBox="0 0 24 24" {...p}><path d="M12 3v9" /><path d="M8.5 8.5 12 12l3.5-3.5" /><circle cx="12" cy="18" r="2.5" /></svg>
    case 'back':
      return <svg viewBox="0 0 24 24" {...p}><path d="M13 7l-5 5 5 5" /><path d="M19 7l-5 5 5 5" /></svg>
    case 'zoom':
      return <svg viewBox="0 0 24 24" {...p}><path d="M4 10V4h6" /><path d="M4 4l6 6" /><path d="M20 14v6h-6" /><path d="M20 20l-6-6" /></svg>
    case 'dismiss':
      return <svg viewBox="0 0 24 24" {...p}><circle cx="6" cy="8" r="1.1" /><circle cx="6" cy="12" r="1.1" /><circle cx="6" cy="16" r="1.1" /><path d="M10 12h9M15 8l4 4-4 4" /></svg>
    case 'calendar':
      return <svg viewBox="0 0 24 24" {...p}><rect x="4" y="5" width="16" height="15" rx="1.5" /><path d="M4 9h16M8 3v4M16 3v4" /><rect x="14" y="13" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" /></svg>
    default:
      return null
  }
}

export default function WelcomePage() {
  const navigate = useNavigate()

  // 제스처: 더블탭 뒤로가기 + 핀치 스크롤
  useEffect(() => {
    let rafId
    let lastPinchY = null
    function poll() {
      if (handState.back) { handState.back = false; navigate('/'); return }
      const scroll = document.querySelector('.wel-scroll')
      if (handState.indexPinchActive) {
        if (lastPinchY !== null && scroll) {
          const dy = handState.indexPinchMidY - lastPinchY
          if (Math.abs(dy) > 0.0005) scroll.scrollTop += dy * window.innerHeight * 1.75
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
    <div className="wel-root">
      <button className="wel-back" onClick={() => navigate('/')}>←</button>

      <div className="wel-scroll">
        {/* ── 소개 ── */}
        <section className="wel-about">
          <span className="wel-eyebrow">Welcome</span>
          <h1 className="wel-title">GW ARCHIVE</h1>
          <p className="wel-tagline">손동작으로 넘기는 개인 아카이브 대시보드</p>
          <p className="wel-desc">
            카메라가 손을 인식해 마우스·터치 없이 조작합니다. 카드를 좌우로 넘기고,
            검지로 톡 눌러 일정·캘린더·날씨·세계시계·D-Day·문서 등을 열어보세요.
            아래 제스처를 익히면 모든 화면을 손으로 다룰 수 있습니다.
          </p>
        </section>

        {/* ── 제스처 튜토리얼 ── */}
        <section className="wel-section">
          <span className="wel-section-label">Gestures</span>
          <div className="wel-grid">
            {GESTURES.map((g, i) => (
              <div key={g.icon} className="wel-card">
                <div className="wel-card-head">
                  <span className="wel-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="wel-icon"><GestureIcon name={g.icon} /></span>
                </div>
                <span className="wel-card-title">{g.title}</span>
                <span className="wel-card-mech">{g.mechanic}</span>
                <p className="wel-card-desc">{g.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="wel-foot">
          손이 인식되지 않으면 손바닥을 카메라로 향한 채 주먹을 쥐어 활성화하세요.
          60초간 움직임이 없으면 자동으로 잠깁니다.
        </p>
      </div>
    </div>
  )
}
