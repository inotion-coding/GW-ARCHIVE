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
const BACK_RATIO    = 0.17   // 뒤로가기 더블탭: 정밀 접촉만 허용
const HAND_SENS     = 20
const DX_DEAD_ZONE  = 0.004
const ZOOM_SENS     = 2.2
const TAP_THRESHOLD = 0.04
const DB_TAP_WINDOW   = 25    // 더블탭 인식 시간 창 (프레임, ~0.8초 at 30fps)
const FIST_HOLD_FRAMES  = 30    // 주먹 유지 필요 프레임 (~1초 at 30fps)
const INACTIVITY_FRAMES = 1800  // 자동 잠금 비활성 프레임 (~60초 at 30fps)
const FLASH_FRAMES      = 45    // 색상 플래시 지속 프레임 (~1.5초)

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

function drawHand(lm, ctx, W, H, highlight, isDark, flashColor = null) {
  const pt = i => ({ x: (1 - lm[i].x) * W, y: lm[i].y * H })
  let stroke, dot
  if (flashColor === 'green') {
    stroke = 'rgba(80,220,120,0.92)'; dot = 'rgba(100,240,140,0.96)'
  } else if (flashColor === 'red') {
    stroke = 'rgba(220,70,70,0.92)';  dot = 'rgba(240,100,100,0.96)'
  } else {
    stroke = isDark
      ? (highlight ? 'rgba(220,220,220,0.85)' : 'rgba(160,160,160,0.55)')
      : (highlight ? 'rgba(55,55,55,0.8)'     : 'rgba(110,110,110,0.5)')
    dot = isDark
      ? (highlight ? 'rgba(230,230,230,0.95)' : 'rgba(150,150,150,0.75)')
      : (highlight ? 'rgba(45,45,45,0.9)'     : 'rgba(100,100,100,0.7)')
  }
  ctx.strokeStyle = stroke
  ctx.lineWidth = highlight ? 1.6 : 1.2
  for (const [a, b] of CONNECTIONS) {
    const pa = pt(a), pb = pt(b)
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke()
  }
  for (let i = 0; i < 21; i++) {
    const p = pt(i)
    ctx.fillStyle = dot
    ctx.beginPath(); ctx.arc(p.x, p.y, i === 0 ? 4 : 2, 0, Math.PI * 2); ctx.fill()
  }
}


function drawPinchDot(lm, tipA, tipB, ctx, W, H, isDark) {
  const ptX = i => (1 - lm[i].x) * W
  const ptY = i => lm[i].y * H
  const mid = { x: (ptX(tipA) + ptX(tipB)) / 2, y: (ptY(tipA) + ptY(tipB)) / 2 }
  ctx.fillStyle = isDark ? 'rgba(230,230,230,0.95)' : 'rgba(25,25,25,0.95)'
  ctx.beginPath(); ctx.arc(mid.x, mid.y, 7, 0, Math.PI * 2); ctx.fill()
  return mid
}

function drawIndexTip(lm, ctx, W, H, active, isDark) {
  const x = (1 - lm[8].x) * W
  const y = lm[8].y * H
  ctx.fillStyle = isDark
    ? (active ? 'rgba(255,255,255,0.95)' : 'rgba(200,200,200,0.7)')
    : (active ? 'rgba(0,0,0,0.9)'        : 'rgba(60,60,60,0.65)')
  ctx.beginPath(); ctx.arc(x, y, active ? 10 : 6, 0, Math.PI * 2); ctx.fill()
}

