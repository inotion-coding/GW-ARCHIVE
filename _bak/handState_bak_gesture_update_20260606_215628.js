// 핸드 트래커 → 캐러셀 공유 상태 (RAF 루프에서 직접 읽기)
const handState = {
  dx:          0,      // 단일 핸드: 핀치+이동 스크롤량
  snap:        false,  // 핀치 해제 시 스냅 트리거
  activePinch: false,  // 단일 핸드 유효 핀치 상태
  zoomDelta:   0,      // 양손 핀치: 프레임당 줌 변화량
  active:      false,  // 손 감지 여부
}

export default handState
