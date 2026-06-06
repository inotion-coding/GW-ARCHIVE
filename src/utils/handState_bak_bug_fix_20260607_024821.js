// 핸드 트래커 → 캐러셀 공유 상태 (RAF 루프에서 직접 읽기)
const handState = {
  dx:          0,      // 단일 핸드: 엄지+중지 핀치+이동 스크롤량
  snap:        false,  // 핀치 해제 시 스냅 트리거
  activePinch: false,  // 스크롤 핀치(엄지+중지) 활성 상태
  zoomDelta:   0,      // 양손 엄지+검지 핀치: 프레임당 줌 변화량
  active:      false,  // 손 감지 여부
  click:       false,  // 검지 단독 탭 클릭 트리거
  clickX:      0,      // 클릭 시 검지 X 좌표 (미러, 0~1)
  back:        false,  // 더블탭 → 이전 페이지 트리거
  rotDx:       0,      // 손 회전: 오른손(+), 왼손(−) → 연속 스크롤 속도
  dragging:    false,  // 마우스/터치 드래그 중 (회전 제스처 차단용)
  leftLocked:  true,   // 왼손 제스처 잠금 상태
  rightLocked: true,   // 오른손 제스처 잠금 상태
}

export default handState
