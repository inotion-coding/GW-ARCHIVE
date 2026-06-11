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
| 8 | 8 | Placeholder 3 | `#b8b0b0` | 라벤더·옐로 파스텔 구체 (3D 추상) |
| 9 | 9 | Placeholder 4 | `#a8b8a8` | 흰 모래 물결 질감 (3D 추상) |
| 10 | 10 | Documents | `#c0c8b0` | 블랙 광택 조형물 (3D 추상) |

---

## 카드별 상세 내용

### Card 1 — Welcome
- **주제**: 앱 소개 / 제스처 튜토리얼
- **설명**: GW ARCHIVE 소개와 8종 제스처(손 활성화/잠금·카드 넘기기·롤 스크롤·카드 열기·뒤로가기·줌·밀어 치우기·캘린더 날짜 선택) 사용법을 아이콘과 함께 안내. 제스처 명세는 `GESTURE.md` 기반. WelcomePage(`/motion/1`)로 라우팅.
- **상태**: 구현 완료

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

### Card 8 — Placeholder 3
- **주제**: 미정
- **상태**: 콘텐츠 미구현

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

**Last Updated**: 2026-06-12 (Card 5 → World Clock, Card 7 → D-Day 구현)
