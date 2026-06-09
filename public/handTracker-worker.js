// Classic Worker — Vite 변환 없이 public/ 에서 직접 서빙 (ES module 문법 금지)

var WASM_URL   = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
var BUNDLE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.cjs'
var MODEL_URL  = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

var FilesetResolver = null
var HandLandmarker  = null
var landmarker      = null
var ready           = false

// importScripts는 MIME type 검사로 .cjs를 거부함
// fetch()로 텍스트를 받아 new Function()으로 실행 — MIME 제한 없음
// new Function은 글로벌 스코프에서 실행되므로 내부의 importScripts / self.ModuleFactory 접근 정상
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

async function init() {
  try {
    await loadBundle()
    var vision = await FilesetResolver.forVisionTasks(WASM_URL)
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numHands: 2,
    })
    ready = true
    self.postMessage({ type: 'READY' })
    console.log('[HandTracker Worker] ready')
  } catch (err) {
    console.error('[HandTracker Worker] init failed:', err)
    self.postMessage({ type: 'ERROR', error: String(err) })
  }
}

self.onmessage = function(e) {
  if (e.data.type !== 'DETECT') return
  var bitmap    = e.data.bitmap
  var timestamp = e.data.timestamp
  if (!ready || !landmarker) {
    if (bitmap) bitmap.close()
    return
  }
  try {
    var result = landmarker.detectForVideo(bitmap, timestamp)
    bitmap.close()
    self.postMessage({
      type:       'RESULT',
      landmarks:  result.landmarks,
      handedness: result.handedness,
    })
  } catch (err) {
    if (bitmap) bitmap.close()
    self.postMessage({ type: 'RESULT', landmarks: [], handedness: [] })
  }
}

init()
