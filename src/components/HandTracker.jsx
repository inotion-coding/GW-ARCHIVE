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

const SCROLL_RATIO      = 0.33
const SCROLL_HYSTERESIS = 1.30  // 핀치 유지 임계값 배율 (0.33 → 0.43)
const ZOOM_RATIO    = 0.20
const BACK_RATIO    = 0.25   // 뒤로가기 더블탭
const HAND_SENS     = 26
const DX_DEAD_ZONE  = 0.002
const ZOOM_SENS     = 2.2
const TAP_THRESHOLD = 0.04
const DB_TAP_WINDOW   = 9     // 더블탭 인식 시간 창 (프레임, ~0.3초 at 30fps)
const FIST_HOLD_FRAMES  = 15    // 주먹 유지 필요 프레임 (~0.5초 at 30fps)
const INACTIVITY_FRAMES = 1800  // 자동 잠금 비활성 프레임 (~60초 at 30fps)
const FLASH_FRAMES      = 45    // 색상 플래시 지속 프레임 (~1.5초)
const BACK_ZONE_COS     = Math.cos(20 * Math.PI / 180)  // 손등 기준 ±20° 차단 (cos20° ≈ 0.940)
const TRI_PINCH_RATIO   = 0.28   // 엄지+검지+중지 3핀치 임계 비율

// 회전 감지 파라미터
const ROT_IMPULSE  = 0.45   // 발동 시 임펄스 속도 (FRIC=0.92 기준 약 5.6 카드 이동)
const ROT_COOLDOWN = 22     // 발동 후 재발동 방지 프레임 (~0.7초 at 30fps)

// 중지·약지·소지가 접혀 있는지 (검지 제외 주먹 판별)
function isFingersFolded(lm) {
  return lm[12].y > lm[10].y && lm[16].y > lm[14].y && lm[20].y > lm[18].y
}

// 느슨한 주먹 — 4손가락 끝이 모두 PIP 관절보다 낮은 위치 (isFistClosed보다 관대)
function isLooseFist(lm) {
  return lm[8].y > lm[6].y &&   // 검지 끝 < PIP
         lm[12].y > lm[10].y &&  // 중지 끝 < PIP
         lm[16].y > lm[14].y &&  // 약지 끝 < PIP
         lm[20].y > lm[18].y     // 소지 끝 < PIP
}

// 완전한 주먹 (잠금 제스처)
// 옆면: 4손가락 끝이 MCP(뿌리 관절)보다 아래 — PIP보다 훨씬 엄격
// 앞면: isFingersFolded + 끝마디-손바닥 중심 거리 비율 < 0.7
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

// 엄지(4)+검지(8)+중지(12) 3핀치 — 세 거리가 모두 handSize 대비 ratio 미만일 때 활성
function analyzeTriPinch(lm, ratio) {
  const handSize = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y, (lm[0].z ?? 0) - (lm[9].z ?? 0))
  if (handSize < 0.01) return false
  const d48  = Math.hypot(lm[4].x - lm[8].x,  lm[4].y - lm[8].y,  (lm[4].z ?? 0) - (lm[8].z  ?? 0))
  const d412 = Math.hypot(lm[4].x - lm[12].x, lm[4].y - lm[12].y, (lm[4].z ?? 0) - (lm[12].z ?? 0))
  return (d48 / handSize) < ratio && (d412 / handSize) < ratio
}

// 통합 핀치 분석: tipA·tipB 두 랜드마크 간 거리 비율 측정 (3D 거리로 각도 안정성 확보)
function analyzePinch(lm, tipA, tipB, ratio) {
  const pinchDist = Math.hypot(
    lm[tipA].x - lm[tipB].x,
    lm[tipA].y - lm[tipB].y,
    (lm[tipA].z ?? 0) - (lm[tipB].z ?? 0)
  )
  const handSize = Math.hypot(
    lm[0].x - lm[9].x,
    lm[0].y - lm[9].y,
    (lm[0].z ?? 0) - (lm[9].z ?? 0)
  )
  return {
    activePinch: handSize > 0 && (pinchDist / handSize) < ratio,
    midX: (lm[tipA].x + lm[tipB].x) / 2,
    midY: (lm[tipA].y + lm[tipB].y) / 2,
  }
}

