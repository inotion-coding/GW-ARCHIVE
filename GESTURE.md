# GESTURE.md — 제스처 동작 명세

> 이 파일은 HandTracker.jsx의 제스처 로직을 요약한 참조 문서입니다.
> HandTracker 수정 시 반드시 이 파일도 함께 업데이트하세요.

---

## 공유 상태 (`handState.js`)

| 필드 | 타입 | 설명 |
|---|---|---|
| `active` | boolean | 잠금 해제된 손이 1개 이상 감지됨 |
| `activePinch` | boolean | 엄지+중지 스크롤 핀치 활성 상태 |
| `dx` | number | 프레임당 스크롤 이동량 (핀치 이동 기반) |
| `snap` | boolean | 핀치 해제 시 가장 가까운 카드로 스냅 트리거 |
| `zoomDelta` | number | 양손 줌 프레임당 변화량 |
| `rotDx` | number | 손 회전 임펄스 속도 (FRIC=0.97 기준 정확히 5 카드 이동) |
| `click` | boolean | 검지 탭 클릭 트리거 |
| `clickX` / `clickY` | number | 클릭 시 검지 끝 좌표 (미러, 0~1) |
| `pinchMidX` / `pinchMidY` | number | 엄지+중지 핀치 중심 좌표 (미러, 0~1) — activePinch 시 유효 |
| `indexPinchActive` | boolean | 단일 손 엄지+검지 핀치 활성 (스크롤·줌 비활성 시) |
| `indexPinchMidX` / `indexPinchMidY` | number | 엄지+검지 핀치 중심 좌표 (미러, 0~1) — indexPinchActive 시 유효 |
| `back` | boolean | 더블탭 → 이전 페이지 트리거 |
| `dragging` | boolean | 마우스/터치 드래그 중 (회전 제스처 차단용) |
| `dismissDrag` | number | 양손 수직 드래그량 (양수=아래, 음수=위) |
| `dismissDragX` | number | 단일 손 3핀치 수평 드래그량 (양수=오른쪽, 음수=왼쪽) |
| `dismissed` | boolean | 카드 섹션이 화면 밖으로 사라진 상태 |
| `dismissDir` | string\|null | 사라진 방향 `'down'`\|`'up'`\|`'left'`\|`'right'`\|null (HandTracker 게이팅용) |
| `dismissActive` | boolean | 수직 dismiss 제스처 유지 중 — true일 때 Carousel이 중간 위치 보존 |
| `dismissDragXActive` | boolean | 수평 dismiss 제스처 유지 중 — true일 때 Carousel이 중간 위치 보존 |
| `fingerX` / `fingerY` | number | 검지 끝 좌표 (미러, 0~1) — -1 = 비활성 |
| `leftLocked` / `rightLocked` | boolean | 손별 잠금 상태 (기본값: true) |
| `leftLockProgress` / `rightLockProgress` | number | 잠금 게이지 진행률 0~1 |
| `leftLockFlash` / `rightLockFlash` | `'lock'`\|`'unlock'`\|null | 토글 시 UI 플래시 신호 |

---

## 감지 파라미터

