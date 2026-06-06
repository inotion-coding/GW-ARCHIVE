import { useEffect, useRef } from 'react'
import '../styles/carousel.css'

const IMAGES = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600',
  'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600',
  'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600',
  'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=600',
]
const FALLBACKS = ['#d0d0d0', '#9aab98', '#c8bfb0', '#b8c0b8']

const SPEED      = 40   // px/sec
const SPACING    = 295  // center-to-center px
const HALF_MAX   = 150  // half of largest card + buffer (off-screen threshold)
const BOTTOM_PAD = 30   // px from container bottom

/*
 * 좌우 완전 대칭.
 * SPACING=295 기준 시각 갭:
 *   far ↔ ±1  : 295 - (255/2 + 272/2) = ~31px
 *   ±1  ↔ center: 295 - (272/2 + 290/2) = ~14px
 */
const S = [
  { w: 255, h: 370, op: 0.50, sh: 'none' },
  { w: 272, h: 385, op: 1.00, sh: '0 4px 16px rgba(0,0,0,0.13)' },
  { w: 290, h: 400, op: 1.00, sh: '0 8px 28px rgba(0,0,0,0.20)' },
  { w: 272, h: 385, op: 0.85, sh: '0 4px 16px rgba(0,0,0,0.13)' },
  { w: 255, h: 370, op: 0.50, sh: 'none' },
]

function lerp(a, b, t) { return a + (b - a) * t }

function styleAt(dist) {
  const idx = Math.max(0, Math.min(4, dist + 2))
  const lo  = Math.min(3, Math.floor(idx))
  const hi  = lo + 1
  const t   = idx - lo
  if (t === 0 || hi > 4) return S[lo]
  return {
    w:  lerp(S[lo].w,  S[hi].w,  t),
    h:  lerp(S[lo].h,  S[hi].h,  t),
    op: lerp(S[lo].op, S[hi].op, t),
    sh: t < 0.5 ? S[lo].sh : S[hi].sh,
  }
}

export default function Carousel() {
  const wrapRef = useRef(null)

  useEffect(() => {
    const wrap     = wrapRef.current
    const getAnchor = () => window.innerWidth * 0.50
    const NUM      = Math.max(8, Math.ceil(window.innerWidth / SPACING) + 4)

    /* 카드 DOM 생성 */
    const cards  = []
    const anchor0 = getAnchor()
    for (let i = 0; i < NUM; i++) {
      const el = document.createElement('div')
      el.className = 'c-card'
      const ii = i % IMAGES.length
      el.style.backgroundImage = `url('${IMAGES[ii]}')`
      el.style.backgroundColor  = FALLBACKS[ii]
      wrap.appendChild(el)
      cards.push({ el, cx: anchor0 + (i - 2) * SPACING })
    }

    /* 컨테이너 높이 캐시 — 매 프레임 reflow 방지 */
    let ch = wrap.offsetHeight
    const onResize = () => { ch = wrap.offsetHeight }
    window.addEventListener('resize', onResize, { passive: true })

    let last = null
    let raf  = null

    function tick(ts) {
      if (!last) last = ts
      const dt   = Math.min((ts - last) / 1000, 0.05)
      last       = ts
      const move = SPEED * dt
      const anch = getAnchor()

      /* 1. 이동 + maxCx 단일 패스로 계산 (sort 불필요) */
      let maxCx = -Infinity
      for (const c of cards) {
        c.cx -= move
        if (c.cx > maxCx) maxCx = c.cx
      }

      /* 2. 왼쪽으로 사라진 카드를 오른쪽 끝으로 이동 */
      for (const c of cards) {
        if (c.cx + HALF_MAX < 0) {
          maxCx  += SPACING
          c.cx    = maxCx
        }
      }

      /* 3. 렌더 */
      for (const c of cards) {
        const dist = (c.cx - anch) / SPACING
        if (Math.abs(dist) > 3.2) { c.el.style.display = 'none'; continue }

        const s    = styleAt(dist)
        const left = c.cx - s.w / 2
        const top  = ch - s.h - BOTTOM_PAD
        const zi   = Math.round(10 - Math.abs(dist) * 3)

        c.el.style.display    = 'block'
        c.el.style.left       = left.toFixed(1) + 'px'
        c.el.style.top        = top.toFixed(1)  + 'px'
        c.el.style.width      = s.w.toFixed(1)  + 'px'
        c.el.style.height     = s.h.toFixed(1)  + 'px'
        c.el.style.opacity    = s.op.toFixed(3)
        c.el.style.boxShadow  = s.sh
        c.el.style.zIndex     = zi
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      cards.forEach(c => c.el.remove())
    }
  }, [])

  return <div ref={wrapRef} className="carousel-wrap" />
}
