// 핸드 트래커 → 캐러셀 공유 상태 (RAF 루프에서 직접 읽기)
const handState = {
  tiltScroll: 0,   // -1 ~ 1: 손 기울기 기반 스크롤 방향·속도
  pinch:      false,
  active:     false,
}

export default handState
