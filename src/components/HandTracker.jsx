import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import handState from '../utils/handState'
import '../styles/hand-tracker.css'

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[0,17],[17,18],[18,19],[19,20],
]

const SCROLL_RATIO      = 0.33
const SCROLL_HYSTERESIS = 1.30
const ZOOM_RATIO        = 0.20
const INDEX_PINCH_RATIO = 0.25
const HAND_SENS         = 26
const DX_DEAD_ZONE      = 0.002
const ZOOM_SENS         = 2.2
const TAP_THRESHOLD     = 0.04
const BACK_DBL_FRAMES     = 18
const BACK_MOVE_THRESHOLD = 0.04
const FIST_HOLD_FRAMES  = 15
const INACTIVITY_FRAMES = 1800
const FLASH_FRAMES      = 45
const BACK_ZONE_COS     = Math.cos(20 * Math.PI / 180)
const TRI_PINCH_RATIO   = 0.28
const ROT_IMPULSE       = 0.15
const ROT_COOLDOWN      = 22

function isFingersFolded(lm) {
  return lm[12].y > lm[10].y && lm[16].y > lm[14].y && lm[20].y > lm[18].y
}

function isLooseFist(lm) {
  return lm[8].y > lm[6].y && lm[12].y > lm[10].y && lm[16].y > lm[14].y && lm[20].y > lm[18].y
}

function isFistClosed(lm) {
  const hs = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y)
  if (hs < 0.01) return false
  if (lm[8].y > lm[5].y && lm[12].y > lm[9].y &&
      lm[16].y > lm[13].y && lm[20].y > lm[17].y) return true
  if (!isFingersFolded(lm)) return false
  const cx = (lm[0].x + lm[9].x) / 2
  const cy = (lm[0].y + lm[9].y) / 2
  return [8, 12, 16, 20].every(i =>
    Math.hypot(lm[i].x - cx, lm[i].y - cy) / hs < 0.7
  )
}

function analyzeTriPinch(lm, ratio) {
  const handSize = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y, (lm[0].z ?? 0) - (lm[9].z ?? 0))
  if (handSize < 0.01) return false
  const d48  = Math.hypot(lm[4].x - lm[8].x,  lm[4].y - lm[8].y,  (lm[4].z ?? 0) - (lm[8].z  ?? 0))
  const d412 = Math.hypot(lm[4].x - lm[12].x, lm[4].y - lm[12].y, (lm[4].z ?? 0) - (lm[12].z ?? 0))
  return (d48 / handSize) < ratio && (d412 / handSize) < ratio
}

function analyzePinch(lm, tipA, tipB, ratio) {
  const pinchDist = Math.hypot(
    lm[tipA].x - lm[tipB].x, lm[tipA].y - lm[tipB].y,
    (lm[tipA].z ?? 0) - (lm[tipB].z ?? 0)
  )
  const handSize = Math.hypot(
    lm[0].x - lm[9].x, lm[0].y - lm[9].y,
    (lm[0].z ?? 0) - (lm[9].z ?? 0)
  )
  return {
    activePinch: handSize > 0 && (pinchDist / handSize) < ratio,
    midX: (lm[tipA].x + lm[tipB].x) / 2,
    midY: (lm[tipA].y + lm[tipB].y) / 2,
  }
}

function isInHandBackZone(lm, side) {
  const v1x = lm[5].x - lm[0].x, v1y = lm[5].y - lm[0].y, v1z = (lm[5].z ?? 0) - (lm[0].z ?? 0)
  const v2x = lm[17].x - lm[0].x, v2y = lm[17].y - lm[0].y, v2z = (lm[17].z ?? 0) - (lm[0].z ?? 0)
  const nx = v1y * v2z - v1z * v2y
  const ny = v1z * v2x - v1x * v2z
  const nz = v1x * v2y - v1y * v2x
  const mag = Math.hypot(nx, ny, nz)
  if (mag < 0.0001) return false
  return (side === 'Left' ? -nz : nz) / mag > BACK_ZONE_COS
}

function isHandBack(lm, side) {
  const v1x = lm[5].x - lm[0].x, v1y = lm[5].y - lm[0].y
  const v2x = lm[17].x - lm[0].x, v2y = lm[17].y - lm[0].y
  const cross = v1x * v2y - v1y * v2x
  return side === 'Left' ? cross < -0.01 : cross > 0.01
}

