import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

// WASM JS 로더(vision_wasm_*_internal.js)가 window.ModuleFactory를 설정할 때
// Worker 컨텍스트에서 window가 없어 실패하는 경우를 방지
if (typeof window === 'undefined') self.window = self

// JS(@0.10.35)와 WASM 버전을 일치시켜 _internal 파일 호환성 보장
const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

let landmarker = null
let ready      = false

async function init() {
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL)
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

self.onmessage = (e) => {
  if (e.data.type !== 'DETECT') return
  const { bitmap, timestamp } = e.data

  if (!ready || !landmarker) {
    bitmap?.close()
    return
  }

  try {
    const result = landmarker.detectForVideo(bitmap, timestamp)
    bitmap.close()
    self.postMessage({
      type:       'RESULT',
      landmarks:  result.landmarks,
      handedness: result.handedness,
    })
  } catch {
    bitmap?.close()
    self.postMessage({ type: 'RESULT', landmarks: [], handedness: [] })
  }
}

init()