// 손목 주변에 회전 방향 호 표시
function drawRotationArc(lm, ctx, W, H, side, isDark) {
  const wx = (1 - lm[0].x) * W
  const wy = lm[0].y * H
  const r  = 28
  ctx.strokeStyle = isDark ? 'rgba(200,200,200,0.6)' : 'rgba(30,30,30,0.6)'
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
    let lastX           = null
    let wasPinching     = false
    let lastZoomDist    = null
    let lastIndexY      = null
    let tapFired        = false
    let frameCount      = 0
    let doubleTapCount  = 0
    let doubleTapFrame  = 0
    let wasBackPinching = false

    // 손별 roll 각도 추적 (Left / Right)
    const rollState = {
      Left:  { lastAngle: null, cumAngle: 0, cooldown: 0 },
      Right: { lastAngle: null, cumAngle: 0, cooldown: 0 },
    }

    // 손별 잠금 제스처 상태
    const lockState = {
      Left:  { holdFrames: 0, flashFrames: 0, flashColor: null, lastSeenFrame: -INACTIVITY_FRAMES },
      Right: { holdFrames: 0, flashFrames: 0, flashColor: null, lastSeenFrame: -INACTIVITY_FRAMES },
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
      const isDark = document.documentElement.classList.contains('dark')

      const result     = landmarker.detectForVideo(video, performance.now())
      const lms        = result.landmarks
      const handedness = result.handedness   // [{categoryName:'Left'|'Right', score}][]

      if (lms.length === 0) {
        if (wasPinching) { handState.snap = true; wasPinching = false }
        lastX = null; lastZoomDist = null; lastIndexY = null; tapFired = false
        doubleTapCount = 0; wasBackPinching = false
        rollState.Left.lastAngle  = null; rollState.Left.velEma  = 0
        rollState.Right.lastAngle = null; rollState.Right.velEma = 0
        for (const s of ['Left', 'Right']) { lockState[s].holdFrames = 0 }
        resetHandState()
        rafId = requestAnimationFrame(detect)
        return
      }

      // 잠금 해제된 손만 제스처에 사용 — 잠금된 손은 시퀀스 감지에만 참여
      const gestureLms = [], gestureHandedness = []
      for (let i = 0; i < lms.length; i++) {
        const side   = handedness[i]?.[0]?.categoryName
        const locked = side === 'Left' ? handState.leftLocked : handState.rightLocked
        if (!locked) { gestureLms.push(lms[i]); gestureHandedness.push(handedness[i]) }
      }
      handState.active = gestureLms.length > 0

      // 잠금된 손 스켈레톤 (플래시 중이면 색상, 아니면 흐릿하게)
      for (let i = 0; i < lms.length; i++) {
        const side   = handedness[i]?.[0]?.categoryName
        const locked = side === 'Left' ? handState.leftLocked : handState.rightLocked
        const flash  = side && lockState[side].flashFrames > 0 ? lockState[side].flashColor : null
        if (locked) drawHand(lms[i], ctx, W, H, false, isDark, flash)
      }

      const scrollInfos = gestureLms.map(analyzeScrollPinch)
      const zoomInfos   = gestureLms.map(analyzeZoomPinch)
      // 제스처 손의 플래시 색상 조회
      const gestureFlashOf = i => {
        const side = gestureHandedness[i]?.[0]?.categoryName
        return side && lockState[side].flashFrames > 0 ? lockState[side].flashColor : null
      }
      const backInfos   = gestureLms.map(lm => {
        const isFist    = lm[12].y > lm[10].y && lm[16].y > lm[14].y && lm[20].y > lm[18].y
        const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)
        const handSize  = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y)
        return { activePinch: !isFist && handSize > 0 && (pinchDist / handSize) < BACK_RATIO }
      })

      const firstLmFist = gestureLms[0]

      // ── 손 회전 감지 ──
      const anyScrollPinch = scrollInfos.some(s => s.activePinch)
      const bothZoomPinch  = gestureLms.length === 2 && zoomInfos[0].activePinch && zoomInfos[1].activePinch

      // ── 엄지+검지 더블탭 (단일 손, 잠금 해제) → 뒤로 가기 ──
      frameCount++
      const isSingleZoomPinch = !bothZoomPinch && !anyScrollPinch && backInfos.some(b => b.activePinch)
      if (isSingleZoomPinch && !wasBackPinching) {
        if (doubleTapCount === 1 && (frameCount - doubleTapFrame) < DB_TAP_WINDOW) {
          handState.back = true
          doubleTapCount = 0
        } else {
          doubleTapCount = 1
          doubleTapFrame = frameCount
        }
      } else if (!isSingleZoomPinch && doubleTapCount > 0 && (frameCount - doubleTapFrame) > DB_TAP_WINDOW * 2) {
        doubleTapCount = 0
      }
      wasBackPinching = isSingleZoomPinch

      // 쿨다운 카운트다운
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
        for (let hi = 0; hi < gestureLms.length; hi++) {
          const lm   = gestureLms[hi]
          const side = gestureHandedness[hi]?.[0]?.categoryName
          if (!side || !rollState[side]) continue

          const angle = handRollAngle(lm)
          const rs    = rollState[side]

          if (rs.lastAngle !== null && rs.cooldown === 0) {
            let dAngle = angle - rs.lastAngle
            if (dAngle >  Math.PI) dAngle -= 2 * Math.PI
            if (dAngle < -Math.PI) dAngle += 2 * Math.PI

            if (rs.cumAngle !== 0 && rs.cumAngle * dAngle < 0) rs.cumAngle = 0
            rs.cumAngle += dAngle

            const FIRE_ANGLE = Math.PI * 75 / 180
            if (Math.abs(rs.cumAngle) > FIRE_ANGLE) {
              const dir = side === 'Right' ? 1 : -1
              handState.rotDx = dir * ROT_IMPULSE
              rs.cooldown = ROT_COOLDOWN
              rs.cumAngle = 0
              drawRotationArc(lm, ctx, W, H, side, isDark)
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
        gestureLms.forEach((lm, i) => drawHand(lm, ctx, W, H, true, isDark, gestureFlashOf(i)))
        const p0 = drawPinchDot(gestureLms[0], 4, 8, ctx, W, H, isDark)
        const p1 = drawPinchDot(gestureLms[1], 4, 8, ctx, W, H, isDark)

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
        const inIndexMode = firstLmFist && scrollActive < 0 && isIndexOnly(firstLmFist) && handState.rotDx === 0

        if (inIndexMode) {
          gestureLms.forEach((lm, i) => drawHand(lm, ctx, W, H, i === 0, isDark, gestureFlashOf(i)))
          drawIndexTip(firstLmFist, ctx, W, H, tapFired, isDark)

          const curY = firstLmFist[8].y
          if (lastIndexY !== null) {
            const dy = curY - lastIndexY
            if (dy > TAP_THRESHOLD && !tapFired) {
              handState.click  = true
              handState.clickX = 1 - firstLmFist[8].x
              handState.clickY = firstLmFist[8].y
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

          gestureLms.forEach((lm, i) => drawHand(lm, ctx, W, H, scrollInfos[i].activePinch || backInfos[i].activePinch, isDark, gestureFlashOf(i)))
          scrollInfos.forEach((info, i) => {
            if (info.activePinch) drawPinchDot(gestureLms[i], 4, 12, ctx, W, H, isDark)
          })
          backInfos.forEach((info, i) => {
            if (info.activePinch) drawPinchDot(gestureLms[i], 4, 8, ctx, W, H, isDark)
          })

          const activeLm = scrollActive >= 0 ? gestureLms[scrollActive] : null
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

      // ── 손등 주먹 3초 유지 → 잠금 토글 ──

      // 플래시 카운트다운
      for (const side of ['Left', 'Right']) {
        if (lockState[side].flashFrames > 0) lockState[side].flashFrames--
      }

      for (let hi = 0; hi < lms.length; hi++) {
        const lm   = lms[hi]
        const side = handedness[hi]?.[0]?.categoryName
        if (!side || !lockState[side]) continue

        const ls  = lockState[side]
        const key = side === 'Left' ? 'leftLocked' : 'rightLocked'
        ls.lastSeenFrame = frameCount

        // 주먹(4손가락 모두 접힘) + 손등이 카메라를 향함
        const isFist    = lm[8].y  > lm[6].y
                       && lm[12].y > lm[10].y
                       && lm[16].y > lm[14].y
                       && lm[20].y > lm[18].y
        const isGesture = isFist && !isBackFacing(lm, side)  // 손바닥이 카메라를 향함

        if (isGesture && ls.flashFrames === 0) {
          ls.holdFrames++
          if (ls.holdFrames >= FIST_HOLD_FRAMES) {
            const nowLocked = !handState[key]
            handState[key]  = nowLocked
            ls.flashColor   = nowLocked ? 'red' : 'green'
            ls.flashFrames  = FLASH_FRAMES
            ls.holdFrames   = 0
          }
        } else {
          ls.holdFrames = 0
        }
      }

      // 비활성 자동 잠금 (1분간 손 미감지)
      for (const side of ['Left', 'Right']) {
        const key = side === 'Left' ? 'leftLocked' : 'rightLocked'
        if (!handState[key] && frameCount - lockState[side].lastSeenFrame > INACTIVITY_FRAMES) {
          handState[key] = true
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