| 상수 | 값 | 설명 |
|---|---|---|
| `SCROLL_RATIO` | 0.33 | 엄지+중지 핀치 진입 임계 비율 |
| `SCROLL_HYSTERESIS` | 1.30 | 핀치 유지 임계 배율 (유지 시 0.33 × 1.3 = 0.43 적용) |
| `ZOOM_RATIO` | 0.20 | 엄지+검지 양손 줌 핀치 임계 비율 |
| `INDEX_PINCH_RATIO` | 0.25 | 단일 엄지+검지 핀치 임계 비율 (캘린더 드래그용) |
| `TRI_PINCH_RATIO` | 0.28 | 엄지+검지+중지 3핀치 임계 비율 (좌우 dismiss) |
| `HAND_SENS` | 26 | 핀치 이동 감도 |
| `DX_DEAD_ZONE` | 0.002 | 핀치 이동 데드존 |
| `ZOOM_SENS` | 2.2 | 줌 감도 |
| `TAP_THRESHOLD` | 0.04 | 탭 인식 최소 아래쪽 이동량 |
| `BACK_DBL_FRAMES` | 18 frames (~0.6초) | 엄지+중지 더블탭 뒤로가기 시간 창 |
| `BACK_MOVE_THRESHOLD` | 0.04 | 더블탭 인식 최대 이동량 (초과 시 스크롤로 간주) |
| `FIST_HOLD_FRAMES` | 15 frames (~0.5초) | 주먹 유지 필요 프레임 |
| `INACTIVITY_FRAMES` | 1800 frames (~60초) | 자동 잠금 비활성 프레임 |
| `FLASH_FRAMES` | 45 frames (~1.5초) | 잠금 토글 후 쿨다운 |
| `BACK_ZONE_COS` | cos(20°) ≈ 0.940 | 손등 차단 구간 각도 임계값 |
| `ROT_IMPULSE` | 0.15 | 회전 발동 시 임펄스 속도 (1회전 = 5카드, FRIC=0.97) |
| `ROT_COOLDOWN` | 22 frames (~0.7초) | 회전 재발동 방지 쿨다운 |
| `ROT_FIRE_ANGLE` | 75° (π×75/180) | 회전 누적 발동 각도 |

---

## 제스처 목록

### 1. 엄지+중지 핀치 → 캐러셀 스크롤 / SchedulePage 세로 스크롤 / 더블탭 → 뒤로가기
- **감지**: 엄지(4)↔중지(12) 3D 거리 / 손 크기 < `SCROLL_RATIO(0.33)` (진입) / `0.43` (유지, 히스테리시스)
- **차단 조건**: `isLooseFist` · `isIndexOnly` · `isHandBack` · `backZoneMask` (손등 ±20°)
- **Carousel**: 손목 X 이동량 × `HAND_SENS(26)` → `handState.dx`, 해제 시 `snap = true` → 스냅
- **SchedulePage**: `pinchMidY` 프레임 간 델타 × `H × 1.75` → `.sch-list` scrollTop 직접 조작
- **뒤로가기**: 핀치 2회 빠르게 탭(release → release 간격 `BACK_DBL_FRAMES(18프레임, ~0.6초)` 이내) → `handState.back = true`
  - 스크롤 이동량이 `BACK_MOVE_THRESHOLD(0.04)` 미만일 때만 탭으로 인식 (스크롤과 더블탭 구분)
  - 핀치 시작 시 이동량 누적(`pinchMoveAccum`), 해제 시 초기화
- **우선순위**: 양손 줌 핀치 > 스크롤 핀치

### 2. 양손 엄지+검지 핀치 → 줌
- **감지**: 두 손 모두 엄지(4)↔검지(8) 3D 거리 / 손 크기 < `ZOOM_RATIO(0.20)`
- **차단 조건**: `isLooseFist` · `isIndexOnly` · `isHandBack` · `backZoneMask` (손등 ±20°)
- **동작**: 두 핀치 포인트 간 거리 변화량 × `ZOOM_SENS(2.2)` → `handState.zoomDelta`
- **범위**: 0.5 ~ `(window.innerWidth/2) / 530` (화면 폭 기반 최대)
- **차단 조건**: 스크롤 핀치 활성 중 → 줌 비활성

### 3. 엄지+검지 단일 핀치 → 캘린더 날짜 선택
- **차단 조건**: `isLooseFist` · `isIndexOnly` · `backZoneMask`
- **감지**: 단일 손의 엄지(4)↔검지(8) 거리 / 손 크기 < `INDEX_PINCH_RATIO(0.25)` (스크롤·줌 비활성 시)
- **날짜 선택**: 핀치 활성 상태(`indexPinchActive`)에서 `indexPinchMidX/Y` 기준 `[data-day]` 셀 hit-test
  - 핀치 rising edge 시 해당 날짜 선택, 유지 이동 시 hover 하이라이트 추적
  - CalendarView(overlay) 및 CalendarPage(`/motion/3`) 모두 적용
- **조건**: 줌 핀치·스크롤 핀치 비활성일 때만 인식
- ⚠️ **뒤로가기 역할 제거됨** (엄지+중지 더블탭으로 이전)

