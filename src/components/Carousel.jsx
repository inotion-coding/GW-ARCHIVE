import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/carousel.css'
import handState from '../utils/handState'
import { CARDS } from '../data/cards'

const N     = CARDS.length
const SLOTS = 11
const HALF  = 5

const EASE   = 0.08
const FRIC   = 0.92
const SENS   = 0.005

// 페이지 이동 후 복귀 시 마지막 위치 유지
let savedCarouselOffset = 0

const SP_BASE = 285
const MAX_ROT = 7
const DEPTH   = 45

function styleOf(off) {
  const abs  = Math.abs(off)
  const sign = off < 0 ? -1 : 1
  const x    = sign * abs * (SP_BASE - 10 * abs)
  const rotY = sign * MAX_ROT * Math.tanh(abs * 1.6)
  return {
    x,
    z:    -abs * DEPTH,
    rotY,
    scale: Math.max(0.84, 1 - abs * 0.05),
    op:    Math.max(0.25, 1 - abs * 0.18),
    zi:    Math.round(100 - abs * 20),
  }
}

export default function Carousel() {
  const wrapRef     = useRef(null)
  const sceneRef    = useRef(null)
  const navigateRef = useRef(null)
  const navigate    = useNavigate()

  // navigate를 ref에 저장해 useEffect 클로저에서 최신 함수 사용
  navigateRef.current = navigate

  useEffect(() => {
    const wrap  = wrapRef.current
    const scene = sceneRef.current

    const slots = Array.from({ length: SLOTS }, () => {
      const el = document.createElement('div')
      el.className = 'c-card'
      scene.appendChild(el)
      return el
    })

    let offset = savedCarouselOffset, target = savedCarouselOffset, vel = 0
    let drag = false, lastX = 0
    let zoomLevel = 1
    let handVel = 0
    let wasHandPinching = false
    let dismissY          = 0     // 씬 수직 오프셋 — easing으로 추적 (px)
    let dismissTarget     = 0     // dismiss 목표값 — 드래그·물리 결정 (px)
    let dismissX          = 0     // 씬 수평 오프셋 (px)
    let dismissTargetX    = 0     // 수평 dismiss 목표값 (px)
    let dismissed         = false // 완전히 화면 밖으로 사라진 상태
    let dismissDir        = null  // 'down'|'up'|'left'|'right'|null — 사라진 방향
    let dismissDragStartY = null  // restore 드래그 시작 시점의 dismissTarget (수직)
    let dismissDragStartX = null  // restore 드래그 시작 시점의 dismissTargetX (수평)

    // 드래그 이동 거리 추적 — 짧으면 클릭으로 판정
    let dragStartX = 0
    let dragMoved  = false
    let downX      = 0
    let downOnCard = false   // 카드 요소 위에서 눌렀는지 여부

    const px = e => e.clientX ?? e.touches?.[0]?.clientX ?? 0

    const onDown = e => {
      drag = true; vel = 0; lastX = px(e)
      dragStartX = px(e); downX = px(e); dragMoved = false
      downOnCard = !!e.target?.closest?.('.c-card')
      handState.dragging = true
    }
    const onMove = e => {
      if (!drag) return
      const x = px(e)
      if (Math.abs(x - dragStartX) > 6) dragMoved = true
      vel = -(x - lastX) * SENS
      target += vel
      lastX = x
    }
    const onUp = () => {
      drag = false
      handState.dragging = false
      const projected = offset + vel / (1 - FRIC)
      target = Math.round(projected)
      vel = 0

      // 카드 위에서 드래그 없이 클릭한 경우만 이동
      if (!dragMoved && downOnCard) {
        const sceneCenter = window.innerWidth / 2
        const relX = downX - sceneCenter
        const base = Math.round(offset)
        const CARD_HALF = 126  // 252px / 2

        let nearestEl = null
        let minDist   = Infinity

        for (let i = 0; i < SLOTS; i++) {
          const visOff = (base + (i - HALF)) - offset
          if (Math.abs(visOff) > 3.8) continue
          const dist = Math.abs(relX - styleOf(visOff).x)
          if (dist < CARD_HALF && dist < minDist) {
            minDist = dist
            nearestEl = slots[i]
          }
        }

        if (nearestEl?.dataset?.cardId) {
          navigateRef.current(`/motion/${nearestEl.dataset.cardId}`)
        }
      }
    }

    wrap.addEventListener('mousedown',  onDown)
    wrap.addEventListener('touchstart', onDown, { passive: true })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('touchend',  onUp)

    let raf = null

    function tick() {
      if (!drag) { vel = 0 }

      // 카드가 화면 밖에 있을 때 일반 제스처 억제 (dismiss 드래그는 허용)
      const H = window.innerHeight
      const W = window.innerWidth
      if (dismissed && (Math.abs(dismissY) > H * 0.6 || Math.abs(dismissX) > W * 0.6)) {
        handState.dx = 0; handState.snap = false
        handState.click = false; handState.zoomDelta = 0
      }

      if (handState.active) {
        if (handState.activePinch && !wasHandPinching) {
          target = offset; handVel = 0
        }
        wasHandPinching = handState.activePinch

        if (handState.rotDx !== 0) {
          // 회전 임펄스: onUp과 동일하게 관성 투영 후 스냅 목표 설정
          const impulse   = handState.rotDx
          target          = Math.round(offset + impulse / (1 - FRIC))
          handVel         = impulse
          handState.rotDx = 0
        } else if (handState.dx !== 0) {
          target      += handState.dx
          handState.dx = 0
        }
        if (handState.snap) {
          // 관성 없이 현재 위치에서 가장 가까운 카드로 즉시 스냅
          target         = Math.round(offset)
          handVel        = 0
          handState.snap = false
        }
      } else {
        handVel = 0; wasHandPinching = false
      }

      if (handState.click) {
        const fingerScreenX = handState.clickX * window.innerWidth
        const fingerScreenY = handState.clickY * window.innerHeight
        // 검지 끝 좌표에 실제 카드 요소가 있는지 hit-test
        const hit = document.elementFromPoint(fingerScreenX, fingerScreenY)
        const card = hit?.closest?.('.c-card')
        if (card?.dataset?.cardId) {
          navigateRef.current(`/motion/${card.dataset.cardId}`)
        }
        handState.click = false
      }

      if (!drag && !handState.activePinch) {
        target += (Math.round(target) - target) * 0.12
      }

      if (handState.zoomDelta !== 0) {
        const maxZoom = (window.innerWidth / 2) / 530
        zoomLevel = Math.max(0.5, Math.min(maxZoom, zoomLevel + handState.zoomDelta))
        handState.zoomDelta = 0
      }

      // ── Dismiss / Restore (상·하·좌·우 4방향) ──
      // dismissDir: 'down'|'up'|'left'|'right'|null
      const DISMISS_THRESH   = H * 0.30
      const DISMISS_THRESH_X = W * 0.30
      const OFF_SCREEN_Y     = H + 80
      const OFF_SCREEN_X     = W + 80
      const DISMISS_EASE     = 0.12

      // ── 수직 dismiss (양손 엄지+중지 핀치) ──
      // dismissActive=true : 제스처 유지 중 → 정지해도 현재 위치 보존 (중간 스톱)
      // dismissActive=false: 제스처 해제 → 임계 미달 시 중앙 복귀, 초과 시 화면 밖 확정
      if (handState.dismissDrag !== 0) {
        const canActY = !dismissed || dismissDir === 'down' || dismissDir === 'up'
        if (canActY) {
          if (dismissDragStartY === null) dismissDragStartY = dismissTarget
          const rawTarget = dismissTarget + handState.dismissDrag * H * 3.0
          if (dismissed) {
            dismissTarget = dismissDir === 'down'
              ? Math.max(0, rawTarget)
              : Math.min(0, rawTarget)
          } else {
            dismissTarget = rawTarget
          }
          if (dismissed) {
            const travelBack = dismissDir === 'down'
              ? dismissDragStartY - dismissTarget
              : dismissTarget - dismissDragStartY
            if (travelBack > DISMISS_THRESH) {
              dismissed = false; dismissDir = null; dismissTarget = 0
              dismissDragStartY = null
            }
          }
        }
        handState.dismissDrag = 0
      } else {
        dismissDragStartY = null
        if (dismissed && (dismissDir === 'down' || dismissDir === 'up')) {
          if (!handState.dismissActive) {
            // 제스처 해제 → 화면 밖으로 재고정
            dismissTarget = dismissDir === 'down' ? OFF_SCREEN_Y : -OFF_SCREEN_Y
          }
          // dismissActive=true: 중간 스톱 — dismissTarget 유지
        } else if (!dismissed) {
          if (dismissTarget > DISMISS_THRESH) {
            dismissed = true; dismissDir = 'down'; dismissTarget = OFF_SCREEN_Y
          } else if (dismissTarget < -DISMISS_THRESH) {
            dismissed = true; dismissDir = 'up'; dismissTarget = -OFF_SCREEN_Y
          } else if (!handState.dismissActive) {
            // 제스처 해제 + 임계 미달 → 중앙 복귀
            dismissTarget = 0
          }
          // dismissActive=true + 임계 미달: 중간 스톱 — 위치 유지
        }
        // dismissDir === 'left'|'right' 일 때 수직 target은 0 유지 (자동)
      }

      // ── 수평 dismiss (단일 손 3핀치) ──
      if (handState.dismissDragX !== 0) {
        const canActX = !dismissed || dismissDir === 'right' || dismissDir === 'left'
        if (canActX) {
          if (dismissDragStartX === null) dismissDragStartX = dismissTargetX
          const rawTargetX = dismissTargetX + handState.dismissDragX * W * 3.0
          if (dismissed) {
            dismissTargetX = dismissDir === 'right'
              ? Math.max(0, rawTargetX)
              : Math.min(0, rawTargetX)
          } else {
            dismissTargetX = rawTargetX
          }
          if (dismissed) {
            const travelBackX = dismissDir === 'right'
              ? dismissDragStartX - dismissTargetX
              : dismissTargetX - dismissDragStartX
            if (travelBackX > DISMISS_THRESH_X) {
              dismissed = false; dismissDir = null; dismissTargetX = 0
              dismissDragStartX = null
            }
          }
        }
        handState.dismissDragX = 0
      } else {
        dismissDragStartX = null
        if (dismissed && (dismissDir === 'right' || dismissDir === 'left')) {
          if (!handState.dismissDragXActive) {
            dismissTargetX = dismissDir === 'right' ? OFF_SCREEN_X : -OFF_SCREEN_X
          }
          // dismissDragXActive=true: 중간 스톱 — dismissTargetX 유지
        } else if (!dismissed) {
          if (dismissTargetX > DISMISS_THRESH_X) {
            dismissed = true; dismissDir = 'right'; dismissTargetX = OFF_SCREEN_X
          } else if (dismissTargetX < -DISMISS_THRESH_X) {
            dismissed = true; dismissDir = 'left'; dismissTargetX = -OFF_SCREEN_X
          } else if (!handState.dismissDragXActive) {
            dismissTargetX = 0
          }
          // dismissDragXActive=true + 임계 미달: 중간 스톱 — 위치 유지
        }
        // dismissDir === 'up'|'down' 일 때 수평 target은 0 유지 (자동)
      }

      dismissY += (dismissTarget  - dismissY) * DISMISS_EASE
      dismissX += (dismissTargetX - dismissX) * DISMISS_EASE
      if (Math.abs(dismissY) < 0.5 && dismissTarget  === 0) dismissY = 0
      if (Math.abs(dismissX) < 0.5 && dismissTargetX === 0) dismissX = 0

      handState.dismissed  = dismissed   // HandTracker 스켈레톤 하이라이트 동기화
      handState.dismissDir = dismissDir  // HandTracker 수평 신호 게이팅용

      const isOffScreen = Math.abs(dismissY) > H * 1.02 || Math.abs(dismissX) > W * 1.02
      scene.style.visibility = isOffScreen ? 'hidden' : 'visible'
      scene.style.transform  = `translateX(${dismissX.toFixed(1)}px) translateY(${dismissY.toFixed(1)}px) scale(${zoomLevel.toFixed(3)})`

      offset += (target - offset) * EASE

      const base = Math.round(offset)

      for (let i = 0; i < SLOTS; i++) {
        const el     = slots[i]
        const slot   = i - HALF
        const logIdx = base + slot
        const visOff = logIdx - offset

        if (Math.abs(visOff) > 3.8) { el.style.display = 'none'; continue }

        const cardIdx = ((logIdx % N) + N) % N
        const card    = CARDS[cardIdx]
        const imgUrl  = `url('${card.img}')`

        if (el._img !== imgUrl) {
          el.style.backgroundImage = el._img = imgUrl
          el.style.backgroundColor = card.color
          el.dataset.cardId = card.id

          // 타이틀 레이블 업데이트
          if (!el._label) {
            const label = document.createElement('div')
            label.className = 'c-card-label'
            el.appendChild(label)
            el._label = label
          }
          el._label.textContent = card.title
        }

        const isCtr = Math.abs(visOff) < 0.5
        const s = styleOf(visOff)
        el.style.display   = 'block'
        el.style.transform =
          `translateX(${s.x.toFixed(1)}px) ` +
          `translateZ(${s.z.toFixed(1)}px) ` +
          `rotateY(${s.rotY.toFixed(2)}deg) ` +
          `scale(${s.scale.toFixed(3)})`
        el.style.opacity = s.op.toFixed(3)
        el.style.zIndex  = s.zi

        el.classList.toggle('c-card--active', isCtr)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      savedCarouselOffset = offset
      wrap.removeEventListener('mousedown',  onDown)
      wrap.removeEventListener('touchstart', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('touchend',  onUp)
      slots.forEach(el => el.remove())
    }
  }, [])

  return (
    <div ref={wrapRef} className="carousel-wrap">
      <div ref={sceneRef} className="carousel-scene" />
    </div>
  )
}
