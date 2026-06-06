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

const SCROLL_RATIO  = 0.33
const ZOOM_RATIO    = 0.28
const HAND_SENS     = 20
const DX_DEAD_ZONE  = 0.004
const ZOOM_SENS     = 2.2
const TAP_THRESHOLD = 0.04
const FIST_HOLD     = 18

// 회전 감지 파라미터
const ROT_EMA_K    = 0.50   // 각속도 EMA 계수 (0.5 = 빠른 반응)
const ROT_THRESH   = 0.060  // rad/frame — 이 이상만 회전으로 판정 (느린 동작 차단)
const ROT_IMPULSE  = 0.45   // 발동 시 임펄스 속도 (FRIC=0.92 기준 약 5.6 카드 이동)
const ROT_COOLDOWN = 22     // 발동 후 재발동 방지 프레임 (~0.7초 at 30fps)

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

// 손등이 카메라를 향하는지 판별
// 손목(0)→검지MCP(5) 벡터와 손목(0)→소지MCP(17) 벡터의 2D 외적 z 성분
// 오른손 palm facing 시 cross > 0 → back facing 시 cross < 0 (비미러 카메라 좌표계)
// 왼손은 반대
function isBackFacing(lm, side) {
  const v1x = lm[5].x - lm[0].x,  v1y = lm[5].y - lm[0].y
  const v2x = lm[17].x - lm[0].x, v2y = lm[17].y - lm[0].y
  const cross = v1x * v2y - v1y * v2x
  return side === 'Right' ? cross > 0.01 : cross < -0.01
}

// 검지 단독 펴기
function isIndexOnly(lm) {
  return lm[8].y  < lm[6].y
      && lm[12].y > lm[10].y
      && lm[16].y > lm[14].y
      && lm[20].y > lm[18].y
}