// 손등 완벽 기준 ±20° 이내 → true (모든 제스처 차단)
// 손바닥 법선(3D 외적)의 카메라 방향 성분으로 각도 판별
function isInHandBackZone(lm, side) {
  const v1x = lm[5].x - lm[0].x, v1y = lm[5].y - lm[0].y, v1z = (lm[5].z ?? 0) - (lm[0].z ?? 0)
  const v2x = lm[17].x - lm[0].x, v2y = lm[17].y - lm[0].y, v2z = (lm[17].z ?? 0) - (lm[0].z ?? 0)
  const nx = v1y * v2z - v1z * v2y
  const ny = v1z * v2x - v1x * v2z
  const nz = v1x * v2y - v1y * v2x
  const mag = Math.hypot(nx, ny, nz)
  if (mag < 0.0001) return false
  // 'Left'(사용자 오른손): 손등 방향 법선 nz < 0 → -nz > 0
  // 'Right'(사용자 왼손): 손등 방향 법선 nz > 0
  return (side === 'Left' ? -nz : nz) / mag > BACK_ZONE_COS
}

// 손등이 명확히 카메라를 향할 때만 true — 측면 뷰(cross ≈ 0)는 허용
function isHandBack(lm, side) {
  const v1x = lm[5].x - lm[0].x, v1y = lm[5].y - lm[0].y
  const v2x = lm[17].x - lm[0].x, v2y = lm[17].y - lm[0].y
  const cross = v1x * v2y - v1y * v2x
  return side === 'Left' ? cross < -0.01 : cross > 0.01
}

// 손바닥이 카메라를 향하는지 판별
// MediaPipe는 user-facing 카메라에서 좌우 레이블을 미러 기준으로 매김:
//   MediaPipe 'Right' = 카메라 이미지 오른쪽 = 사용자 실제 왼손
// 따라서 실제 사용자 오른손(MediaPipe 'Left')에서 손바닥 방향: cross > 0
function isPalmFacing(lm, side) {
  const v1x = lm[5].x - lm[0].x,  v1y = lm[5].y - lm[0].y
  const v2x = lm[17].x - lm[0].x, v2y = lm[17].y - lm[0].y
  const cross = v1x * v2y - v1y * v2x
  return side === 'Left' ? cross > 0 : cross < 0
}