### 4. 검지 단독 탭 → 카드 클릭
- **감지**: 검지(8)만 펴고 나머지 접힌 상태 (`isIndexOnly`) + 스크롤 핀치 없음
- **동작**: 검지 끝이 아래로 `TAP_THRESHOLD(0.04)` 이상 이동 시 `handState.click = true`
- **좌표**: `handState.clickX = 1 - lm[8].x`, `handState.clickY = lm[8].y` (미러 보정)
- **Carousel**: `elementFromPoint`로 hit-test → 해당 카드 상세 페이지 이동
- **재발동 방지**: 검지가 위로 올라가야 (`dy < -0.01`) 다시 탭 가능

### 5. 단일 손 엄지+검지+중지 3핀치 → 좌우 dismiss
- **감지**: 엄지(4)↔검지(8) AND 엄지(4)↔중지(12) 모두 3D 거리 / 손 크기 < `TRI_PINCH_RATIO(0.28)`
- **차단 조건**: `isFistClosed(lm)` — 주먹 상태에서는 3핀치 비활성
- **방향 규칙**:
  - 사용자 **오른손** (MediaPipe `'Left'`) → 오른쪽으로 밀어 dismiss
  - 사용자 **왼손** (MediaPipe `'Right'`) → 왼쪽으로 밀어 dismiss
- **신호 게이팅**: dismiss 중 → 오른손은 dx > 0 또는 복귀 방향, 왼손은 dx < 0 또는 복귀 방향
- **복귀**: dismiss된 방향의 반대로 `W * 0.30` 이상 이동 시 복귀 확정
- **우선순위**: 줌·스크롤·검지 모드보다 높음 (triPinch 감지 시 타 제스처 차단)
- **참조**: `handState.dismissDragX` → `Carousel.jsx` 수평 dismiss 물리

### 6. 손 Roll 회전 → 연속 스크롤
- **감지**: 검지MCP(5) → 소지MCP(17) 벡터 기울기 누적 변화량 > `ROT_FIRE_ANGLE(75°)`
- **방향**: 오른손(MediaPipe 'Left') 회전 → `rotDx = +ROT_IMPULSE(0.15)` / 왼손 → `−0.15`
- **조건**: 손바닥이 카메라를 향한 상태(`isPalmFacing`)에서 시작한 회전만 허용
- **차단**: 스크롤 핀치 활성 중 또는 마우스/터치 드래그 중 차단
- **쿨다운**: 발동 후 `ROT_COOLDOWN(22프레임)` 동안 재발동 없음
- **Carousel**: `target = Math.round(offset + impulse / (1 - FRIC))` 방식으로 관성 스냅

### 6. 손등 주먹 유지 → 잠금 / 잠금해제 토글
- **적용 페이지**: 메인 페이지(`/`)에서만 동작. 다른 경로에서는 매 프레임 강제 언락 유지
- **감지**: `isFistClosed(lm)` + `isPalmFacing(lm, side)` 동시 만족
- **동작**: `FIST_HOLD_FRAMES(15프레임)` 연속 유지 시 해당 손 잠금 상태 토글
- **게이지**: `handState.leftLockProgress` / `rightLockProgress` (0~1)
- **플래시**: 토글 시 `leftLockFlash = 'lock' | 'unlock'` 신호 발생, 읽은 후 null 초기화
- **쿨다운**: 토글 후 `FLASH_FRAMES(45프레임)` 동안 재발동 없음
- **노이즈 무시**: 3프레임 이하 미감지는 missFrames 축적 후 리셋 (즉시 해제 안 함)
- **게이지 초기화**: 손이 화면에서 사라지면 3프레임 후 게이지 0 리셋

---

## 검출 파이프라인 아키텍처

