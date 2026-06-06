import { useEffect, useRef } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import handState from '../utils/handState'
import '../styles/hand-tracker.css'

const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[0,17],[17,18],[18,19],[19,20],
]

const SCROLL_RATIO  = 0.28   // 스크롤 핀치: 엄지(4)+중지(12) 거리/손크기
const ZOOM_RATIO    = 0.28   // 줌 핀치: 엄지(4)+검지(8) 거리/손크기
const HAND_SENS     = 10
const DX_DEAD_ZONE  = 0.004
const ZOOM_SENS     = 2.2
const TAP_THRESHOLD = 0.04   // 검지 탭 판정: 1프레임 내 아래 이동량 (정규화)

// 스크롤 핀치: 엄지(4) + 중지(12)
function analyzeScrollPinch(lm) {
  const isFist    = lm[12].y > lm[10].y && lm[16].y > lm[14].y && lm[20].y > lm[18].y
  const pinchDist = Math.hypot(lm[4].x - lm[12].x, lm[4].y - lm[12].y)
  const handSize  = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y)
  const isPinch   = handSize > 0 && (pinchDist / handSize) < SCROLL_RATIO
  return {
    activePinch: isPinch && !isFist,
    midX: (lm[4].x + lm[12].x) / 2,
    midY: (lm[4].y + lm[12].y) / 2,
  }
}

// 줌 핀치: 엄지(4) + 검지(8)
function analyzeZoomPinch(lm) {
  const isFist    = lm[12].y > lm[10].y && lm[16].y > lm[14].y && lm[20].y > lm[18].y
  const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)
  const handSize  = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y)
  const isPinch   = handSize > 0 && (pinchDist / handSize) < ZOOM_RATIO
  return {
    activePinch: isPinch && !isFist,
    midX: (lm[4].x + lm[8].x) / 2,
    midY: (lm[4].y + lm[8].y) / 2,
  }
}

// 검지 단독 펴기: 검지만 펴고 나머지 세 손가락은 접힌 상태
function isIndexOnly(lm) {
  return lm[8].y  < lm[6].y   // 검지 tip > PIP (펴짐)
      && lm[12].y > lm[10].y  // 중지 접힘
      && lm[16].y > lm[14].y  // 약지 접힘
      && lm[20].y > lm[18].y  // 소지 접힘
}

function drawHand(lm, ctx, W, H, highlight) {
  const pt = i => ({ x: (1 - lm[i].x) * W, y: lm[i].y * H })
  ctx.strokeStyle = highlight ? 'rgba(55,55,55,0.8)' : 'rgba(110,110,110,0.5)'
  ctx.lineWidth   = highlight ? 1.6 : 1.2
  for (const [a, b] of CONNECTIONS) {
    const pa = pt(a), pb = pt(b)
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke()
  }
  for (let i = 0; i < 21; i++) {
    const p = pt(i)
    ctx.fillStyle = highlight ? 'rgba(45,45,45,0.9)' : 'rgba(100,100,100,0.7)'
    ctx.beginPath(); ctx.arc(p.x, p.y, i === 0 ? 4 : 2, 0, Math.PI * 2); ctx.fill()
  }
}

// tipA, tipB: 핀치에 쓰이는 랜드마크 인덱스
function drawPinchDot(lm, tipA, tipB, ctx, W, H) {
  const ptX = i => (1 - lm[i].x) * W
  const ptY = i => lm[i].y * H
  const mid = { x: (ptX(tipA) + ptX(tipB)) / 2, y: (ptY(tipA) + ptY(tipB)) / 2 }
  ctx.fillStyle = 'rgba(25,25,25,0.95)'
  ctx.beginPath(); ctx.arc(mid.x, mid.y, 7, 0, Math.PI * 2); ctx.fill()
  return mid
}

function drawIndexTip(lm, ctx, W, H, active) {
  const x = (1 - lm[8].x) * W
  const y = lm[8].y * H
  ctx.fillStyle = active ? 'rgba(0,0,0,0.9)' : 'rgba(60,60,60,0.65)'
  ctx.beginPath(); ctx.arc(x, y, active ? 10 : 6, 0, Math.PI * 2); ctx.fill()
}

