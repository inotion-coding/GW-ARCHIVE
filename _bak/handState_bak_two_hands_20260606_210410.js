// 핸드 트래커 → 캐러셀 공유 상태 (RAF 루프에서 직접 읽기)
const handState = {
  dx:          0,      // 프레임당 x 이동량 (소비 후 0 리셋)
  snap:        false,  // 핀치 해제 시 스냅 트리거
  activePinch: false,  // 현재 유효 핀치 상태
  active:      false,  // 손 감지 여부
}

export default handState