function isPalmFacing(lm, side) {
  const v1x = lm[5].x - lm[0].x,  v1y = lm[5].y - lm[0].y
  const v2x = lm[17].x - lm[0].x, v2y = lm[17].y - lm[0].y
  const cross = v1x * v2y - v1y * v2x
  return side === 'Left' ? cross > 0 : cross < 0
}

function isIndexOnly(lm) {
  return lm[8].y < lm[6].y && isFingersFolded(lm)
}

function handRollAngle(lm) {
  return Math.atan2(lm[5].y - lm[17].y, lm[5].x - lm[17].x)
}

function drawHand(lm, ctx, W, H, highlight, isDark, flashColor = null) {
  const ptX = i => (1 - lm[i].x) * W
  const ptY = i => lm[i].y * H
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
  // 21개 연결선 → 단일 path로 묶어 stroke 1회 (GPU 상태 변환 21→1)
  ctx.strokeStyle = stroke
  ctx.lineWidth = highlight ? 1.6 : 1.2
  ctx.beginPath()
  for (const [a, b] of CONNECTIONS) {
    ctx.moveTo(ptX(a), ptY(a)); ctx.lineTo(ptX(b), ptY(b))
  }
  ctx.stroke()
  // 20개 작은 점 → 단일 path로 묶어 fill 1회
  ctx.fillStyle = dot
  ctx.beginPath()
  for (let i = 1; i < 21; i++) {
    const x = ptX(i), y = ptY(i)
    ctx.moveTo(x + 2, y); ctx.arc(x, y, 2, 0, Math.PI * 2)
  }
  ctx.fill()
  // 손목(크기 4)만 별도 처리
  ctx.beginPath(); ctx.arc(ptX(0), ptY(0), 4, 0, Math.PI * 2); ctx.fill()
}

