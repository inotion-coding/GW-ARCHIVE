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
| 1 | 1 | Welcome | `#c8bfb0` | 환영/인사 테마 |
| 2 | 2 | Schedule | `#9aab98` | 시계/일정 테마 |
| 3 | 3 | Calendar | `#b8c0b8` | 달력/날짜 테마 |
| 4 | 4 | Weather | `#d0d0d0` | 하늘/날씨 테마 |
| 5 | 5 | Timer | `#b0c0c8` | 타이머/시간 테마 |
| 6 | 6 | Placeholder 1 | `#c0b8c0` | 추상 패턴 |
| 7 | 7 | Placeholder 2 | `#c8c0b0` | 추상 패턴 |
| 8 | 8 | Placeholder 3 | `#b8b0b0` | 추상 패턴 |
| 9 | 9 | Placeholder 4 | `#a8b8a8` | 추상 패턴 |
| 10 | 10 | Placeholder 5 | `#c0c8b0` | 추상 패턴 |

---

## 카드별 상세 내용

### Card 1 — Welcome
- **주제**: 인트로 / 환영 화면
- **설명**: 서비스 진입 시 표시되는 환영 인사 카드. 프로젝트 소개 및 제스처 조작 안내 포함 예정.
- **상태**: 개발 중

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

### Card 5 — Timer
- **주제**: 타이머 / 스톱워치
- **설명**: 카운트다운 타이머 또는 스톱워치 기능. 제스처로 시작/정지 조작 예정.
- **상태**: 개발 중

### Card 6 — Placeholder 1
- **주제**: 미정
- **상태**: 콘텐츠 미구현

### Card 7 — Placeholder 2
- **주제**: 미정
- **상태**: 콘텐츠 미구현

### Card 8 — Placeholder 3
- **주제**: 미정
- **상태**: 콘텐츠 미구현

### Card 9 — Placeholder 4
- **주제**: 미정
- **상태**: 콘텐츠 미구현

### Card 10 — Placeholder 5
- **주제**: 미정
- **상태**: 콘텐츠 미구현

---

## MotionPage 연결

카드 클릭(검지 탭 또는 마우스 클릭) 시 `/motion/:id` 로 라우팅.
`MotionPage`는 `src/pages/MotionPage.jsx`에서 `id`로 CARDS 조회 후 렌더링.

---

**Last Updated**: 2026-06-07 (카드 제목 영문화 + 테마별 이미지 교체)
