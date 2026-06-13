// 인터랙티브 튜토리얼 활성 상태 — WelcomePage(시작 버튼)와 TutorialOverlay(App 전역)가 공유.
// useSyncExternalStore로 구독하므로 getSnapshot은 primitive(boolean)를 반환한다.
let active = false
const subs = new Set()

function emit() { subs.forEach(fn => fn()) }

export const tutorial = {
  get active() { return active },
  start() { if (!active) { active = true; emit() } },
  stop()  { if (active)  { active = false; emit() } },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
}