export default function HandTracker() {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    let landmarker   = null
    let rafId        = null
    let lastX        = null
    let wasPinching  = false
    let lastZoomDist = null
    let lastIndexY   = null
    let tapFired     = false

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
        })
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
        })
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        rafId = requestAnimationFrame(detect)
      } catch (err) {
        console.warn('[HandTracker] 초기화 실패:', err)
      }
    }

    function resetHandState() {
      handState.active      = false
      handState.activePinch = false
      handState.dx          = 0
      handState.zoomDelta   = 0
    }

    function detect() {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || !landmarker || video.readyState < 2) {
        rafId = requestAnimationFrame(detect)
        return
      }

      const W = canvas.width  = window.innerWidth
      const H = canvas.height = window.innerHeight
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, W, H)

      const result = landmarker.detectForVideo(video, performance.now())
      const lms    = result.landmarks

      if (lms.length === 0) {
        if (wasPinching) { handState.snap = true; wasPinching = false }
        lastX = null; lastZoomDist = null; lastIndexY = null; tapFired = false
        resetHandState()
        rafId = requestAnimationFrame(detect)
        return
      }

      handState.active = true

      const scrollInfos = lms.map(analyzeScrollPinch)
      const zoomInfos   = lms.map(analyzeZoomPinch)

      // ── 양손 엄지+검지 핀치 → 줌 모드 ──
      if (lms.length === 2 && zoomInfos[0].activePinch && zoomInfos[1].activePinch) {
        lms.forEach(lm => drawHand(lm, ctx, W, H, true))
        const p0 = drawPinchDot(lms[0], 4, 8, ctx, W, H)
        const p1 = drawPinchDot(lms[1], 4, 8, ctx, W, H)

        ctx.strokeStyle = 'rgba(40,40,40,0.45)'
        ctx.lineWidth   = 1
        ctx.setLineDash([5, 5])
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke()
        ctx.setLineDash([])

        const zoomDist = Math.hypot(zoomInfos[0].midX - zoomInfos[1].midX, zoomInfos[0].midY - zoomInfos[1].midY)
        if (lastZoomDist !== null) {
          handState.zoomDelta = (zoomDist - lastZoomDist) * ZOOM_SENS
        }
        lastZoomDist = zoomDist

        if (wasPinching) { handState.snap = true }
        wasPinching = false; lastX = null; lastIndexY = null; tapFired = false
        handState.dx = 0; handState.activePinch = false

      } else {
        lastZoomDist        = null
        handState.zoomDelta = 0

        const scrollActive = scrollInfos.findIndex(p => p.activePinch)

        // ── 검지 단독 (스크롤 핀치 없을 때) → 탭 클릭 ──
        const firstLm       = lms[0]
        const inIndexMode   = scrollActive < 0 && isIndexOnly(firstLm)

        if (inIndexMode) {
          lms.forEach((lm, i) => drawHand(lm, ctx, W, H, i === 0))
          drawIndexTip(firstLm, ctx, W, H, tapFired)

          const curY = firstLm[8].y
          if (lastIndexY !== null) {
            const dy = curY - lastIndexY   // 양수 = 손가락 아래로 이동
            if (dy > TAP_THRESHOLD && !tapFired) {
              handState.click = true
              tapFired = true
            } else if (dy < -0.01) {
              tapFired = false             // 손가락 올라오면 다음 탭 준비
            }
          }
          lastIndexY = curY

          // 탭 모드에서는 스크롤 비활성
          handState.activePinch = false
          handState.dx = 0
          if (wasPinching) { handState.snap = true; wasPinching = false }
          lastX = null

        } else {
          // ── 엄지+중지 핀치 → 스크롤 모드 ──
          lastIndexY = null; tapFired = false

          lms.forEach((lm, i) => drawHand(lm, ctx, W, H, scrollInfos[i].activePinch))
          scrollInfos.forEach((info, i) => {
            if (info.activePinch) drawPinchDot(lms[i], 4, 12, ctx, W, H)
          })

          const activeLm = scrollActive >= 0 ? lms[scrollActive] : null
          handState.activePinch = !!activeLm

          if (activeLm) {
            const mirroredX = 1 - activeLm[0].x
            if (lastX !== null) {
              const raw    = mirroredX - lastX
              handState.dx = Math.abs(raw) > DX_DEAD_ZONE ? raw * HAND_SENS : 0
            }
            lastX = mirroredX
          } else {
            if (wasPinching) { handState.snap = true }
            lastX = null; handState.dx = 0
          }

          wasPinching = !!activeLm
        }
      }

      rafId = requestAnimationFrame(detect)
    }

    init()

    return () => {
      cancelAnimationFrame(rafId)
      videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())
      landmarker?.close()
      Object.assign(handState, { dx: 0, snap: false, activePinch: false, active: false, zoomDelta: 0, click: false })
    }
  }, [])

  return (
    <>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
      <canvas ref={canvasRef} className="hand-canvas" />
    </>
  )
}
