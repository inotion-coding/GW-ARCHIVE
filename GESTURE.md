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
| `rotDx` | number | 손 회전 임펄스 속도 (FRIC=0.92 기준 ~5.6 카드 이동) |
| `click` | boolean | 검지 탭 클릭 트리거 |
| `clickX` / `clickY` | number | 클릭 시 검지 끝 좌표 (미러, 0~1) |
| `back` | boolean | 더블탭 → 이전 페이지 트리거 |
| `dragging` | boolean | 마우스/터치 드래그 중 (회전 제스처 차단용) |
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
| `BACK_RATIO` | 0.25 | 엄지+검지 뒤로가기 핀치 임계 비율 |
| `HAND_SENS` | 20 | 핀치 이동 감도 |
| `DX_DEAD_ZONE` | 0.004 | 핀치 이동 데드존 |
| `ZOOM_SENS` | 2.2 | 줌 감도 |
| `TAP_THRESHOLD` | 0.04 | 탭 인식 최소 아래쪽 이동량 |
| `DB_TAP_WINDOW` | 25 frames (~0.8초) | 더블탭 인식 시간 창 |
| `FIST_HOLD_FRAMES` | 15 frames (~0.5초) | 주먹 유지 필요 프레임 |
| `INACTIVITY_FRAMES` | 1800 frames (~60초) | 자동 잠금 비활성 프레임 |
| `FLASH_FRAMES` | 45 frames (~1.5초) | 잠금 토글 후 쿨다운 |
| `BACK_ZONE_COS` | cos(20°) ≈ 0.940 | 손등 차단 구간 각도 임계값 |
| `ROT_IMPULSE` | 0.45 | 회전 발동 시 임펄스 속도 |
| `ROT_COOLDOWN` | 22 frames (~0.7초) | 회전 재발동 방지 쿨다운 |
| `ROT_FIRE_ANGLE` | 75° (π×75/180) | 회전 누적 발동 각도 |

---

## 제스처 목록

### 1. 엄지+중지 핀치 → 캐러셀 스크롤
- **감지**: 엄지(4)↔중지(12) 3D 거리 / 손 크기 < `SCROLL_RATIO(0.33)` (진입) / `0.43` (유지, 히스테리시스)
- **차단 조건**: `isFistClosed` (주먹 쥔 상태) 또는 `isHandBack` (손등 명확히 향할 때)
- **동작**: 손목 X 좌표 이동량에 `HAND_SENS(20)` 곱해 `handState.dx`로 전달
- **해제**: `handState.snap = true` → 가장 가까운 카드로 스냅
- **우선순위**: 양손 줌 핀치 > 스크롤 핀치

### 2. 양손 엄지+검지 핀치 → 줌
- **감지**: 두 손 모두 엄지(4)↔검지(8) 3D 거리 / 손 크기 < `ZOOM_RATIO(0.17)`
- **차단 조건**: 어느 한 손이라도 `isHandBack` 상태면 해당 손 핀치 비활성
- **동작**: 두 핀치 포인트 간 거리 변화량 × `ZOOM_SENS(2.2)` → `handState.zoomDelta`
- **범위**: 0.5 ~ `(window.innerWidth/2) / 530` (화면 폭 기반 최대)
- **차단 조건**: 스크롤 핀치 활성 중 → 줌 비활성

### 3. 엄지+검지 단일 핀치 더블탭 → 뒤로가기
- **감지**: 단일 손의 엄지(4)↔검지(8) 거리 / 손 크기 < `BACK_RATIO(0.17)` (스크롤·줌과 겹치지 않는 상태)
- **동작**: `DB_TAP_WINDOW(25프레임)` 내 2번 탭 → `handState.back = true`
- **조건**: 줌 핀치·스크롤 핀치 비활성일 때만 인식

