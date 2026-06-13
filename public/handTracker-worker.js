// Classic Worker — Vite 변환 없이 public/ 에서 직접 서빙 (ES module 문법 금지)
//
// 자가 튜닝(self-tuning) 추론 워커:
//   1. 모든 에셋을 같은 오리진(public/mediapipe/)에서 로드 → CDN 지연·스로틀 제거
//   2. 추론 시간을 실측해 GPU가 느리면 자동으로 CPU 전환 (에러가 아니라 "느림" 기반)
//   3. 여전히 느리면 입력 해상도를 단계적으로 낮춰 추론 부하 절감
//   4. 성능 지표(델리게이트/추론ms/실효fps)를 메인 스레드 HUD로 보고

// self.location.href = ".../<base>/handTracker-worker.js" → 파일명을 떼어 base 디렉토리 추출.
// dev('/')·prod('/GW-ARCHIVE/') 양쪽에서 동일하게 동작.
var BASE       = self.location.href.replace(/[^/]*(\?.*)?$/, '')
var WASM_URL   = BASE + 'mediapipe/wasm'
var BUNDLE_URL = BASE + 'mediapipe/vision_bundle.cjs'
var MODEL_URL  = BASE + 'mediapipe/hand_landmarker.task'

var FilesetResolver = null
var HandLandmarker  = null
var landmarker      = null
var ready           = false
var streamStarted   = false  // VideoFrame 파이프라인 활성화 여부 (START_STREAM 수신 후 true)

var visionRef    = null      // 델리게이트 재생성용 보관
var delegate     = 'GPU'     // 현재 델리게이트 ('GPU' | 'CPU')
var degraded     = false     // GPU→CPU 전환을 이미 수행했는지 (플래핑 방지)
var switching    = false     // 델리게이트 재생성 진행 중
var inferErrors  = 0         // 연속 추론 오류 카운트 (에러 기반 즉시 복구용)

// ── 추론 페이싱 ──
// 빠른 머신에서 불필요한 과추론을 막는 상한. 느린 머신에서는 추론 자체가 더 오래 걸려
// 자연스럽게 이 간격보다 느려지므로 영향 없음.
var TARGET_FPS         = 30
var MIN_FRAME_INTERVAL = 1000 / TARGET_FPS
var lastInferenceMs    = -1e9

// ── 실측 기반 적응 ──
var PERF_WINDOW = 30         // 중앙값 계산용 롤링 윈도우
var times       = []         // 최근 추론 소요(ms)
var SLOW_GPU_MS = 45         // GPU 중앙값이 이보다 크면 CPU로 강등
var inputW      = 0          // 0 = 원본 프레임, >0 = 해당 너비로 다운스케일
var lastPerfPost = -1e9      // PERF 보고 스로틀

// 다운스케일용 오프스크린 캔버스 (워커 내 1회 생성, 좌표는 정규화라 보정 불필요)
var dsCanvas = new OffscreenCanvas(1, 1)
var dsCtx    = dsCanvas.getContext('2d', { alpha: false, desynchronized: true })

function recordTime(ms) {
  times.push(ms)
  if (times.length > PERF_WINDOW) times.shift()
}
function medianTime() {
  if (times.length === 0) return 0
  var s = times.slice().sort(function (a, b) { return a - b })
  return s[s.length >> 1]
}

// importScripts는 .cjs MIME를 거부 → fetch 텍스트를 new Function으로 실행 (로컬 파일이라 즉시)
async function loadBundle() {
  var resp = await fetch(BUNDLE_URL)
  if (!resp.ok) throw new Error('bundle fetch failed: ' + resp.status)
  var code = await resp.text()
  var mod = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', code)(mod, mod.exports)
  FilesetResolver = mod.exports.FilesetResolver
  HandLandmarker  = mod.exports.HandLandmarker
  if (!FilesetResolver || !HandLandmarker) throw new Error('MediaPipe exports not found')
}

function createLandmarker(vision, del) {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: del },
    runningMode: 'VIDEO',
    numHands: 2,
  })
}

async function init() {
  try {
    await loadBundle()
    visionRef = await FilesetResolver.forVisionTasks(WASM_URL)
    // GPU 우선. 생성 단계 실패는 즉시 CPU 폴백.
    try {
      landmarker = await createLandmarker(visionRef, 'GPU')
      delegate = 'GPU'
      console.log('[HandTracker Worker] ready (GPU, local assets)')
    } catch (gpuErr) {
      console.warn('[HandTracker Worker] GPU 생성 실패 → CPU 폴백:', gpuErr)
      landmarker = await createLandmarker(visionRef, 'CPU')
      delegate = 'CPU'; degraded = true; inputW = 256
      console.log('[HandTracker Worker] ready (CPU, local assets)')
    }
    ready = true
    self.postMessage({ type: 'READY' })
  } catch (err) {
    console.error('[HandTracker Worker] init failed:', err)
    self.postMessage({ type: 'ERROR', error: String(err) })
  }
}

