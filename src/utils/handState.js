// 핸드 트래커 → 캐러셀 공유 상태 (RAF 루프에서 직접 읽기)
const handState = {
  dx:          0,      // 단일 핸드: 엄지+중지 핀치+이동 스크롤량
  snap:        false,  // 핀치 해제 시 스냅 트리거
  activePinch: false,  // 스크롤 핀치(엄지+중지) 활성 상태
  zoomDelta:   0,      // 양손 엄지+검지 핀치: 프레임당 줌 변화량
  active:      false,  // 손 감지 여부
  click:       false,  // 검지 단독 탭 클릭 트리거
  clickX:      0,      // 클릭 시 검지 X 좌표 (미러, 0~1)
  clickY:      0,      // 클릭 시 검지 Y 좌표 (0~1)
  pinchMidX:      0,   // 엄지+중지 핀치 중심 X (미러, 0~1) — activePinch 시 유효
  pinchMidY:      0,   // 엄지+중지 핀치 중심 Y (0~1)
  indexPinchActive: false, // 단일 손 엄지+검지 핀치 활성 (더블탭 아닌 지속 상태)
  indexPinchMidX:   0,     // 엄지+검지 핀치 중심 X (미러, 0~1)
  indexPinchMidY:   0,     // 엄지+검지 핀치 중심 Y (0~1)
  back:        false,  // 더블탭 → 이전 페이지 트리거
  rotDx:       0,      // 손 회전: 오른손(+), 왼손(−) → 연속 스크롤 속도
  dragging:    false,  // 마우스/터치 드래그 중 (회전 제스처 차단용)
  dismissDrag:  0,      // 양손 엄지+중지 수직 드래그 (양수=아래, 음수=위, 정규화 0~1)
  dismissDragX:       0,      // 단일 손 3핀치 수평 드래그 (양수=오른쪽, 음수=왼쪽, 정규화 0~1)
  dismissed:          false,  // 카드 섹션이 현재 화면 밖으로 사라진 상태 (Carousel이 기록)
  dismissDir:         null,   // 사라진 방향 'down'|'up'|'left'|'right'|null (Carousel이 기록, HandTracker 게이팅용)
  dismissActive:      false,  // 수직 dismiss 제스처 유지 중 (정지해도 위치 보존)
  dismissDragXActive: false,  // 수평 dismiss 제스처 유지 중 (정지해도 위치 보존)
  fingerX:     -1,     // 검지 끝 X 좌표 (미러, 0~1) — -1 = 비활성 (검지 단독 모드일 때만 갱신)
  fingerY:      0,     // 검지 끝 Y 좌표 (0~1)
  leftLocked:  true,   // 왼손 제스처 잠금 상태
  rightLocked: true,   // 오른손 제스처 잠금 상태
  leftLockProgress:  0,    // 잠금 제스처 게이지 진행률 0~1
  rightLockProgress: 0,
  leftLockFlash:  null,    // 토글 시 'lock' | 'unlock' (읽은 후 null로 초기화)
  rightLockFlash: null,
}

export default handState