| 항목 | 값 / 방식 |
|---|---|
| 검출 방식 | `MediaStreamTrackProcessor` + `VideoFrame` — 워커가 카메라 스트림 직접 pull |
| 버퍼 크기 | `maxBufferSize: 1` — 추론 중 쌓인 프레임 자동 폐기, 항상 최신 프레임 처리 |
| 에셋 로딩 | `public/mediapipe/` 로컬 번들 (WASM·vision_bundle·hand_landmarker 모델) — CDN 미사용, 워커가 `self.location` 기준 base 자동 산출 |
| 델리게이트 | GPU 우선. 추론 중앙값 `> 45ms`(30프레임 윈도우) 또는 연속 오류 시 **CPU 자동 강등** — 에러 없이 느려지는 GPU 케이스 대응 |
| 입력 해상도 | VideoFrame 원본 그대로; CPU 강등 후 여전히 느리면 `224 → 192px` 단계 다운스케일(정규화 좌표라 보정 불필요) / 폴백 경로 320 × 240 |
| 폴백 | `MediaStreamTrackProcessor` 미지원 시 `ImageBitmap` postMessage 방식 사용 |
| 렌더링 | RAF 60fps 독립 — **매 프레임 EMA 스무딩**으로 추론 fps와 무관하게 부드럽게 추종(속도 기반 α + `dt` 보정). 추론 콜백이 아닌 렌더 루프에서 수행 |
| 성능 HUD | 화면 좌하단, **`P` 키 토글**(localStorage 저장) — `델리게이트 · 추론ms(fps) · 입력px · 렌더fps` 표시 |

---

## 손등 차단 구간 (Dead Zone)

손등이 완벽하게 카메라를 향할 때 기준 **±20°** 이내는 **모든 제스처 비활성**.

- 손바닥 법선 벡터(3D 외적: wrist→indexMCP × wrist→pinkyMCP)의 카메라 방향 성분으로 판별
- `isInHandBackZone(lm, side)` 함수, `BACK_ZONE_COS = cos(20°) ≈ 0.940`
- 적용 대상: 스크롤, 줌, 뒤로가기, 클릭(검지 탭), 회전, **잠금 제스처** 포함 전체

---

## 잠금 시스템

- **적용 범위**: 메인 페이지(`/`)에서만 잠금 동작. 서브 페이지(`/motion/*` 등)에서는 항상 언락 상태
- **초기 상태**: 양손 모두 잠금(`leftLocked = true`, `rightLocked = true`)
- **잠긴 손**: 스켈레톤은 흐릿하게 표시, 모든 제스처 비활성 (잠금 토글 제스처만 가능)
- **자동 잠금**: 손이 `INACTIVITY_FRAMES(1800프레임 = ~60초)` 이상 미감지 시 자동 잠금 (메인 페이지에서만)

---

## MediaPipe 좌우 레이블 주의사항

MediaPipe는 user-facing 카메라에서 좌우를 **미러 기준**으로 매김:
- MediaPipe `'Right'` = 화면 오른쪽 = 사용자 **실제 왼손**
- MediaPipe `'Left'` = 화면 왼쪽 = 사용자 **실제 오른손**

`isPalmFacing` 함수에서 이 역전을 보정하여 처리.

---

## 처리 흐름 요약

```
detect(ts) 매 프레임 (30fps 캡)
├── lms.length === 0 → 전체 상태 초기화 (snap 트리거 포함)
├── 잠금된 손 분리 → gestureLms (잠금해제 손만)
├── 회전 감지 (스크롤·드래그 없을 때)
├── anyTriPinch? (단일 손 엄지+검지+중지 3핀치)
│   ├── YES → 좌우 dismiss 모드 (dismissDragX 계산, 타 제스처 차단)
│   └── NO
│       ├── bothZoomPinch?
│       │   ├── YES → 줌 모드 (zoomDelta 계산)
│       │   └── NO
│       │       ├── bothScrollPinch? → 수직 dismiss 모드 (dismissDrag 계산)
│       │       ├── inIndexMode? → 탭 클릭 감지
│       │       └── 스크롤 핀치 감지 (dx 계산)
│       └── 더블탭 → back 트리거
└── 잠금 제스처 감지 (모든 손 대상, 잠금 여부 무관)
    └── 손 미감지 시 게이지 초기화 루프
```

---

**Last Updated**: 2026-06-08 (ROT_IMPULSE 0.45→0.15 (1회전=5카드); 3핀치 주먹 상태 차단 추가)
