import { useEffect, useRef } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import handState from '../utils/handState'
import '../styles/hand-tracker.css'

const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

// 21개 랜드마크 연결 정의
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],           // 엄지
  [0,5],[5,6],[6,7],[7,8],           // 검지
  [5,9],[9,10],[10,11],[11,12],       // 중지
  [9,13],[13,14],[14,15],[15,16],     // 약지
  [13,17],[0,17],[17,18],[18,19],[19,20], // 새끼
]

const PINCH_THRESH = 0.06  // 핀치 감지 임계값 (정규화 거리)
const HAND_SENS    = 3.5   // 손 이동 → 캐러셀 민감도
const DEAD_ZONE    = 0.003 // 노이즈 제거 데드존

export default function HandTracker() {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    let landmarker = null
    let rafId      = null
    let lastX      = null

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

      // 캔버스 크기를 뷰포트에 맞춤
      const W = canvas.width  = window.innerWidth
      const H = canvas.height = window.innerHeight
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, W, H)

      const result = landmarker.detectForVideo(video, performance.now())

      if (result.landmarks.length > 0) {
        const lm = result.landmarks[0]

        // 정규화 좌표 → 화면 좌표 (X 미러링)
        const pt = i => ({
          x: (1 - lm[i].x) * W,
          y: lm[i].y * H,
        })

        // 스켈레톤 선 그리기 (그리드 톤에 맞춘 얇은 회색)
        ctx.strokeStyle = 'rgba(100,100,100,0.6)'
        ctx.lineWidth   = 1.2
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
          ctx.fillStyle = i === 0
            ? 'rgba(70,70,70,0.9)'   // 손목: 큰 점
            : 'rgba(90,90,90,0.75)'
          ctx.beginPath()
          ctx.arc(p.x, p.y, i === 0 ? 4 : 2, 0, Math.PI * 2)
          ctx.fill()
        }

        // 핀치 감지 (엄지 끝 #4 ↔ 검지 끝 #8)
        const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)
        const isPinching = pinchDist < PINCH_THRESH

        // 핀치 시각화
        if (isPinching) {
          const mid = {
            x: (pt(4).x + pt(8).x) / 2,
            y: (pt(4).y + pt(8).y) / 2,
          }
          ctx.fillStyle = 'rgba(50,50,50,0.95)'
          ctx.beginPath()
          ctx.arc(mid.x, mid.y, 7, 0, Math.PI * 2)
          ctx.fill()
        }

        // handState 업데이트
        handState.active = true
        handState.pinch  = isPinching

        const mirroredX = 1 - lm[0].x
        if (lastX !== null) {
          const dxNorm = mirroredX - lastX
          if (Math.abs(dxNorm) > DEAD_ZONE) {
            handState.dx = dxNorm * HAND_SENS
          }
        }
        lastX = mirroredX
      } else {
        // 손 없음 → 상태 초기화
        handState.active = false
        handState.pinch  = false
        handState.dx     = 0
        lastX            = null
      }

      rafId = requestAnimationFrame(detect)
    }

    init()

    return () => {
      cancelAnimationFrame(rafId)
      videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())
      landmarker?.close()
      handState.active = false
      handState.pinch  = false
      handState.dx     = 0
    }
  }, [])

  return (
    <>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
      <canvas ref={canvasRef} className="hand-canvas" />
    </>
  )
}