### 4. 검지 단독 탭 → 카드 클릭
- **감지**: 검지(8)만 펴고 나머지 접힌 상태 (`isIndexOnly`) + 스크롤 핀치 없음
- **동작**: 검지 끝이 아래로 `TAP_THRESHOLD(0.04)` 이상 이동 시 `handState.click = true`
- **좌표**: `handState.clickX = 1 - lm[8].x`, `handState.clickY = lm[8].y` (미러 보정)
- **Carousel**: `elementFromPoint`로 hit-test → 해당 카드 상세 페이지 이동
- **재발동 방지**: 검지가 위로 올라가야 (`dy < -0.01`) 다시 탭 가능

### 5. 손 Roll 회전 → 연속 스크롤
- **감지**: 검지MCP(5) → 소지MCP(17) 벡터 기울기 누적 변화량 > `ROT_FIRE_ANGLE(75°)`
- **방향**: 오른손(MediaPipe 'Left') 회전 → `rotDx = +ROT_IMPULSE(0.45)` / 왼손 → `−0.45`
- **조건**: 손바닥이 카메라를 향한 상태(`isPalmFacing`)에서 시작한 회전만 허용
- **차단**: 스크롤 핀치 활성 중 또는 마우스/터치 드래그 중 차단
- **쿨다운**: 발동 후 `ROT_COOLDOWN(22프레임)` 동안 재발동 없음
- **Carousel**: `target = Math.round(offset + impulse / (1 - FRIC))` 방식으로 관성 스냅

### 6. 손등 주먹 유지 → 잠금 / 잠금해제 토글
- **감지**: `isFistClosed(lm)` + `isPalmFacing(lm, side)` 동시 만족
- **동작**: `FIST_HOLD_FRAMES(15프레임)` 연속 유지 시 해당 손 잠금 상태 토글
- **게이지**: `handState.leftLockProgress` / `rightLockProgress` (0~1)
- **플래시**: 토글 시 `leftLockFlash = 'lock' | 'unlock'` 신호 발생, 읽은 후 null 초기화
- **쿨다운**: 토글 후 `FLASH_FRAMES(45프레임)` 동안 재발동 없음
- **노이즈 무시**: 3프레임 이하 미감지는 missFrames 축적 후 리셋 (즉시 해제 안 함)
- **게이지 초기화**: 손이 화면에서 사라지면 3프레임 후 게이지 0 리셋

---

## 손등 차단 구간 (Dead Zone)

손등이 완벽하게 카메라를 향할 때 기준 **±20°** 이내는 **모든 제스처 비활성**.

- 손바닥 법선 벡터(3D 외적: wrist→indexMCP × wrist→pinkyMCP)의 카메라 방향 성분으로 판별
- `isInHandBackZone(lm, side)` 함수, `BACK_ZONE_COS = cos(20°) ≈ 0.940`
- 적용 대상: 스크롤, 줌, 뒤로가기, 클릭(검지 탭), 회전, **잠금 제스처** 포함 전체

---

## 잠금 시스템

- **초기 상태**: 양손 모두 잠금(`leftLocked = true`, `rightLocked = true`)
- **잠긴 손**: 스켈레톤은 흐릿하게 표시, 모든 제스처 비활성 (잠금 토글 제스처만 가능)
- **자동 잠금**: 손이 `INACTIVITY_FRAMES(1800프레임 = ~60초)` 이상 미감지 시 자동 잠금

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
├── bothZoomPinch?
│   ├── YES → 줌 모드 (zoomDelta 계산)
│   └── NO
│       ├── inIndexMode? (검지 단독)
│       │   ├── YES → 탭 클릭 감지
│       │   └── NO → 스크롤 핀치 감지 (dx 계산)
│       └── 더블탭 → back 트리거
└── 잠금 제스처 감지 (모든 손 대상, 잠금 여부 무관)
    └── 손 미감지 시 게이지 초기화 루프
```

---

**Last Updated**: 2026-06-07 (핀치 3D 거리 + 히스테리시스 + isHandBack 적용)
