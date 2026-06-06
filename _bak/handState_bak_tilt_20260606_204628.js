// 핸드 트래커 → 캐러셀 공유 상태 (RAF 루프에서 직접 읽기)
const handState = {
  dx:     0,      // 프레임당 정규화 x 이동량 (읽은 후 0으로 리셋)
  pinch:  false,  // 핀치 상태
  active: false,  // 손 감지 여부
}

export default handState