// GPU→CPU 강등 (느림 또는 반복 에러). 비동기 재생성 중에는 기존 델리게이트로 계속 추론.
function switchToCpu(reason) {
  if (degraded || switching) return
  switching = true; degraded = true
  console.warn('[HandTracker Worker] GPU → CPU 전환 (' + reason + ')')
  createLandmarker(visionRef, 'CPU').then(function (lm) {
    var old = landmarker
    landmarker = lm
    delegate = 'CPU'
    inputW = 256            // CPU 전환과 동시에 해상도 1차 절감
    times = []
    inferErrors = 0
    switching = false
    if (old && old.close) { try { old.close() } catch (e) {} }
    console.warn('[HandTracker Worker] CPU 전환 완료')
  }).catch(function (e) {
    switching = false
    console.error('[HandTracker Worker] CPU 전환 실패:', e)
  })
}

// 추론 1프레임 후 호출 — 중앙값을 보고 델리게이트/해상도를 적응 조정.
function maybeAdapt() {
  if (times.length < PERF_WINDOW || switching) return
  var m = medianTime()
  // GPU가 느리면 CPU로 (드라이버 이슈로 에러 없이 느려지는 케이스 대응)
  if (delegate === 'GPU' && !degraded && m > SLOW_GPU_MS) {
    switchToCpu('GPU 추론 ' + Math.round(m) + 'ms')
    return
  }
  // CPU에서도 느리면 입력 해상도를 단계적으로 축소 (192px 하한)
  if (delegate === 'CPU') {
    if (m > 110 && (inputW === 0 || inputW > 192)) { inputW = 192; times = [] }
    else if (m > 70 && (inputW === 0 || inputW > 224)) { inputW = 224; times = [] }
  }
}

function postPerf(tMs) {
  if (tMs - lastPerfPost < 500) return   // 0.5s 간격 보고
  lastPerfPost = tMs
  var m = medianTime()
  self.postMessage({
    type: 'PERF',
    delegate: delegate + (switching ? '→CPU' : ''),
    infMs: Math.round(m),
    fps: m > 0 ? Math.min(TARGET_FPS, Math.round(1000 / m)) : 0,
    inputW: inputW,
  })
}

// 다운스케일이 필요하면 캔버스에 그려 반환, 아니면 원본 그대로.
function prepareInput(source) {
  if (inputW <= 0) return source
  var sw = source.displayWidth || source.width || 640
  var sh = source.displayHeight || source.height || 480
  var inH = Math.max(1, Math.round(inputW * sh / sw))
  if (dsCanvas.width !== inputW || dsCanvas.height !== inH) {
    dsCanvas.width = inputW; dsCanvas.height = inH
  }
  dsCtx.drawImage(source, 0, 0, inputW, inH)
  return dsCanvas
}

// 공통 추론 경로 — 시간 실측 + 적응 + 결과 전송. 성공 시 true.
function runDetect(source, tMs) {
  var img = prepareInput(source)
  var t0 = performance.now()
  var result = landmarker.detectForVideo(img, tMs)
  recordTime(performance.now() - t0)
  inferErrors = 0
  self.postMessage({ type: 'RESULT', landmarks: result.landmarks, handedness: result.handedness })
  maybeAdapt()
  postPerf(tMs)
  return true
}

function onInferError(err) {
  console.error('[Worker] 추론 오류:', err)
  inferErrors++
  if (inferErrors > 6) switchToCpu('연속 추론 오류')
  self.postMessage({ type: 'RESULT', landmarks: [], handedness: [] })
}

// VideoFrame 파이프라인 — 카메라 스트림을 워커가 직접 읽어 RAF와 무관하게 최신 프레임 처리.
// maxBufferSize:1 덕분에 reader.read()는 항상 가장 최신 프레임을 반환 (오래된 프레임 자동 폐기).
async function startVideoStream(readable) {
  var reader = readable.getReader()
  console.log('[HandTracker Worker] VideoFrame 스트림 시작')
  try {
    while (true) {
      var read = await reader.read()
      if (read.done) break
      var frame = read.value
      if (!ready || !landmarker) { frame.close(); continue }
      var tMs = frame.timestamp / 1000   // 마이크로초 → 밀리초
      if (tMs - lastInferenceMs < MIN_FRAME_INTERVAL) { frame.close(); continue }
      lastInferenceMs = tMs
      try { runDetect(frame, tMs) }
      catch (err) { onInferError(err) }
      finally { frame.close() }
    }
  } catch (err) {
    console.error('[Worker] 스트림 읽기 오류:', err)
  }
}

self.onmessage = function (e) {
  if (e.data.type === 'START_STREAM') {
    streamStarted = true
    startVideoStream(e.data.readable)
    return
  }
  // 폴백: VideoFrame 미지원 환경의 ImageBitmap 방식
  if (e.data.type !== 'DETECT' || streamStarted) {
    if (e.data.bitmap) e.data.bitmap.close()
    return
  }
  var bitmap = e.data.bitmap
  if (!ready || !landmarker) { if (bitmap) bitmap.close(); return }
  try { runDetect(bitmap, e.data.timestamp) }
  catch (err) { onInferError(err) }
  finally { if (bitmap) bitmap.close() }
}

init()
