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

const PINCH_RATIO  = 0.28   // 핀치 판정: pinchDist / handSize 비율 (손 크기 기준 상대값)
const HAND_SENS    = 10
const DX_DEAD_ZONE = 0.004
const ZOOM_SENS    = 2.2

// 손 하나의 핀치·주먹 상태를 분석
function analyzePinch(lm) {
  const isFist = lm[12].y > lm[10].y && lm[16].y > lm[14].y && lm[20].y > lm[18].y

  // 손 크기 기준 상대 거리로 핀치 판정 (카메라 거리 무관)
  const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)
  const handSize  = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y)
  const isPinch   = handSize > 0 && (pinchDist / handSize) < PINCH_RATIO

  return {
    isPinch,
    isFist,
    activePinch: isPinch && !isFist,
    midX: (lm[4].x + lm[8].x) / 2,
    midY: (lm[4].y + lm[8].y) / 2,
  }
}

// 손 스켈레톤 그리기
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

// 핀치 포인트 점 그리기
function drawPinchDot(lm, ctx, W, H) {
  const pt = i => ({ x: (1 - lm[i].x) * W, y: lm[i].y * H })
  const mid = { x: (pt(4).x + pt(8).x) / 2, y: (pt(4).y + pt(8).y) / 2 }
  ctx.fillStyle = 'rgba(25,25,25,0.95)'
  ctx.beginPath(); ctx.arc(mid.x, mid.y, 7, 0, Math.PI * 2); ctx.fill()
  return mid
}

export default function HandTracker() {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    let landmarker    = null
    let rafId         = null
    let lastX         = null
    let wasPinching   = false
    let lastZoomDist  = null

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,           // 두 손 모두 감지
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
        lastX = null; lastZoomDist = null
        resetHandState()
        rafId = requestAnimationFrame(detect)
        return
      }

      handState.active = true
      const infos = lms.map(analyzePinch)

      // ── 양손 핀치 → 줌 모드 ──
      if (lms.length === 2 && infos[0].activePinch && infos[1].activePinch) {
        lms.forEach((lm, i) => drawHand(lm, ctx, W, H, true))
        const p0 = drawPinchDot(lms[0], ctx, W, H)
        const p1 = drawPinchDot(lms[1], ctx, W, H)

        // 두 핀치 포인트 연결선 (점선)
        ctx.strokeStyle = 'rgba(40,40,40,0.45)'
        ctx.lineWidth   = 1
        ctx.setLineDash([5, 5])
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke()
        ctx.setLineDash([])

        // 줌 거리 계산 (정규화)
        const zoomDist = Math.hypot(infos[0].midX - infos[1].midX, infos[0].midY - infos[1].midY)
        if (lastZoomDist !== null) {
          handState.zoomDelta = (zoomDist - lastZoomDist) * ZOOM_SENS
        }
        lastZoomDist = zoomDist

        // 단일 핸드 상태 초기화
        if (wasPinching) { handState.snap = true }
        wasPinching = false; lastX = null
        handState.dx = 0; handState.activePinch = false

      // ── 단일 핸드 → 스크롤 모드 ──
      } else {
        lastZoomDist        = null
        handState.zoomDelta = 0

        lms.forEach((lm, i) => drawHand(lm, ctx, W, H, infos[i].activePinch))
        infos.forEach((info, i) => {
          if (info.activePinch) drawPinchDot(lms[i], ctx, W, H)
        })

        // 첫 번째 유효 핀치 손으로 스크롤
        const activeIdx = infos.findIndex(p => p.activePinch)
        const activeLm  = activeIdx >= 0 ? lms[activeIdx] : null

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

      rafId = requestAnimationFrame(detect)
    }

    init()

    return () => {
      cancelAnimationFrame(rafId)
      videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())
      landmarker?.close()
      Object.assign(handState, { dx: 0, snap: false, activePinch: false, active: false, zoomDelta: 0 })
    }
  }, [])

  return (
    <>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
      <canvas ref={canvasRef} className="hand-canvas" />
    </>
  )
}
