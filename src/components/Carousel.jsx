/**
 * Coverflow Carousel
 * - GPU-only animation: transform + opacity (no layout/paint per frame)
 * - Mouse/touch drag with lerp + inertia for buttery smooth motion
 * - rotateY gives the "round" cylindrical feel
 */
import { useEffect, useRef } from 'react'
import '../styles/carousel.css'

const IMGS = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600',
  'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600',
  'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600',
  'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=600',
]
const FALLS = ['#d0d0d0', '#9aab98', '#c8bfb0', '#b8c0b8']

const N       = IMGS.length
const SLOTS   = 11      // DOM 카드 수 (−5 … +5)
const HALF    = 5

const EASE    = 0.08    // lerp 계수 — 낮을수록 부드러움
const FRIC    = 0.92    // 관성 감쇠율 (마우스 놓은 후 서서히 멈춤)
const SENS    = 0.005   // 드래그 px → offset 변환 감도

const SPACING = 278     // 카드 간 수평 간격 px
const MAX_ROT = 12      // 옆 카드 최대 rotateY 각도
const DEPTH   = 45      // 옆 카드 translateZ 음수값 (카드당)

/* offset에 따른 3D 스타일 계산 */
function styleOf(off) {
  const abs  = Math.abs(off)
  const sign = off < 0 ? -1 : 1
  return {
    x:     off * SPACING,
    z:    -abs * DEPTH,
    rotY:  sign * Math.min(abs, 1) * MAX_ROT,
    scale: Math.max(0.84, 1 - abs * 0.05),  // 중앙 1.0 → ±1 0.95 → ±2 0.90
    op:    Math.max(0.25, 1 - abs * 0.18),
    zi:    Math.round(100 - abs * 20),
  }
}

export default function Carousel() {
  const wrapRef  = useRef(null)
  const sceneRef = useRef(null)

  useEffect(() => {
    const wrap  = wrapRef.current
    const scene = sceneRef.current

    /* DOM 카드 생성 */
    const slots = Array.from({ length: SLOTS }, () => {
      const el = document.createElement('div')
      el.className = 'c-card'
      scene.appendChild(el)
      return el
    })

    let offset = 0, target = 0, vel = 0
    let drag = false, lastX = 0

    const px = e => e.clientX ?? e.touches?.[0]?.clientX ?? 0

    const onDown = e => { drag = true; vel = 0; lastX = px(e) }
    const onMove = e => {
      if (!drag) return
      const x = px(e)
      vel = -(x - lastX) * SENS
      target += vel
      lastX = x
    }
    const onUp = () => {
      drag = false
      // 관성이 자연스럽게 멈출 위치 예측: vel / (1 - FRIC) = 등비수열 합
      const projected = offset + vel / (1 - FRIC)
      target = Math.round(projected)
      vel    = 0
    }

    wrap.addEventListener('mousedown',  onDown)
    wrap.addEventListener('touchstart', onDown, { passive: true })
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('touchend',  onUp)

    let raf = null

    function tick() {
      /* 드래그 중일 때만 관성 누적 (놓는 순간 snap target 고정) */
      if (!drag) { vel = 0 }

      /* 부드러운 보간 */
      offset += (target - offset) * EASE

      const base = Math.round(offset)

      for (let i = 0; i < SLOTS; i++) {
        const el     = slots[i]
        const slot   = i - HALF           // −5 … +5
        const logIdx = base + slot        // 논리적 카드 인덱스
        const visOff = logIdx - offset    // 중심으로부터 소수 거리

        /* 화면 밖 카드 숨김 */
        if (Math.abs(visOff) > 3.8) { el.style.display = 'none'; continue }

        /* 이미지 캐시 교체 */
        const imgIdx = ((logIdx % N) + N) % N
        const imgUrl = `url('${IMGS[imgIdx]}')`
        if (el._img !== imgUrl) {
          el.style.backgroundImage = el._img = imgUrl
          el.style.backgroundColor = FALLS[imgIdx]
        }

        /* GPU 합성 레이어 속성만 변경 */
        const s = styleOf(visOff)
        el.style.display   = 'block'
        el.style.transform =
          `translateX(${s.x.toFixed(1)}px) ` +
          `translateZ(${s.z.toFixed(1)}px) ` +
          `rotateY(${s.rotY.toFixed(2)}deg) ` +
          `scale(${s.scale.toFixed(3)})`
        el.style.opacity = s.op.toFixed(3)
        el.style.zIndex  = s.zi
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