// 검지만 펴고 나머지 접힘
function isIndexOnly(lm) {
  return lm[8].y < lm[6].y && isFingersFolded(lm)
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
    let lastDetectMs = 0          // 30fps 스로틀용
    let lastX           = null
    let wasPinching     = false
    let lastZoomDist    = null
    let wasZoomPinching = false
    let lastIndexY      = null
    let tapFired        = false
    let frameCount      = 0
    let doubleTapCount  = 0
    let doubleTapFrame  = 0
    let wasBackPinching      = false
    let lastScrollMidY       = null   // 양손 수직 드래그 추적용
    let wasBothScrollPinching = false // 양손 핀치 히스테리시스용
    let lastTriPinchX = { Left: null, Right: null } // 3핀치 손목 X 추적 (수평 드래그용)

    // 손별 roll 각도 추적 (Left / Right)
    const rollState = {
      Left:  { lastAngle: null, cumAngle: 0, cooldown: 0, startPalmFacing: null },
      Right: { lastAngle: null, cumAngle: 0, cooldown: 0, startPalmFacing: null },
    }

    // 손별 잠금 제스처 상태
    const lockState = {
      Left:  { holdFrames: 0, missFrames: 0, cooldown: 0, lastSeenFrame: -INACTIVITY_FRAMES },
      Right: { holdFrames: 0, missFrames: 0, cooldown: 0, lastSeenFrame: -INACTIVITY_FRAMES },
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
      handState.active            = false
      handState.activePinch       = false
      handState.dx                = 0
      handState.zoomDelta         = 0
      handState.rotDx             = 0
      handState.dismissActive      = false
      handState.dismissDragXActive = false
    }

    function detect(ts) {
      rafId = requestAnimationFrame(detect)
      // 30fps 캡: MediaPipe 추론 빈도를 절반으로 줄여 노트북 부하 감소
      if (ts - lastDetectMs < 33) return
      lastDetectMs = ts

      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || !landmarker || video.readyState < 2) return

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
        lastX = null; lastZoomDist = null; lastIndexY = null; tapFired = false; lastScrollMidY = null
        doubleTapCount = 0; wasBackPinching = false; wasBothScrollPinching = false
        lastTriPinchX.Left = null; lastTriPinchX.Right = null
        rollState.Left.lastAngle  = null; rollState.Left.cumAngle  = 0; rollState.Left.startPalmFacing  = null
        rollState.Right.lastAngle = null; rollState.Right.cumAngle = 0; rollState.Right.startPalmFacing = null
        for (const s of ['Left', 'Right']) {
          lockState[s].holdFrames = 0
          lockState[s].missFrames = 0
        }
        handState.leftLockProgress  = 0
        handState.rightLockProgress = 0
        resetHandState()
        return
      }

      // 잠금 해제된 손만 제스처에 사용 — 잠금된 손은 시퀀스 감지에만 참여
      const gestureLms = [], gestureHandedness = []
      for (let i = 0; i < lms.length; i++) {
        const side   = handedness[i]?.[0]?.categoryName
        const locked = side === 'Left' ? handState.leftLocked : handState.rightLocked
        if (!locked) { gestureLms.push(lms[i]); gestureHandedness.push(handedness[i]) }
      }
      // 손등 ±20° 마스크 — true인 손은 모든 제스처 비활성
      const backZoneMask = gestureLms.map((lm, i) => {
        const side = gestureHandedness[i]?.[0]?.categoryName
        return side ? isInHandBackZone(lm, side) : false
      })
      handState.active = gestureLms.some((_, i) => !backZoneMask[i])

      // 잠금된 손 스켈레톤 (흐릿하게만, 색상 플래시 없음)
      for (let i = 0; i < lms.length; i++) {
        const side   = handedness[i]?.[0]?.categoryName
        const locked = side === 'Left' ? handState.leftLocked : handState.rightLocked
        if (locked) drawHand(lms[i], ctx, W, H, false, isDark, null)
      }

      // 히스테리시스: 이전 프레임에 핀치 중이었으면 더 넓은 임계값으로 유지
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
        return analyzePinch(lm, 4, 8, BACK_RATIO)
      })

      const firstLmFist = gestureLms.find((_, i) => !backZoneMask[i]) ?? null

      // ── 3핀치 (엄지+검지+중지) 감지 — 손별로 분류 ──
      // 양손 수직 dismiss(bothScrollPinch) 중에는 triPinch 차단 (수직 제스처 간섭 방지)
      const activePinchCountPre = scrollInfos.filter(s => s.activePinch).length
      const triPinchHands = {}  // { 'Left': {lm, idx}, 'Right': {lm, idx} }
      for (let i = 0; i < gestureLms.length; i++) {
        if (backZoneMask[i]) continue
        const side = gestureHandedness[i]?.[0]?.categoryName
        if (side) triPinchHands[side] = { lm: gestureLms[i], idx: i }
      }
      const rightTriPinch = activePinchCountPre < 2 && !!triPinchHands['Left']  && analyzeTriPinch(triPinchHands['Left'].lm,  TRI_PINCH_RATIO)
      const leftTriPinch  = activePinchCountPre < 2 && !!triPinchHands['Right'] && analyzeTriPinch(triPinchHands['Right'].lm, TRI_PINCH_RATIO)
      const anyTriPinch   = rightTriPinch || leftTriPinch

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

      // 단일 엄지+검지 핀치 중심 노출 (캘린더 날짜 선택용)
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

            // 방향 전환: 누적 리셋 + 현재 손 방향을 새 기준점으로
            if (rs.cumAngle !== 0 && rs.cumAngle * dAngle < 0) {
              rs.cumAngle = 0
              rs.startPalmFacing = isPalmFacing(lm, side)
            }
            rs.cumAngle += dAngle

            const FIRE_ANGLE = Math.PI * 75 / 180
            if (Math.abs(rs.cumAngle) > FIRE_ANGLE) {
              // 손바닥→손등 방향에서 시작한 회전만 허용
              if (rs.startPalmFacing) {
                const dir = side === 'Right' ? 1 : -1
                handState.rotDx = dir * ROT_IMPULSE
                rs.cooldown = ROT_COOLDOWN
                drawRotationArc(lm, ctx, W, H, side, isDark)
              }
              rs.cumAngle = 0
              rs.startPalmFacing = null
            }
          }

          if (rs.cooldown === 0) {
            if (rs.lastAngle === null) {
              rs.startPalmFacing = isPalmFacing(lm, side)  // 추적 시작 시 초기 방향 기록
              rs.cumAngle = 0
            }
            rs.lastAngle = angle
          }
        }
      } else {
        for (const side of ['Left', 'Right']) {
          rollState[side].lastAngle      = null
          rollState[side].cumAngle       = 0
          rollState[side].startPalmFacing = null
        }
      }

      // ── 단일 손 엄지+검지+중지 3핀치 → 좌우 dismiss ──
      if (anyTriPinch) {
        if (wasPinching) { handState.snap = true; wasPinching = false }
        lastZoomDist = null; lastScrollMidY = null; lastIndexY = null; tapFired = false
        handState.activePinch = false; handState.dx = 0; handState.fingerX = -1
        handState.zoomDelta = 0; wasZoomPinching = false; wasBothScrollPinching = false
        handState.dismissDragXActive = true
        handState.dismissActive      = false

        // 오른손(MediaPipe 'Left') — 좌·우 양방향 허용
        if (rightTriPinch) {
          const lm = triPinchHands['Left'].lm
          const mx = 1 - lm[0].x  // 미러 보정 손목 X
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
          drawHand(lm, ctx, W, H, true, isDark, null)
          drawPinchDot(lm, 4, 8,  ctx, W, H, isDark)
          drawPinchDot(lm, 4, 12, ctx, W, H, isDark)
        } else {
          lastTriPinchX.Left = null
        }

        // 왼손(MediaPipe 'Right') — 좌·우 양방향 허용
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
          drawHand(lm, ctx, W, H, true, isDark, null)
          drawPinchDot(lm, 4, 8,  ctx, W, H, isDark)
          drawPinchDot(lm, 4, 12, ctx, W, H, isDark)
        } else {
          lastTriPinchX.Right = null
        }

      // ── 양손 엄지+검지 핀치 → 줌 모드 ──
      } else if (bothZoomPinch) {
        lastTriPinchX.Left = null; lastTriPinchX.Right = null
        handState.dismissDragXActive = false
        handState.dismissActive      = false
        gestureLms.forEach((lm, i) => drawHand(lm, ctx, W, H, true, isDark, null))
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
        wasPinching = false; wasZoomPinching = true; wasBothScrollPinching = false
        lastX = null; lastScrollMidY = null; lastIndexY = null; tapFired = false
        handState.dx = 0; handState.activePinch = false; handState.fingerX = -1

      } else {
        lastTriPinchX.Left = null; lastTriPinchX.Right = null
        lastZoomDist        = null
        handState.zoomDelta = 0
        wasZoomPinching     = false

        const scrollActive     = scrollInfos.findIndex(p => p.activePinch)
        const activePinchCount = scrollInfos.filter(s => s.activePinch).length
        const bothScrollPinch  = gestureLms.length >= 2 && activePinchCount >= 2

        if (bothScrollPinch) {
          // ── 양손 엄지+중지 핀치 → 카드 수직 드래그 (dismiss / restore) ──
          const activePinches = scrollInfos.filter(s => s.activePinch)
          const xSpread       = Math.abs(activePinches[0].midX - activePinches[1].midX) > 0.15
          const avgMidY       = (activePinches[0].midY + activePinches[1].midY) / 2
          const inBand        = avgMidY > 0.20 && avgMidY < 0.80
          const dismissValid  = xSpread && inBand  // dismiss(하향)은 위치 제약 유지
          // 카드가 이미 사라진 상태(복귀 대기)면 어디서든 bright, 그 외엔 유효 dismiss 위치일 때만
          const showActive    = dismissValid || handState.dismissed

          lastIndexY = null; tapFired = false; lastX = null
          if (wasPinching) { handState.snap = true; wasPinching = false }
          wasBothScrollPinching = true
          handState.activePinch       = false; handState.dx = 0; handState.fingerX = -1
          handState.dismissActive      = showActive  // 유효 위치이거나 이미 dismissed → 제스처 유지 신호
          handState.dismissDragXActive = false

          gestureLms.forEach((lm, i) => drawHand(lm, ctx, W, H, showActive, isDark, null))
          const pinchPts = []
          scrollInfos.forEach((info, i) => {
            if (info.activePinch) pinchPts.push(drawPinchDot(gestureLms[i], 4, 12, ctx, W, H, isDark))
          })
          if (pinchPts.length >= 2) {
            // 복귀(상향) 또는 dismiss 위치 제약 충족 시 밝은 실선, 그 외 흐릿한 점선
            ctx.strokeStyle = showActive
              ? (isDark ? 'rgba(210,210,210,0.5)' : 'rgba(40,40,40,0.45)')
              : (isDark ? 'rgba(210,210,210,0.18)' : 'rgba(40,40,40,0.18)')
            ctx.lineWidth = 1; ctx.setLineDash([5, 5])
            ctx.beginPath(); ctx.moveTo(pinchPts[0].x, pinchPts[0].y); ctx.lineTo(pinchPts[1].x, pinchPts[1].y); ctx.stroke()
            ctx.setLineDash([])
          }

          if (lastScrollMidY !== null) {
            const dy = avgMidY - lastScrollMidY
            if (Math.abs(dy) > DX_DEAD_ZONE) {
              // 유효 위치(dismiss 시작) 또는 이미 dismissed(restore) 상태일 때 양방향 전달
              if (dismissValid || handState.dismissed) handState.dismissDrag = dy
            }
          }
          lastScrollMidY = avgMidY

        } else {
          lastScrollMidY = null
          wasBothScrollPinching = false
          handState.dismissActive      = false
          handState.dismissDragXActive = false

          // ── 검지 단독 → 탭 클릭 ──
          const inIndexMode = firstLmFist && scrollActive < 0 && isIndexOnly(firstLmFist) && handState.rotDx === 0

          if (inIndexMode) {
            gestureLms.forEach((lm, i) => drawHand(lm, ctx, W, H, i === 0, isDark, null))
            drawIndexTip(firstLmFist, ctx, W, H, tapFired, isDark)

            handState.fingerX = 1 - firstLmFist[8].x
            handState.fingerY = firstLmFist[8].y

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
            handState.fingerX = -1

            gestureLms.forEach((lm, i) => drawHand(lm, ctx, W, H, scrollInfos[i].activePinch || backInfos[i].activePinch, isDark, null))
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
              const sInfo = scrollInfos[scrollActive]
              handState.pinchMidX = 1 - sInfo.midX
              handState.pinchMidY = sInfo.midY
            } else {
              if (wasPinching) { handState.snap = true }
              lastX = null; handState.dx = 0
              handState.pinchMidX = 0; handState.pinchMidY = 0
            }

            wasPinching = !!activeLm
          }
        }
      }

      // ── 손등 주먹 3초 유지 → 잠금 토글 ──

      // 재발동 방지 쿨다운
      for (const side of ['Left', 'Right']) {
        if (lockState[side].cooldown > 0) lockState[side].cooldown--
      }

      for (let hi = 0; hi < lms.length; hi++) {
        const lm   = lms[hi]
        const side = handedness[hi]?.[0]?.categoryName
        if (!side || !lockState[side]) continue
        if (isInHandBackZone(lm, side)) continue  // 손등 ±20° 구간 — 잠금 제스처도 차단

        const ls  = lockState[side]
        const key = side === 'Left' ? 'leftLocked' : 'rightLocked'
        ls.lastSeenFrame = frameCount

        // 완전한 주먹 + 손바닥이 카메라를 향함
        const isGesture = isFistClosed(lm) && isPalmFacing(lm, side)
        const progressKey = side === 'Left' ? 'leftLockProgress'  : 'rightLockProgress'
        const flashKey    = side === 'Left' ? 'leftLockFlash'     : 'rightLockFlash'

        if (isGesture && ls.cooldown === 0) {
          ls.holdFrames++
          ls.missFrames = 0
          handState[progressKey] = Math.min(ls.holdFrames / FIST_HOLD_FRAMES, 1)
          if (ls.holdFrames >= FIST_HOLD_FRAMES) {
            const nowLocked = !handState[key]
            handState[key]         = nowLocked
            handState[flashKey]    = nowLocked ? 'lock' : 'unlock'
            handState[progressKey] = 0
            ls.cooldown   = FLASH_FRAMES
            ls.holdFrames = 0
          }
        } else {
          // 5프레임 연속 미감지 시에만 리셋 (노이즈 1~2프레임은 무시)
          ls.missFrames++
          if (ls.missFrames >= 3) {
            handState[progressKey] = 0
            ls.holdFrames = 0
            ls.missFrames = 0
          }
        }
      }

      // 이번 프레임에 감지되지 않은 손: missFrames 증가 → 게이지 초기화
      for (const side of ['Left', 'Right']) {
        const ls = lockState[side]
        if (ls.lastSeenFrame !== frameCount && ls.holdFrames > 0) {
          ls.missFrames++
          if (ls.missFrames >= 3) {
            const progressKey = side === 'Left' ? 'leftLockProgress' : 'rightLockProgress'
            handState[progressKey] = 0
            ls.holdFrames = 0
            ls.missFrames = 0
          }
        }
      }

      // 비활성 자동 잠금 (1분간 손 미감지)
      for (const side of ['Left', 'Right']) {
        const key = side === 'Left' ? 'leftLocked' : 'rightLocked'
        if (!handState[key] && frameCount - lockState[side].lastSeenFrame > INACTIVITY_FRAMES) {
          handState[key] = true
        }
      }

    }

    init()

    return () => {
      cancelAnimationFrame(rafId)
      videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())
      landmarker?.close()
      Object.assign(handState, { dx: 0, snap: false, activePinch: false, active: false, zoomDelta: 0, click: false, back: false, rotDx: 0, dismissDrag: 0, fingerX: -1, fingerY: 0 })
    }
  }, [])

  return (
    <>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
      <canvas ref={canvasRef} className="hand-canvas" />
    </>
  )
}