// 손바닥 roll 각도: 검지MCP(5) → 소지MCP(17) 벡터의 기울기
function handRollAngle(lm) {
  const dx = lm[5].x - lm[17].x
  const dy = lm[5].y - lm[17].y
  return Math.atan2(dy, dx)   // -π ~ +π
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

// 손목 주변에 회전 방향 호 표시
function drawRotationArc(lm, ctx, W, H, side) {
  const wx = (1 - lm[0].x) * W
  const wy = lm[0].y * H
  const r  = 28
  ctx.strokeStyle = 'rgba(30,30,30,0.6)'
  ctx.lineWidth   = 2
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  if (side === 'Right') {
    ctx.arc(wx, wy, r, -Math.PI * 0.8, Math.PI * 0.4)
  } else {
    ctx.arc(wx, wy, r, -Math.PI * 0.2, Math.PI * 1.2)
  }
  ctx.stroke()
  ctx.setLineDash([])
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
    let fistFrames   = 0

    // 손별 roll 각도 추적 (Left / Right)
    const rollState = {
      Left:  { lastAngle: null, cumAngle: 0, cooldown: 0 },
      Right: { lastAngle: null, cumAngle: 0, cooldown: 0 },
    }

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
      handState.rotDx       = 0
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

      const result     = landmarker.detectForVideo(video, performance.now())
      const lms        = result.landmarks
      const handedness = result.handedness   // [{categoryName:'Left'|'Right', score}][]

      if (lms.length === 0) {
        if (wasPinching) { handState.snap = true; wasPinching = false }
        lastX = null; lastZoomDist = null; lastIndexY = null; tapFired = false
        fistFrames = 0
        rollState.Left.lastAngle  = null; rollState.Left.velEma  = 0
        rollState.Right.lastAngle = null; rollState.Right.velEma = 0
        resetHandState()
        rafId = requestAnimationFrame(detect)
        return
      }

      handState.active = true

      const scrollInfos = lms.map(analyzeScrollPinch)
      const zoomInfos   = lms.map(analyzeZoomPinch)

      // ── 주먹 지속 감지 → 뒤로 가기 ──
      const firstLmFist = lms[0]
      const isFistNow   = firstLmFist[8].y  > firstLmFist[6].y
                       && firstLmFist[12].y > firstLmFist[10].y
                       && firstLmFist[16].y > firstLmFist[14].y
                       && firstLmFist[20].y > firstLmFist[18].y
      if (isFistNow) {
        fistFrames++
        if (fistFrames === FIST_HOLD) { handState.back = true }
      } else {
        fistFrames = 0
      }

      // ── 손 회전 감지 ──
      const anyScrollPinch = scrollInfos.some(s => s.activePinch)
      const bothZoomPinch  = lms.length === 2 && zoomInfos[0].activePinch && zoomInfos[1].activePinch

      // 쿨다운 카운트다운 — 만료 시 lastAngle 초기화해 누적 각도 오차 방지
      for (const side of ['Left', 'Right']) {
        if (rollState[side].cooldown > 0) {
          rollState[side].cooldown--
          if (rollState[side].cooldown === 0) {
            rollState[side].lastAngle = null
            rollState[side].cumAngle  = 0
          }
        }
      }

      // 스크롤 핀치 또는 드래그 중에는 회전 차단
      if (!anyScrollPinch && !handState.dragging) {
        for (let hi = 0; hi < lms.length; hi++) {
          const lm   = lms[hi]
          const side = handedness[hi]?.[0]?.categoryName
          if (!side || !rollState[side]) continue

          const angle = handRollAngle(lm)
          const rs    = rollState[side]

          if (rs.lastAngle !== null && rs.cooldown === 0) {
            let dAngle = angle - rs.lastAngle
            if (dAngle >  Math.PI) dAngle -= 2 * Math.PI
            if (dAngle < -Math.PI) dAngle += 2 * Math.PI

            // 누적 각도 — 방향 바뀌면 리셋 (의도적 회전만 누적)
            if (rs.cumAngle !== 0 && rs.cumAngle * dAngle < 0) rs.cumAngle = 0
            rs.cumAngle += dAngle

            // 누적 75° 이상 → 임펄스 발동
            const FIRE_ANGLE = Math.PI * 75 / 180
            if (Math.abs(rs.cumAngle) > FIRE_ANGLE) {
              const dir = side === 'Right' ? 1 : -1
              handState.rotDx = dir * ROT_IMPULSE
              rs.cooldown = ROT_COOLDOWN
              rs.cumAngle = 0
              drawRotationArc(lm, ctx, W, H, side)
            }
          }

          if (rs.cooldown === 0) rs.lastAngle = angle
        }
      } else {
        for (const side of ['Left', 'Right']) {
          rollState[side].lastAngle = null
          rollState[side].cumAngle  = 0
        }
      }

      // ── 양손 엄지+검지 핀치 → 줌 모드 ──
      if (bothZoomPinch) {
        lms.forEach(lm => drawHand(lm, ctx, W, H, true))
        const p0 = drawPinchDot(lms[0], 4, 8, ctx, W, H)
        const p1 = drawPinchDot(lms[1], 4, 8, ctx, W, H)

        const isDark = document.documentElement.classList.contains('dark')
        ctx.strokeStyle = isDark ? 'rgba(210,210,210,0.5)' : 'rgba(40,40,40,0.45)'
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

        // ── 검지 단독 → 탭 클릭 ──
        const inIndexMode = scrollActive < 0 && isIndexOnly(firstLmFist) && handState.rotDx === 0

        if (inIndexMode) {
          lms.forEach((lm, i) => drawHand(lm, ctx, W, H, i === 0))
          drawIndexTip(firstLmFist, ctx, W, H, tapFired)

          const curY = firstLmFist[8].y
          if (lastIndexY !== null) {
            const dy = curY - lastIndexY
            if (dy > TAP_THRESHOLD && !tapFired) {
              handState.click = true
              tapFired = true
            } else if (dy < -0.01) {
              tapFired = false
            }
          }
          lastIndexY = curY

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
      Object.assign(handState, { dx: 0, snap: false, activePinch: false, active: false, zoomDelta: 0, click: false, back: false, rotDx: 0 })
    }
  }, [])

  return (
    <>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
      <canvas ref={canvasRef} className="hand-canvas" />
    </>
  )
}
