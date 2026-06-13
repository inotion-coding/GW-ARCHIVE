import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import handState from '../utils/handState'
import { tutorial } from '../utils/tutorialStore'
import '../styles/tutorial.css'

// 메인 화면 핵심 7개 제스처 — 실제로 운용하며 단계별로 익히는 가이드.
// detect 유형:
//   'flag'  — handState 상태 플래그를 RAF에서 직접 감지
//   'route' — 실제 화면 전환(카드 열기/뒤로가기)을 useLocation으로 감지
const STEPS = [
  { key: 'unlock',  type: 'flag',  title: '손 활성화',        mech: 'FIST · HOLD 0.5s',
    hint: '손바닥을 카메라로 향한 채 주먹을 쥐고 약 0.5초 유지하세요. 잠금이 풀립니다.' },
  { key: 'scroll',  type: 'flag',  title: '카드 넘기기',      mech: 'THUMB + MIDDLE',
    hint: '엄지와 중지를 맞붙여(핀치) 좌우로 움직여 카드를 넘겨보세요.' },
  { key: 'roll',    type: 'flag',  title: '빠르게 스크롤',     mech: 'PALM ROLL',
    hint: '손바닥을 보인 채 손목을 좌우로 굴리면 여러 장이 한 번에 넘어갑니다.' },
  { key: 'open',    type: 'route', title: '카드 열기',        mech: 'INDEX TAP',
    hint: '검지만 펴고 원하는 카드를 향해 아래로 톡 내리찍어 열어보세요.' },
  { key: 'back',    type: 'route', title: '뒤로 가기',        mech: 'THUMB + MIDDLE · DOUBLE TAP',
    hint: '엄지+중지를 빠르게 두 번 탭해 메인 화면으로 돌아오세요.' },
  { key: 'zoom',    type: 'flag',  title: '확대 / 축소',       mech: 'BOTH HANDS PINCH',
    hint: '양손 엄지+검지를 핀치한 뒤 손 간격을 벌리거나 좁혀보세요.' },
  { key: 'dismiss', type: 'flag',  title: '카드 밀어 치우기',   mech: 'THREE-FINGER PINCH',
    hint: '엄지+검지+중지를 모아 옆으로 밀어 카드 영역을 치워보세요.' },
]

export default function TutorialOverlay() {
  const active   = useSyncExternalStore(tutorial.subscribe, () => tutorial.active)
  const location = useLocation()
  const navigate = useNavigate()

  const [step,  setStep]  = useState(0)
  const [flash, setFlash] = useState(false)
  const [done,  setDone]  = useState(false)

  // RAF·이벤트 핸들러에서 최신 step을 읽기 위한 미러
  const stepRef       = useRef(0); stepRef.current = step
  const advancingRef  = useRef(false)   // ✓ 플래시~다음 단계 전환 중 중복 감지 차단
  // 단계별 누적기
  const accRef        = useRef(0)       // scroll: 핀치 이동 누적
  const lastPinchRef  = useRef(null)
  const rotBaseRef    = useRef(0)       // roll: 진입 시 rotPulse 기준값
  const zoomFramesRef = useRef(0)       // zoom: bothZoomActive 지속 프레임

  function resetAccum() {
    accRef.current = 0
    lastPinchRef.current = null
    rotBaseRef.current = handState.rotPulse
    zoomFramesRef.current = 0
    advancingRef.current = false
  }

  // 활성화 시 처음으로 리셋
  useEffect(() => {
    if (active) { setStep(0); setDone(false); setFlash(false); resetAccum() }
  }, [active])

  // 단계 전환 시 누적기 리셋
  useEffect(() => { if (active) resetAccum() }, [step, active])

  function succeed() {
    if (advancingRef.current) return
    advancingRef.current = true
    setFlash(true)
    setTimeout(() => {
      setFlash(false)
      setStep(p => {
        if (p >= STEPS.length - 1) { setDone(true); return p }
        return p + 1
      })
    }, 820)
  }

  // ── flag 유형 감지 (RAF) ──
  useEffect(() => {
    if (!active || done) return
    let raf
    const frame = () => {
      raf = requestAnimationFrame(frame)
      if (advancingRef.current) return
      const s = STEPS[stepRef.current]
      if (!s || s.type !== 'flag') return
      switch (s.key) {
        case 'unlock':
          if (!handState.leftLocked || !handState.rightLocked) succeed()
          break
        case 'scroll':
          if (handState.activePinch) {
            if (lastPinchRef.current !== null) {
              accRef.current += Math.abs(handState.pinchMidX - lastPinchRef.current)
            }
            lastPinchRef.current = handState.pinchMidX
            if (accRef.current > 0.18) succeed()
          } else {
            lastPinchRef.current = null
          }
          break
        case 'roll':
          if (handState.rotPulse !== rotBaseRef.current) succeed()
          break
        case 'zoom':
          if (handState.bothZoomActive) { if (++zoomFramesRef.current > 16) succeed() }
          else zoomFramesRef.current = 0
          break
        case 'dismiss':
          if (handState.dismissed) succeed()
          break
        default: break
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [active, done])

  // ── route 유형 감지 (실제 화면 전환) ──
  useEffect(() => {
    if (!active || done || advancingRef.current) return
    const s = STEPS[stepRef.current]
    if (!s || s.type !== 'route') return
    if (s.key === 'open' && location.pathname.startsWith('/motion/')) succeed()
    if (s.key === 'back' && location.pathname === '/') succeed()
  }, [location, active, done])

  function skip() {
    if (advancingRef.current) return
    setStep(p => { if (p >= STEPS.length - 1) { setDone(true); return p } return p + 1 })
  }
  function exit() {
    tutorial.stop()
    handState.resetView = true   // dismiss·zoom 상태 복원
    if (location.pathname !== '/') navigate('/')
  }
  function restart() {
    setDone(false); setFlash(false); setStep(0); resetAccum()
    handState.resetView = true
    if (location.pathname !== '/') navigate('/')
  }

  if (!active) return null
  const cur = STEPS[step]
  const offMain = !done && cur.type === 'flag' && location.pathname !== '/'

  return (
    <div className="tut-root">
      {!done ? (
        <div className="tut-banner">
          <div className="tut-top">
            <span className="tut-step">STEP {step + 1} / {STEPS.length}</span>
            <div className="tut-dots">
              {STEPS.map((s, i) => (
                <span key={s.key} className={`tut-dot${i < step ? ' done' : ''}${i === step ? ' cur' : ''}`} />
              ))}
            </div>
          </div>
          <span className="tut-title">{cur.title}</span>
          {offMain
            ? <p className="tut-hint tut-hint--warn">메인 화면에서 진행하는 단계예요. 엄지+중지 더블탭으로 돌아오세요.</p>
            : <p className="tut-hint">{cur.hint}</p>}
          <div className="tut-bottom">
            <span className="tut-mech">{cur.mech}</span>
            <div className="tut-actions">
              <button className="tut-btn" onClick={skip}>건너뛰기</button>
              <button className="tut-btn" onClick={exit}>종료</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="tut-done">
          <span className="tut-done-mark">✓</span>
          <h2 className="tut-done-title">튜토리얼 완료</h2>
          <p className="tut-done-desc">이제 모든 제스처를 손으로 자유롭게 사용할 수 있어요.</p>
          <div className="tut-actions">
            <button className="tut-btn" onClick={restart}>다시 하기</button>
            <button className="tut-btn tut-btn--primary" onClick={exit}>닫기</button>
          </div>
        </div>
      )}
      {flash && <div className="tut-flash">✓</div>}
    </div>
  )
}
