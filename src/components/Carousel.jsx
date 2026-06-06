import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/carousel.css'
import handState from '../utils/handState'

const CARDS = [
  { id: 1, title: 'Hand Gesture',   img: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600', color: '#c8bfb0' },
  { id: 2, title: 'Body Pose',      img: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600', color: '#9aab98' },
  { id: 3, title: 'Eye Tracking',   img: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600', color: '#b8c0b8' },
  { id: 4, title: 'Face Mesh',      img: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=600', color: '#d0d0d0' },
  { id: 5, title: 'Pinch Control',  img: 'https://images.unsplash.com/photo-1455165814004-1126a7199f9b?w=600', color: '#b0c0c8' },
  { id: 6, title: 'Wrist Motion',   img: 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?w=600', color: '#c0b8c0' },
  { id: 7, title: 'Zoom Gesture',   img: 'https://images.unsplash.com/photo-1527525443983-6e60c75fff46?w=600', color: '#c8c0b0' },
  { id: 8, title: 'Swipe Control',  img: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600', color: '#b8b0b0' },
  { id: 9, title: 'Fist Detect',    img: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600', color: '#a8b8a8' },
  { id: 10, title: 'Dual Hand',     img: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=600', color: '#c0c8b0' },
]

const N     = CARDS.length
const SLOTS = 11
const HALF  = 5

const EASE   = 0.08
const FRIC   = 0.92
const SENS   = 0.005

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

    let offset = 0, target = 0, vel = 0
    let drag = false, lastX = 0
    let zoomLevel = 1
    let handVel = 0
    let wasHandPinching = false

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
        const base    = Math.round(offset)
        const cardIdx = ((base % N) + N) % N
        navigateRef.current(`/motion/${CARDS[cardIdx].id}`)
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

        const s = styleOf(visOff)
        el.style.display   = 'block'
        el.style.transform =
          `translateX(${s.x.toFixed(1)}px) ` +
          `translateZ(${s.z.toFixed(1)}px) ` +
          `rotateY(${s.rotY.toFixed(2)}deg) ` +
          `scale(${s.scale.toFixed(3)})`
        el.style.opacity = s.op.toFixed(3)
        el.style.zIndex  = s.zi

        // 중앙 카드만 활성 표시
        el.classList.toggle('c-card--active', Math.abs(visOff) < 0.5)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
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
