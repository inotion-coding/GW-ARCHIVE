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
    let wasCardGrab  = false
    let cardGrabActive = false
    let grabbedLogIdx  = -Infinity  // grab 시작 시점의 카드 논리 인덱스
    let grabCardX      = 0          // 잡힌 카드의 X 독립 이동량 (px)
    let grabCardAnim   = false      // 복귀 애니메이션 중

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

      if (handState.active) {
        // ── 엄지+검지로 중앙 카드 단독 이동 (캐러셀 고정) ──
        if (handState.cardGrab) {
          if (!wasCardGrab) {
            // grab 시작: 핀치 위치가 중앙 카드 위인지 확인 (히트박스 ±160px)
            const CARD_HALF_NORM = 160 / window.innerWidth
            if (Math.abs(handState.cardGrabX - 0.5) < CARD_HALF_NORM) {
              cardGrabActive = true
              grabbedLogIdx  = Math.round(offset)
              grabCardX      = 0
              grabCardAnim   = false
              target         = offset  // 캐러셀 위치 고정
            }
            wasCardGrab = true
          }
          if (cardGrabActive && handState.cardGrabDx !== 0) {
            // 잡힌 카드만 px 단위로 이동 (offset 변경 없음)
            grabCardX += handState.cardGrabDx * window.innerWidth
            handState.cardGrabDx = 0
          }
        } else if (wasCardGrab) {
          wasCardGrab = false
          if (cardGrabActive) {
            const EJECT_DIST = window.innerWidth * 0.30
            if (Math.abs(grabCardX) > EJECT_DIST) {
              // 배출: 캐러셀 1칸 전진 후 카드 즉시 리셋
              target = Math.round(offset) + (grabCardX > 0 ? 1 : -1)
              grabCardX = 0; cardGrabActive = false; grabbedLogIdx = -Infinity
            } else {
              // 복귀 애니메이션
              grabCardAnim = true; cardGrabActive = false
            }
          }
        }

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
        if (wasCardGrab) {
          wasCardGrab = false
          if (cardGrabActive) { grabCardAnim = true; cardGrabActive = false }
        }
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

      // 복귀 애니메이션
      if (grabCardAnim) {
        grabCardX *= 0.78
        if (Math.abs(grabCardX) < 0.5) {
          grabCardX = 0; grabCardAnim = false; grabbedLogIdx = -Infinity
        }
      }

      if (!drag && !handState.activePinch && !handState.cardGrab && !cardGrabActive && !grabCardAnim) {
        target += (Math.round(target) - target) * 0.12
      }

      if (handState.zoomDelta !== 0) {
        const maxZoom = (window.innerWidth / 2) / 530
        zoomLevel = Math.max(0.5, Math.min(maxZoom, zoomLevel + handState.zoomDelta))
        handState.zoomDelta = 0
      }
      scene.style.transform = `scale(${zoomLevel.toFixed(3)})`

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

        const isCtr     = Math.abs(visOff) < 0.5
        const isGrabbed = (cardGrabActive || grabCardAnim) && logIdx === grabbedLogIdx
        const s = styleOf(visOff)
        el.style.display = 'block'

        if (isGrabbed) {
          // 잡힌 카드: 3D 회전 없이 직선 이동
          el.style.transform =
            `translateX(${(s.x + grabCardX).toFixed(1)}px) ` +
            `translateZ(24px) ` +
            `scale(1.06)`
          el.style.opacity = '1'
          el.style.zIndex  = '200'
        } else {
          el.style.transform =
            `translateX(${s.x.toFixed(1)}px) ` +
            `translateZ(${s.z.toFixed(1)}px) ` +
            `rotateY(${s.rotY.toFixed(2)}deg) ` +
            `scale(${s.scale.toFixed(3)})`
          el.style.opacity = s.op.toFixed(3)
          el.style.zIndex  = s.zi
        }

        el.classList.toggle('c-card--active',  isCtr)
        el.classList.toggle('c-card--grabbed', isGrabbed)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      savedCarouselOffset = offset  // 위치 저장
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
