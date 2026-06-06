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

const PINCH_THRESH = 0.07   // 핀치 임계값 (정규화 거리)
const HAND_SENS    = 10     // 손 이동 → 캐러셀 감도
const DX_DEAD_ZONE = 0.004  // 미세 떨림 무시

export default function HandTracker() {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    let landmarker  = null
    let rafId       = null
    let lastX       = null
    let wasPinching = false

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 1,
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

      if (result.landmarks.length > 0) {
        const lm = result.landmarks[0]
        const pt = i => ({ x: (1 - lm[i].x) * W, y: lm[i].y * H })

        // ── 주먹 감지: 중지·약지·소지 끝이 PIP 관절보다 아래(y값 큼) ──
        const isFist = (
          lm[12].y > lm[10].y &&  // 중지 접힘
          lm[16].y > lm[14].y &&  // 약지 접힘
          lm[20].y > lm[18].y     // 소지 접힘
        )

        // ── 핀치 감지 (엄지 끝 #4 ↔ 검지 끝 #8) ──
        const pinchDist  = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)
        const isPinch    = pinchDist < PINCH_THRESH
        const activePinch = isPinch && !isFist  // 주먹이면 핀치 무효

        // ── 스켈레톤 ──
        ctx.strokeStyle = activePinch
          ? 'rgba(60,60,60,0.8)'   // 핀치 활성: 진하게
          : 'rgba(110,110,110,0.5)'
        ctx.lineWidth = activePinch ? 1.6 : 1.2
        for (const [a, b] of CONNECTIONS) {
          const pa = pt(a), pb = pt(b)
          ctx.beginPath()
          ctx.moveTo(pa.x, pa.y)
          ctx.lineTo(pb.x, pb.y)
          ctx.stroke()
        }

        // 관절 점
        for (let i = 0; i < 21; i++) {
          const p = pt(i)
          ctx.fillStyle = activePinch
            ? 'rgba(50,50,50,0.9)'
            : 'rgba(100,100,100,0.7)'
          ctx.beginPath()
          ctx.arc(p.x, p.y, i === 0 ? 4 : 2, 0, Math.PI * 2)
          ctx.fill()
        }

        // 핀치 포인트 표시
        if (activePinch) {
          const mid = { x: (pt(4).x + pt(8).x) / 2, y: (pt(4).y + pt(8).y) / 2 }
          ctx.fillStyle = 'rgba(30,30,30,0.95)'
          ctx.beginPath()
          ctx.arc(mid.x, mid.y, 7, 0, Math.PI * 2)
          ctx.fill()
        }

        // ── 핀치 + 이동 → dx 계산 ──
        if (activePinch) {
          const mirroredX = 1 - lm[0].x  // 손목 X (미러링)
          if (lastX !== null) {
            const raw = mirroredX - lastX
            handState.dx = Math.abs(raw) > DX_DEAD_ZONE ? raw * HAND_SENS : 0
          }
          lastX = mirroredX
        } else {
          // 핀치 해제 시 스냅 트리거
          if (wasPinching) handState.snap = true
          lastX        = null
          handState.dx = 0
        }

        handState.activePinch = activePinch
        handState.active      = true
        wasPinching           = activePinch
      } else {
        if (wasPinching) handState.snap = true
        lastX               = null
        wasPinching         = false
        handState.active    = false
        handState.activePinch = false
        handState.dx        = 0
      }

      rafId = requestAnimationFrame(detect)
    }

    init()

    return () => {
      cancelAnimationFrame(rafId)
      videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())
      landmarker?.close()
      Object.assign(handState, { dx: 0, snap: false, activePinch: false, active: false })
    }
  }, [])

  return (
    <>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
      <canvas ref={canvasRef} className="hand-canvas" />
    </>
  )
}