function drawPinchDot(lm, tipA, tipB, ctx, W, H, isDark, colorOverride) {
  const ptX = i => (1 - lm[i].x) * W
  const ptY = i => lm[i].y * H
  const mid = { x: (ptX(tipA) + ptX(tipB)) / 2, y: (ptY(tipA) + ptY(tipB)) / 2 }
  ctx.fillStyle = colorOverride ?? (isDark ? 'rgba(230,230,230,0.95)' : 'rgba(25,25,25,0.95)')
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

// 보관된 drawState + lerp된 lms 좌표로 캔버스에 스켈레톤 렌더링
function drawFrame(ctx, W, H, isDark, lms, ds) {
  if (!ds || !lms || lms.length === 0) return
  const modes = ds.handModes
  for (let i = 0; i < lms.length; i++) {
    const m = modes[i]
    if (m === 'locked')        drawHand(lms[i], ctx, W, H, false, isDark, null)
    else if (m === 'active')   drawHand(lms[i], ctx, W, H, true,  isDark, null)
    else if (m === 'inactive') drawHand(lms[i], ctx, W, H, false, isDark, null)
  }
  if (ds.rotArc) {
    const { handIdx, side } = ds.rotArc
    if (handIdx < lms.length) drawRotationArc(lms[handIdx], ctx, W, H, side, isDark)
  }
  for (const hi of ds.triPinchCircles) {
    if (hi >= lms.length) continue
    const lm = lms[hi]
    const ptX = i => (1 - lm[i].x) * W, ptY = i => lm[i].y * H
    const cx = (ptX(4) + ptX(8) + ptX(12)) / 3, cy = (ptY(4) + ptY(8) + ptY(12)) / 3
    ctx.fillStyle = isDark ? 'rgba(230,230,230,0.92)' : 'rgba(25,25,25,0.92)'
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill()
  }
  const dotPts = []
  for (const dot of ds.pinchDots) {
    if (dot.handIdx >= lms.length) { dotPts.push(null); continue }
    dotPts.push(drawPinchDot(lms[dot.handIdx], dot.a, dot.b, ctx, W, H, isDark, dot.color))
  }
  if (ds.pinchLine && dotPts.length >= 2 && dotPts[0] && dotPts[1]) {
    const sa = ds.pinchLine.showActive
    ctx.strokeStyle = sa ? (isDark ? 'rgba(210,210,210,0.5)' : 'rgba(40,40,40,0.45)')
                         : (isDark ? 'rgba(210,210,210,0.18)' : 'rgba(40,40,40,0.18)')
    ctx.lineWidth = 1; ctx.setLineDash([5, 5])
    ctx.beginPath(); ctx.moveTo(dotPts[0].x, dotPts[0].y); ctx.lineTo(dotPts[1].x, dotPts[1].y); ctx.stroke()
    ctx.setLineDash([])
  }
  if (ds.indexTip) {
    const { handIdx, tapFired } = ds.indexTip
    if (handIdx < lms.length) drawIndexTip(lms[handIdx], ctx, W, H, tapFired, isDark)
  }
}

export default function HandTracker() {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const location    = useLocation()
  const locationRef = useRef(location.pathname)
  locationRef.current = location.pathname

  useEffect(() => {
    let rafId          = null
    let workerReady    = false
    let workerBusy     = false
    let useVideoFrame  = false  // MediaStreamTrackProcessor 파이프라인 활성화 여부
    let videoStream    = null   // 워커 준비 전 스트림 보관용
    let drawState   = null
    let curLms      = null
    let prevLms     = null
    let lmsTime     = 0
    let lmsInterval = 50
    // 보간 프레임마다 랜드마크 객체를 새로 생성하지 않도록 미리 할당
    const lerpBuf = [
      Array.from({length: 21}, () => ({x: 0, y: 0, z: 0})),
      Array.from({length: 21}, () => ({x: 0, y: 0, z: 0})),
    ]

    let lastX              = null
    let wasPinching        = false
    let lastZoomDist       = null
    let wasZoomPinching    = false
    let lastIndexY         = null
    let tapFired           = false
    let frameCount         = 0
    let doubleTapCount     = 0
    let doubleTapFrame     = 0
    let pinchMoveAccum        = 0
    let lastScrollMidY        = null
    let wasBothScrollPinching = false
    let lastTriPinchX = { Left: null, Right: null }

    const rollState = {
      Left:  { lastAngle: null, cumAngle: 0, cooldown: 0, startPalmFacing: null },
      Right: { lastAngle: null, cumAngle: 0, cooldown: 0, startPalmFacing: null },
    }
    const lockState = {
      Left:  { holdFrames: 0, missFrames: 0, cooldown: 0, lastSeenFrame: -INACTIVITY_FRAMES },
      Right: { holdFrames: 0, missFrames: 0, cooldown: 0, lastSeenFrame: -INACTIVITY_FRAMES },
    }

    // OffscreenCanvas — 영상 프레임 캡처용 (메인 스레드에서 한 번 생성)
    const captureCanvas = new OffscreenCanvas(320, 240)
    const captureCtx    = captureCanvas.getContext('2d')

    function resetHandState() {
      handState.active            = false
      handState.activePinch       = false
      handState.dx                = 0
      handState.zoomDelta         = 0
      handState.rotDx             = 0
      handState.dismissActive      = false
      handState.dismissDragXActive = false
      handState.bothZoomActive    = false
      handState.zoomMidY          = 0
    }

    // Worker에서 추론 결과가 도착하면 호출 — 메인 스레드에서 실행되지만 RAF 밖에서 비동기 실행
    function onWorkerResult({ landmarks: lms, handedness }) {
      workerBusy = false
      prevLms = curLms
      const t = performance.now()
      if (lmsTime > 0) lmsInterval = Math.max(16, t - lmsTime)
      lmsTime = t
      curLms    = lms
      drawState = null

      if (lms.length === 0) {
        if (wasPinching) { handState.snap = true; wasPinching = false }
        lastX = null; lastZoomDist = null; lastIndexY = null; tapFired = false; lastScrollMidY = null
        doubleTapCount = 0; pinchMoveAccum = 0; wasBothScrollPinching = false
        lastTriPinchX.Left = null; lastTriPinchX.Right = null
        rollState.Left.lastAngle  = null; rollState.Left.cumAngle  = 0; rollState.Left.startPalmFacing  = null
        rollState.Right.lastAngle = null; rollState.Right.cumAngle = 0; rollState.Right.startPalmFacing = null
        for (const s of ['Left', 'Right']) { lockState[s].holdFrames = 0; lockState[s].missFrames = 0 }
        handState.leftLockProgress = 0; handState.rightLockProgress = 0
        resetHandState()
        return
      }

      // 이번 프레임 드로우 상태 (lerp 가능하도록 인덱스 기반으로 저장)
      const ds = {
        handModes: new Array(lms.length).fill(null),  // 'locked'|'active'|'inactive' per lms index
        triPinchCircles: [],   // 삼지 원 표시 handIdx 목록
        pinchDots: [],         // [{handIdx, a, b, color}]
        pinchLine: null,       // {showActive: bool}
        indexTip: null,        // {handIdx, tapFired}
        rotArc: null,          // {handIdx, side}
      }

      // 잠긴 손 마킹 + 제스처 손 인덱스 추적 (동일 루프)
      const gestureLms = [], gestureHandedness = [], gestureOrigIdx = []
      for (let i = 0; i < lms.length; i++) {
        const side   = handedness[i]?.[0]?.categoryName
        const locked = side === 'Left' ? handState.leftLocked : handState.rightLocked
        if (locked) ds.handModes[i] = 'locked'
        else { gestureLms.push(lms[i]); gestureHandedness.push(handedness[i]); gestureOrigIdx.push(i) }
      }
      const backZoneMask = gestureLms.map((lm, i) => {
        const side = gestureHandedness[i]?.[0]?.categoryName
        return side ? isInHandBackZone(lm, side) : false
      })
      handState.active = gestureLms.some((_, i) => !backZoneMask[i])

      const scrollRatio = SCROLL_RATIO * ((wasPinching || wasBothScrollPinching) ? SCROLL_HYSTERESIS : 1.0)
      const scrollInfos = gestureLms.map((lm, i) => {
        if (backZoneMask[i]) return { activePinch: false, midX: 0, midY: 0 }
        const info = analyzePinch(lm, 4, 12, scrollRatio)
        if (info.activePinch) {
          if (isLooseFist(lm) || isIndexOnly(lm)) info.activePinch = false
          const side = gestureHandedness[i]?.[0]?.categoryName
          if (side && isHandBack(lm, side)) info.activePinch = false
        }
        return info
      })
      const zoomRatio = ZOOM_RATIO * (wasZoomPinching ? SCROLL_HYSTERESIS : 1.0)
      const zoomInfos = gestureLms.map((lm, i) => {
        if (backZoneMask[i]) return { activePinch: false, midX: 0, midY: 0 }
        const info = analyzePinch(lm, 4, 8, zoomRatio)
        if (info.activePinch) {
          if (isLooseFist(lm) || isIndexOnly(lm)) info.activePinch = false
          const side = gestureHandedness[i]?.[0]?.categoryName
          if (side && isHandBack(lm, side)) info.activePinch = false
        }
        return info
      })
      const backInfos = gestureLms.map((lm, i) => {
        if (backZoneMask[i] || isLooseFist(lm) || isIndexOnly(lm))
          return { activePinch: false, midX: 0, midY: 0 }
        return analyzePinch(lm, 4, 8, INDEX_PINCH_RATIO)
      })

      const firstLmFist = gestureLms.find((_, i) => !backZoneMask[i]) ?? null

      const activePinchCountPre = scrollInfos.filter(s => s.activePinch).length
      const triPinchHands = {}
      for (let i = 0; i < gestureLms.length; i++) {
        if (backZoneMask[i]) continue
        const side = gestureHandedness[i]?.[0]?.categoryName
        if (side) triPinchHands[side] = { lm: gestureLms[i], idx: i }
      }
      const rightTriPinch = activePinchCountPre < 2 && !!triPinchHands['Left']  && !isFistClosed(triPinchHands['Left'].lm)  && analyzeTriPinch(triPinchHands['Left'].lm,  TRI_PINCH_RATIO)
      const leftTriPinch  = activePinchCountPre < 2 && !!triPinchHands['Right'] && !isFistClosed(triPinchHands['Right'].lm) && analyzeTriPinch(triPinchHands['Right'].lm, TRI_PINCH_RATIO)
      const anyTriPinch   = rightTriPinch || leftTriPinch

      const anyScrollPinch = scrollInfos.some(s => s.activePinch)
      const bothZoomPinch  = gestureLms.length === 2 && zoomInfos[0].activePinch && zoomInfos[1].activePinch

      frameCount++
      const isSingleZoomPinch = !bothZoomPinch && !anyScrollPinch && backInfos.some(b => b.activePinch)

      handState.indexPinchActive = isSingleZoomPinch
      if (isSingleZoomPinch) {
        const bi = backInfos.findIndex(b => b.activePinch)
        if (bi >= 0) {
          handState.indexPinchMidX = 1 - backInfos[bi].midX
          handState.indexPinchMidY = backInfos[bi].midY
        }
      } else {
        handState.indexPinchMidX = 0
        handState.indexPinchMidY = 0
      }

      for (const side of ['Left', 'Right']) {
        if (rollState[side].cooldown > 0) {
          rollState[side].cooldown--
          if (rollState[side].cooldown === 0) {
            rollState[side].lastAngle = null
            rollState[side].cumAngle  = 0
          }
        }
      }

      if (!anyScrollPinch && !handState.dragging) {
        for (let hi = 0; hi < gestureLms.length; hi++) {
          if (backZoneMask[hi]) continue
          const lm   = gestureLms[hi]
          const side = gestureHandedness[hi]?.[0]?.categoryName
          if (!side || !rollState[side]) continue
          const angle = handRollAngle(lm)
          const rs    = rollState[side]
          if (rs.lastAngle !== null && rs.cooldown === 0) {
            let dAngle = angle - rs.lastAngle
            if (dAngle >  Math.PI) dAngle -= 2 * Math.PI
            if (dAngle < -Math.PI) dAngle += 2 * Math.PI
            if (rs.cumAngle !== 0 && rs.cumAngle * dAngle < 0) {
              rs.cumAngle = 0; rs.startPalmFacing = isPalmFacing(lm, side)
            }
            rs.cumAngle += dAngle
            const FIRE_ANGLE = Math.PI * 75 / 180
            if (Math.abs(rs.cumAngle) > FIRE_ANGLE) {
              if (rs.startPalmFacing) {
                const dir = side === 'Right' ? 1 : -1
                handState.rotDx = dir * ROT_IMPULSE
                rs.cooldown = ROT_COOLDOWN
                ds.rotArc = { handIdx: gestureOrigIdx[hi], side }
              }
              rs.cumAngle = 0; rs.startPalmFacing = null
            }
          }
          if (rs.cooldown === 0) {
            if (rs.lastAngle === null) { rs.startPalmFacing = isPalmFacing(lm, side); rs.cumAngle = 0 }
            rs.lastAngle = angle
          }
        }
      } else {
        for (const side of ['Left', 'Right']) {
          rollState[side].lastAngle = null; rollState[side].cumAngle = 0; rollState[side].startPalmFacing = null
        }
      }

      if (anyTriPinch) {
        if (wasPinching) { handState.snap = true; wasPinching = false }
        lastZoomDist = null; lastScrollMidY = null; lastIndexY = null; tapFired = false
        doubleTapCount = 0; pinchMoveAccum = 0
        handState.activePinch = false; handState.dx = 0; handState.fingerX = -1
        handState.zoomDelta = 0; wasZoomPinching = false; wasBothScrollPinching = false
        handState.dismissDragXActive = true; handState.dismissActive = false

        if (rightTriPinch) {
          const lm = triPinchHands['Left'].lm
          const mx = 1 - lm[0].x
          if (lastTriPinchX.Left !== null) {
            const dx = mx - lastTriPinchX.Left
            if (Math.abs(dx) > DX_DEAD_ZONE) {
              const dirOk = !handState.dismissed
                || (handState.dismissDir === 'right' && dx < 0)
                || (handState.dismissDir === 'left'  && dx > 0)
              if (dirOk) handState.dismissDragX = dx
            }
          }
          lastTriPinchX.Left = mx
          { const _oi = gestureOrigIdx[triPinchHands['Left'].idx]; ds.handModes[_oi] = 'active'; ds.triPinchCircles.push(_oi) }
        } else { lastTriPinchX.Left = null }

        if (leftTriPinch) {
          const lm = triPinchHands['Right'].lm
          const mx = 1 - lm[0].x
          if (lastTriPinchX.Right !== null) {
            const dx = mx - lastTriPinchX.Right
            if (Math.abs(dx) > DX_DEAD_ZONE) {
              const dirOk = !handState.dismissed
                || (handState.dismissDir === 'right' && dx < 0)
                || (handState.dismissDir === 'left'  && dx > 0)
              if (dirOk) handState.dismissDragX = dx
            }
          }
          lastTriPinchX.Right = mx
          { const _oi = gestureOrigIdx[triPinchHands['Right'].idx]; ds.handModes[_oi] = 'active'; ds.triPinchCircles.push(_oi) }
        } else { lastTriPinchX.Right = null }

      } else if (bothZoomPinch) {
        lastTriPinchX.Left = null; lastTriPinchX.Right = null
        handState.dismissDragXActive = false; handState.dismissActive = false
        gestureOrigIdx.forEach(oi => { ds.handModes[oi] = 'active'; ds.pinchDots.push({ handIdx: oi, a: 4, b: 8, color: null }) })
        ds.pinchLine = { showActive: true }
        const zoomDist = Math.hypot(zoomInfos[0].midX - zoomInfos[1].midX, zoomInfos[0].midY - zoomInfos[1].midY)
        if (lastZoomDist !== null) handState.zoomDelta = (zoomDist - lastZoomDist) * ZOOM_SENS
        lastZoomDist = zoomDist
        handState.bothZoomActive = true
        handState.zoomMidY = (zoomInfos[0].midY + zoomInfos[1].midY) / 2
        if (wasPinching) { handState.snap = true }
        wasPinching = false; wasZoomPinching = true; wasBothScrollPinching = false
        doubleTapCount = 0; pinchMoveAccum = 0
        lastX = null; lastScrollMidY = null; lastIndexY = null; tapFired = false
        handState.dx = 0; handState.activePinch = false; handState.fingerX = -1

      } else {
        lastTriPinchX.Left = null; lastTriPinchX.Right = null
        lastZoomDist = null; handState.zoomDelta = 0
        wasZoomPinching = false; handState.bothZoomActive = false; handState.zoomMidY = 0

        const scrollActive     = scrollInfos.findIndex(p => p.activePinch)
        const activePinchCount = scrollInfos.filter(s => s.activePinch).length
        const bothScrollPinch  = gestureLms.length >= 2 && activePinchCount >= 2

        if (bothScrollPinch) {
          const activePinches = scrollInfos.filter(s => s.activePinch)
          const xSpread      = Math.abs(activePinches[0].midX - activePinches[1].midX) > 0.15
          const avgMidY      = (activePinches[0].midY + activePinches[1].midY) / 2
          const inBand       = avgMidY > 0.20 && avgMidY < 0.80
          const dismissValid = xSpread && inBand
          const showActive   = dismissValid || handState.dismissed
          lastIndexY = null; tapFired = false; lastX = null
          if (wasPinching) { handState.snap = true; wasPinching = false }
          wasBothScrollPinching = true
          handState.activePinch = false; handState.dx = 0; handState.fingerX = -1
          handState.dismissActive = showActive; handState.dismissDragXActive = false
          const _showA = showActive
          gestureOrigIdx.forEach(oi => { ds.handModes[oi] = _showA ? 'active' : 'inactive' })
          scrollInfos.forEach((info, j) => { if (info.activePinch) ds.pinchDots.push({ handIdx: gestureOrigIdx[j], a: 4, b: 12, color: null }) })
          if (ds.pinchDots.length >= 2) ds.pinchLine = { showActive: _showA }
          if (lastScrollMidY !== null) {
            const dy = avgMidY - lastScrollMidY
            if (Math.abs(dy) > DX_DEAD_ZONE && (dismissValid || handState.dismissed)) handState.dismissDrag = dy
          }
          lastScrollMidY = avgMidY

        } else {
          lastScrollMidY = null; wasBothScrollPinching = false
          handState.dismissActive = false; handState.dismissDragXActive = false

          const inIndexMode = firstLmFist && scrollActive < 0 && isIndexOnly(firstLmFist) && handState.rotDx === 0
          if (inIndexMode) {
            gestureOrigIdx.forEach((oi, j) => { ds.handModes[oi] = j === 0 ? 'active' : 'inactive' })
            const _firstNB = backZoneMask.findIndex(m => !m)
            if (_firstNB >= 0) ds.indexTip = { handIdx: gestureOrigIdx[_firstNB], tapFired }
            handState.fingerX = 1 - firstLmFist[8].x
            handState.fingerY = firstLmFist[8].y
            const curY = firstLmFist[8].y
            if (lastIndexY !== null) {
              const dy = curY - lastIndexY
              if (dy > TAP_THRESHOLD && !tapFired) {
                handState.click = true; handState.clickX = 1 - firstLmFist[8].x; handState.clickY = firstLmFist[8].y
                tapFired = true
              } else if (dy < -0.01) { tapFired = false }
            }
            lastIndexY = curY
            handState.activePinch = false; handState.dx = 0
            if (wasPinching) { handState.snap = true; wasPinching = false }
            lastX = null

          } else {
            lastIndexY = null; tapFired = false; handState.fingerX = -1
            const _picColor = handState.indexPinchColor
            for (let j = 0; j < gestureLms.length; j++) {
              const oi = gestureOrigIdx[j]
              ds.handModes[oi] = (scrollInfos[j].activePinch || backInfos[j].activePinch) ? 'active' : 'inactive'
              if (scrollInfos[j].activePinch) ds.pinchDots.push({ handIdx: oi, a: 4, b: 12, color: null })
              if (backInfos[j].activePinch)   ds.pinchDots.push({ handIdx: oi, a: 4, b: 8,  color: _picColor })
            }

            const activeLm = scrollActive >= 0 ? gestureLms[scrollActive] : null
            handState.activePinch = !!activeLm
            if (activeLm) {
              const mirroredX = 1 - activeLm[0].x
              if (!wasPinching) pinchMoveAccum = 0
              if (lastX !== null) {
                const raw = mirroredX - lastX
                if (Math.abs(raw) > DX_DEAD_ZONE) { handState.dx = raw * HAND_SENS; pinchMoveAccum += Math.abs(raw) }
                else handState.dx = 0
              }
              lastX = mirroredX
              const sInfo = scrollInfos[scrollActive]
              handState.pinchMidX = 1 - sInfo.midX; handState.pinchMidY = sInfo.midY
            } else {
              if (wasPinching) {
                handState.snap = true
                if (pinchMoveAccum < BACK_MOVE_THRESHOLD) {
                  if (doubleTapCount === 1 && (frameCount - doubleTapFrame) < BACK_DBL_FRAMES) {
                    handState.back = true; doubleTapCount = 0
                  } else { doubleTapCount = 1; doubleTapFrame = frameCount }
                }
                pinchMoveAccum = 0
              }
              if (!wasPinching && doubleTapCount > 0 && (frameCount - doubleTapFrame) > BACK_DBL_FRAMES) doubleTapCount = 0
              lastX = null; handState.dx = 0; handState.pinchMidX = 0; handState.pinchMidY = 0
            }
            wasPinching = !!activeLm
          }
        }
      }

      // ── 손등 주먹 3초 유지 → 잠금 토글 (메인 페이지에서만) ──
      if (locationRef.current !== '/') {
        handState.leftLocked = false; handState.rightLocked = false
        handState.leftLockProgress = 0; handState.rightLockProgress = 0
        for (const side of ['Left', 'Right']) { lockState[side].holdFrames = 0; lockState[side].missFrames = 0 }
      } else {
        for (const side of ['Left', 'Right']) { if (lockState[side].cooldown > 0) lockState[side].cooldown-- }
        for (let hi = 0; hi < lms.length; hi++) {
          const lm   = lms[hi]
          const side = handedness[hi]?.[0]?.categoryName
          if (!side || !lockState[side]) continue
          if (isInHandBackZone(lm, side)) continue
          const ls = lockState[side]
          const key = side === 'Left' ? 'leftLocked' : 'rightLocked'
          ls.lastSeenFrame = frameCount
          const isGesture   = isFistClosed(lm) && isPalmFacing(lm, side)
          const progressKey = side === 'Left' ? 'leftLockProgress' : 'rightLockProgress'
          const flashKey    = side === 'Left' ? 'leftLockFlash'    : 'rightLockFlash'
          if (isGesture && ls.cooldown === 0) {
            ls.holdFrames++; ls.missFrames = 0
            handState[progressKey] = Math.min(ls.holdFrames / FIST_HOLD_FRAMES, 1)
            if (ls.holdFrames >= FIST_HOLD_FRAMES) {
              const nowLocked = !handState[key]
              handState[key] = nowLocked; handState[flashKey] = nowLocked ? 'lock' : 'unlock'
              handState[progressKey] = 0; ls.cooldown = FLASH_FRAMES; ls.holdFrames = 0
            }
          } else {
            ls.missFrames++
            if (ls.missFrames >= 3) { handState[progressKey] = 0; ls.holdFrames = 0; ls.missFrames = 0 }
          }
        }
        for (const side of ['Left', 'Right']) {
          const ls = lockState[side]
          if (ls.lastSeenFrame !== frameCount && ls.holdFrames > 0) {
            ls.missFrames++
            if (ls.missFrames >= 3) {
              const progressKey = side === 'Left' ? 'leftLockProgress' : 'rightLockProgress'
              handState[progressKey] = 0; ls.holdFrames = 0; ls.missFrames = 0
            }
          }
        }
        for (const side of ['Left', 'Right']) {
          const key = side === 'Left' ? 'leftLocked' : 'rightLocked'
          if (!handState[key] && frameCount - lockState[side].lastSeenFrame > INACTIVITY_FRAMES) handState[key] = true
        }
      }

      drawState = ds  // RAF 드로잉에서 사용
    }

    // public/ 경로의 Classic Worker — Vite 변환 없음, importScripts 정상 동작
    const worker = new Worker(import.meta.env.BASE_URL + 'handTracker-worker.js')

    worker.onmessage = (e) => {
      if (e.data.type === 'READY') {
        workerReady = true
        console.log('[HandTracker] Worker ready')
        startVideoFramePipeline()  // 이미 스트림이 있으면 즉시 시작
      } else if (e.data.type === 'RESULT') {
        onWorkerResult(e.data)
      } else if (e.data.type === 'ERROR') {
        console.error('[HandTracker] Worker init error:', e.data.error)
        workerBusy = false
      }
    }

    worker.onerror = (err) => {
      console.error('[HandTracker] Worker error:', err.message, err)
      workerBusy = false
    }

    // VideoFrame 파이프라인 시작 — 워커 준비 후 카메라 스트림을 워커에 직접 전달
    // 워커가 RAF와 무관하게 최신 프레임을 자율적으로 읽어 추론 → 메인→워커 프레임 전달 지연 제거
    function startVideoFramePipeline() {
      if (!videoStream || !workerReady || useVideoFrame) return
      if (typeof MediaStreamTrackProcessor === 'undefined') return
      const track = videoStream.getVideoTracks()[0]
      if (!track) return
      // maxBufferSize:1 — 추론 중 쌓인 프레임은 자동 폐기, reader.read()는 항상 최신 프레임 반환
      const processor = new MediaStreamTrackProcessor({ track, maxBufferSize: 1 })
      worker.postMessage({ type: 'START_STREAM', readable: processor.readable }, [processor.readable])
      useVideoFrame = true
      console.log('[HandTracker] VideoFrame 파이프라인 시작')
    }

    // detect(): 60fps 캔버스 렌더링 + workerBusy 자연 속도 제한
    function detect(ts) {
      rafId = requestAnimationFrame(detect)

      // 60fps 캔버스 렌더링: 이전↔현재 랜드마크 사이를 보간하여 부드러운 스켈레톤
      const canvas = canvasRef.current
      if (canvas) {
        const W = window.innerWidth
        const H = window.innerHeight
        if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, W, H)
        if (drawState && curLms) {
          const isDark = document.documentElement.classList.contains('dark')
          let drawLms = curLms
          if (prevLms && prevLms.length === curLms.length && curLms.length > 0) {
            // +0.5 기저: 검출 파이프라인 지연(~50ms) 보상 — 항상 이전→현재 속도의 50%+ 앞을 예측
            const extraT = Math.min(0.9, (performance.now() - lmsTime) / lmsInterval + 0.5)
            const n = curLms.length
            for (let hi = 0; hi < n; hi++) {
              const cl = curLms[hi], pl = prevLms[hi], buf = lerpBuf[hi]
              for (let i = 0; i < 21; i++) {
                buf[i].x = cl[i].x + (cl[i].x - pl[i].x) * extraT
                buf[i].y = cl[i].y + (cl[i].y - pl[i].y) * extraT
                buf[i].z = cl[i].z + (cl[i].z - pl[i].z) * extraT
              }
            }
            drawLms = n === 1 ? [lerpBuf[0]] : lerpBuf
          }
          drawFrame(ctx, W, H, isDark, drawLms, drawState)
        }
      }

      // VideoFrame 파이프라인 활성화 시 워커가 자율 처리 — 메인 스레드 캡처 불필요
      if (!useVideoFrame) {
        const video = videoRef.current
        if (video && video.readyState >= 2 && workerReady && !workerBusy) {
          captureCtx.drawImage(video, 0, 0, 320, 240)
          const bitmap = captureCanvas.transferToImageBitmap()
          workerBusy = true
          worker.postMessage({ type: 'DETECT', bitmap, timestamp: ts }, [bitmap])
        }
      }
    }

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
        })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        // loadedmetadata 대기 후 play() — AbortError(이중 마운트) 방지
        await new Promise(res => {
          if (videoRef.current.readyState >= 1) return res()
          videoRef.current.addEventListener('loadedmetadata', res, { once: true })
        })
        if (!videoRef.current) return
        await videoRef.current.play()
        videoStream = stream
        startVideoFramePipeline()  // 워커가 이미 준비됐으면 즉시, 아니면 READY 수신 시 시작
        rafId = requestAnimationFrame(detect)
      } catch (err) {
        console.warn('[HandTracker] 카메라 초기화 실패:', err)
      }
    }

    init()

    return () => {
      cancelAnimationFrame(rafId)
      worker.terminate()
      videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())
      Object.assign(handState, {
        dx: 0, snap: false, activePinch: false, active: false,
        zoomDelta: 0, click: false, back: false, rotDx: 0,
        dismissDrag: 0, fingerX: -1, fingerY: 0,
      })
    }
  }, [])

  return (
    <>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
      <canvas ref={canvasRef} className="hand-canvas" />
    </>
  )
}
