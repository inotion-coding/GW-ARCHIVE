# CARDS.md — 카드 상세 정보

> 이 파일은 `src/data/cards.js`의 카드 데이터와 각 카드의 상세 내용을 담은 참조 문서입니다.
> 카드 데이터 수정 시 반드시 이 파일도 함께 업데이트하세요.

---

## 카드 데이터 구조 (`src/data/cards.js`)

```js
{ id: number, title: string, img: string (Unsplash URL), color: string (hex) }
```

캐러셀은 `N = CARDS.length` 기준으로 순환 (`((logIdx % N) + N) % N`).

---

## 카드 목록

| # | id | title | color | 이미지 설명 |
|---|---|---|---|---|
| 1 | 1 | Welcome | `#c8bfb0` | 청록빛 유기체 형태 (3D 추상) |
| 2 | 2 | Schedule | `#9aab98` | 파스텔 나선 디스크 구조 (3D 추상) |
| 3 | 3 | Calendar | `#b8c0b8` | 홀로그래픽 링/토러스 (3D 추상) |
| 4 | 4 | Weather | `#d0d0d0` | 복숭아빛 유체 그라데이션 (3D 추상) |
| 5 | 5 | World Clock | `#b0c0c8` | 청회색 추상 (3D 추상) |
| 6 | 6 | Megastudy | `#c0b8c0` | 흰색 클레이 블롭 (3D 추상) |
| 7 | 7 | D-Day | `#c8c0b0` | 흰색 물결 능선 조형 (3D 추상) |
| 8 | 8 | Downloads | `#b8b0b0` | 라벤더·옐로 파스텔 구체 (3D 추상) |
| 9 | 9 | Placeholder 4 | `#a8b8a8` | 흰 모래 물결 질감 (3D 추상) |
| 10 | 10 | Documents | `#c0c8b0` | 블랙 광택 조형물 (3D 추상) |

---

## 카드별 상세 내용

### Card 1 — Welcome
- **주제**: 앱 소개 / 제스처 튜토리얼
- **설명**: GW ARCHIVE 소개와 8종 제스처(손 활성화/잠금·카드 넘기기·롤 스크롤·카드 열기·뒤로가기·줌·밀어 치우기·캘린더 날짜 선택) 사용법을 아이콘과 함께 안내. 제스처 명세는 `GESTURE.md` 기반. WelcomePage(`/motion/1`)로 라우팅.
- **인터랙티브 튜토리얼**: 「▶ 튜토리얼 시작」 버튼 → 메인 화면으로 이동해 핵심 7개 제스처를 단계별로 **직접 운용**하며 익힘.
  - 단계: 손 활성화 → 카드 넘기기 → 빠르게 스크롤 → 카드 열기 → 뒤로 가기 → 확대/축소 → 밀어 치우기
  - `TutorialOverlay`(App 전역, 화면 전환에도 유지)가 `handState`를 감지해 성공 시 ✓ 후 자동 진행. 카드 열기·뒤로 가기는 실제 화면 전환을 `useLocation`으로 감지
  - 시작/진행 상태는 `tutorialStore`(공유)로 관리. 종료 시 `handState.resetView`로 메인 뷰 복원
- **상태**: 구현 완료 (인터랙티브 튜토리얼 포함)

### Card 2 — Schedule
- **주제**: 일정 관리
- **설명**: 오늘의 일정 목록 표시. 날짜·시간·제목 기반 일정 카드 UI 예정.
- **상태**: 개발 중

### Card 3 — Calendar
- **주제**: 월간 캘린더
- **설명**: 월 단위 달력 뷰. 날짜 선택 시 해당 일정 표시 연동 예정.
- **상태**: 개발 중

### Card 4 — Weather
- **주제**: 날씨 정보
- **설명**: 현재 위치 기반 실시간 날씨 데이터 표시. 기온·습도·날씨 아이콘 포함 예정.
- **상태**: 개발 중

### Card 5 — World Clock
- **주제**: 세계시계 / 시계
- **설명**: 대형 로컬 디지털 시계(요일·날짜 포함)와 세계 도시별 시간 리스트. 도시 추가/삭제, 12/24시간 토글을 localStorage에 영속 저장. `Intl.DateTimeFormat`의 `timeZone`으로 정확히 계산. ClockPage(`/motion/5`)로 라우팅.
- **상태**: 구현 완료

### Card 6 — Megastudy
- **주제**: 메가스터디 링크 런처
- **설명**: megastudy.net 사이트를 새 탭으로 열어주는 링크 런처 페이지. MegastudyPage(`/motion/6`)로 라우팅.
- **상태**: 구현 완료

### Card 7 — D-Day
- **주제**: D-Day 카운터
- **설명**: 가장 임박한 D-day를 대형으로 표시하고, 등록된 D-day들을 가까운 순으로 정렬. 지난 일정은 `D+N`으로 표기. 제목+목표일 폼으로 추가/삭제하며 `src/data/ddayStore.js`를 통해 localStorage 영속. DdayPage(`/motion/7`)로 라우팅.
- **상태**: 구현 완료

### Card 8 — Downloads
- **주제**: PDF 파일 다운로드 (임시)
- **설명**: `public/docs/`에 배치된 PDF 3종을 내려받는 페이지. 파일별 개별 다운로드 버튼과 「전체 다운로드」 버튼 제공. DownloadsPage(`/motion/8`)로 라우팅.
- **파일 목록** (실제 경로 → 저장 파일명)
  | public 경로 | 저장 파일명 |
  |---|---|
  | `docs/proposal-application.pdf` | 제안신청서.pdf |
  | `docs/proposal-description.pdf` | 제안설명서.pdf |
  | `docs/privacy-consent.pdf` | 개인정보동의서.pdf |
- **구현 메모**: 경로는 `import.meta.env.BASE_URL` 기준(배포 base `/GW-ARCHIVE/`). 한글 파일명 URL 인코딩 이슈를 피하려 파일은 ASCII명으로 두고 `<a download>` 속성으로 한글명 저장. 전체 다운로드는 브라우저의 연속 다운로드 차단을 피하려 400ms 간격 실행.
- **상태**: 구현 완료 (임시 콘텐츠)

### Card 9 — Placeholder 4
- **주제**: 미정
- **상태**: 콘텐츠 미구현

### Card 10 — Documents
- **주제**: 문서 뷰어
- **설명**: 로컬 파일 드롭으로 문서(md, docx, doc, pdf, xlsx, pptx, hwpx 등) 미리보기. FileViewerPage(`/motion/10`)로 라우팅.
- **상태**: 구현 완료

---

## MotionPage 연결

카드 클릭(검지 탭 또는 마우스 클릭) 시 `/motion/:id` 로 라우팅.
`MotionPage`는 `src/pages/MotionPage.jsx`에서 `id`로 CARDS 조회 후 렌더링.

---

**Last Updated**: 2026-09-07 (Card 8 → Downloads 구현)