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

const PINCH_THRESH  = 0.06   // 핀치 임계값 (정규화 거리)
const NEUTRAL_ANGLE = 90     // 손 위로 세웠을 때 기준 각도 (도)
const DEAD_ZONE     = 12     // 이 각도 이내는 무시 (중립 구간)
const MAX_TILT      = 65     // 최대 유효 기울기 각도

export default function HandTracker() {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    let landmarker = null
    let rafId      = null

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

        // 미러링 적용 후 스크린 좌표 변환
        const pt = i => ({ x: (1 - lm[i].x) * W, y: lm[i].y * H })

        // 스켈레톤 선
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
          ctx.fillStyle = i === 0 ? 'rgba(70,70,70,0.9)' : 'rgba(90,90,90,0.75)'
          ctx.beginPath()
          ctx.arc(p.x, p.y, i === 0 ? 4 : 2, 0, Math.PI * 2)
          ctx.fill()
        }

        // ── 손 회전 각도 계산 (미러링 공간 기준) ──
        // 손목(0) → 중지 MCP(9) 방향 벡터
        const wristX = 1 - lm[0].x
        const mcp9X  = 1 - lm[9].x
        const angle  = Math.atan2(lm[0].y - lm[9].y, mcp9X - wristX) * (180 / Math.PI)
        // angle ≈ 90° = 손 위로 세움 (중립)
        // angle < 90° = 시계 방향 회전 → 오른쪽 스크롤
        // angle > 90° = 반시계 방향 회전 → 왼쪽 스크롤

        const deviation = angle - NEUTRAL_ANGLE  // 중립에서 벗어난 각도
        const absdev    = Math.abs(deviation)

        let tiltScroll = 0
        if (absdev > DEAD_ZONE) {
          // DEAD_ZONE ~ MAX_TILT 범위를 0 ~ 1로 정규화
          const normalized = Math.min((absdev - DEAD_ZONE) / (MAX_TILT - DEAD_ZONE), 1)
          tiltScroll = -Math.sign(deviation) * normalized
        }

        // 기울기 시각화: 손목 위에 기울기 방향 표시
        if (Math.abs(tiltScroll) > 0) {
          const w0 = pt(0)
          ctx.fillStyle = `rgba(60,60,60,${0.3 + Math.abs(tiltScroll) * 0.5})`
          ctx.font = '12px monospace'
          ctx.fillText(tiltScroll > 0 ? '▶' : '◀', w0.x - 6, w0.y + 20)
        }

        // 핀치 감지
        const pinchDist  = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)
        const isPinching = pinchDist < PINCH_THRESH

        if (isPinching) {
          const mid = { x: (pt(4).x + pt(8).x) / 2, y: (pt(4).y + pt(8).y) / 2 }
          ctx.fillStyle = 'rgba(50,50,50,0.95)'
          ctx.beginPath()
          ctx.arc(mid.x, mid.y, 7, 0, Math.PI * 2)
          ctx.fill()
        }

        handState.active     = true
        handState.tiltScroll = tiltScroll
        handState.pinch      = isPinching
      } else {
        handState.active     = false
        handState.tiltScroll = 0
        handState.pinch      = false
      }

      rafId = requestAnimationFrame(detect)
    }

    init()

    return () => {
      cancelAnimationFrame(rafId)
      videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())
      landmarker?.close()
      handState.active     = false
      handState.tiltScroll = 0
      handState.pinch      = false
    }
  }, [])

  return (
    <>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
      <canvas ref={canvasRef} className="hand-canvas" />
    </>
  )
}
