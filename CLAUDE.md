# CLAUDE.md — 범용 AI 코드 어시스턴트 설정

> 이 파일의 규칙은 Claude Code, Codex CLI 및 이 프로젝트 내에서 사용하는 모든 AI 코드 도우미에 동일하게 적용됩니다.

---

## 🧠 핵심 원칙

- **코드 제공 전 반드시 관련 파일 확인**: 추측 기반 코드 제공 금지. Read/Grep 도구로 기존 구조·패턴·의존성을 파악한 후에만 코드 제안
- **현재 요구사항에 맞는 최소한의 코드만 제공**: 미래를 위한 투기적(speculative) 코드 추가 금지
- **불확실한 내용은 반드시 확인 후 진행**: 추측을 사실처럼 제시하지 않음

---

## 🚨 백업 규칙 (CRITICAL — 항상 활성화)

### 파일 수정 전 백업 필수

```bash
# 백업 파일 명명 형식
{원본파일명}_bak_{백업이유}_{YYYYMMDD}_{HHMMSS}.{확장자}

# 예시
config_bak_field_add_20260101_143000.json
utils_bak_refactoring_20260101_143000.py
```

#### 백업 이유 키워드
| 키워드 | 설명 |
|---|---|
| `structure_update` | 구조 변경 |
| `field_add` | 필드 추가 |
| `refactoring` | 코드 리팩토링 |
| `bug_fix` | 버그 수정 |
| `feature_add` | 새 기능 추가 |

#### 백업 절차

```bash
# 1. 타임스탬프 생성
TODAY=$(date '+%Y%m%d')
NOW=$(date '+%H%M%S')

# 2. 백업 생성
cp target_file.ext target_file_bak_백업이유_${TODAY}_${NOW}.ext

# 3. 백업 검증 (존재 및 크기 확인)
ls -la target_file_bak_백업이유_${TODAY}_${NOW}.ext
```

#### 금지 사항
```bash
# ❌ 금지
cp file.json file.backup       # 형식 불일치
mv file.json file_backup.json  # 원본 이동

# ✅ 허용
cp file.json file_bak_bug_fix_$(date '+%Y%m%d_%H%M%S').json
```

> **백업 생성 실패 시 원본 파일 수정 중단**

---

## 🔴 안전 규칙 (항상 활성화)

### 디렉토리/파일 삭제·이름 변경
- 사용자 명시적 동의 없이 디렉토리 삭제·이름 변경 절대 금지
- 실행 전 반드시 작업 내용 설명 → 승인 확인 → 백업 생성 → 실행 순서 준수

### 백업 파일 정리
- 백업 파일에 `rm` 명령어 사용 금지
- 정리 시 `_bak/` 디렉토리로 **이동(mv)** 만 허용

```bash
mkdir -p _bak
mv *_bak_* _bak/
```

### 커밋 시 _bak/ 오래된 파일 삭제
- 커밋 직전, `_bak/` 내 파일을 **수정 시간 내림차순** 정렬
- **가장 최근 2개는 보존**, 나머지는 `Remove-Item`(PowerShell) 또는 `rm`(Bash)으로 삭제
- `_bak/` 파일 삭제는 `.gitignore` 대상이므로 git에 반영되지 않음 → **별도 커밋 금지, 조용히 삭제만 수행**

```powershell
# PowerShell 예시
Get-ChildItem "_bak" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 2 | Remove-Item -Force
```

---

## 📋 Git 커밋 규칙

### 커밋 메시지 형식

```
{type}: {변경 요약}

## 주요 변경 사항
- 구체적인 변경 내용
- 추가된 기능 또는 수정된 버그

## 기술적 세부사항
- 구현 방식 또는 사용 기술
```

### type 목록
| type | 설명 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `refactor` | 리팩토링 |
| `docs` | 문서 변경 |
| `chore` | 빌드·설정 변경 |
| `test` | 테스트 추가·수정 |

### 커밋 규칙 (CRITICAL)

**커밋은 반드시 사용자에게 확인 후 진행한다. 임의 자동 커밋 금지.**

커밋 전 체크리스트:
1. 사용자에게 커밋 여부 확인 및 승인 받기
2. 변경된 기능에 따라 `GESTURE.md` / `CARDS.md` 업데이트
   - HandTracker.jsx 수정 → `GESTURE.md` 업데이트
   - cards.js 수정 → `CARDS.md` 업데이트
3. `_bak/` 오래된 파일 정리 (최근 2개만 보존)
4. 소스 파일만 스테이징 (`_bak/` 제외)
5. 커밋 메시지 형식 준수
6. 커밋 완료 후 사용자에게 커밋 해시 보고

### 금지 사항
```bash
# ❌ AI 서명 포함 커밋 금지
"🤖 Generated with Claude Code"
"Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 🔧 조건부 규칙 (키워드 자동 활성화)

| 키워드 | 활성화되는 규칙 | 핵심 동작 |
|---|---|---|
| `정리`, `cleanup`, `백업 정리` | 백업 정리 규칙 | `rm` 금지, `mv _bak/` 만 허용 |
| `디렉토리 삭제`, `폴더 삭제`, `rm -rf` | 디렉토리 안전 규칙 | 사용자 동의 필수, 백업 선행 |
| `주석`, `comment`, `JSDoc` | 주석 작성 규칙 | 파일 타입별 주석 형식 준수 |
| `버전 생성`, `create version` | 버전 규칙 | `{filename}_v_{version}.{ext}` 형식, `draft/` 저장 |

---

## ✅ 최종 확인 체크리스트

### 파일 수정 시
- [ ] 관련 파일 및 코드 사전 확인 완료
- [ ] 백업 생성 완료 (`_bak_이유_날짜_시간` 형식)
- [ ] 백업 파일 존재 및 크기 검증 완료

### 디렉토리 작업 시
- [ ] 사용자에게 작업 내용 설명 완료
- [ ] 사용자 명시적 승인 확인
- [ ] 백업 생성 후 실행

### 백업 정리 시
- [ ] `rm` 명령어 미사용 확인
- [ ] `mv *_bak_* _bak/` 로 이동만 수행

### 커밋 시
- [ ] 사용자 승인 확인
- [ ] 변경 내용에 따라 `GESTURE.md` / `CARDS.md` 업데이트 완료
- [ ] `_bak/` 최근 2개 초과 파일 삭제 완료
- [ ] `_bak/` 가 스테이징에 포함되지 않음 확인
- [ ] AI 서명 없음 확인
- [ ] 커밋 완료 후 해시 보고

---

## 📄 프로젝트 참조 문서

| 파일 | 설명 | 업데이트 트리거 |
|---|---|---|
| `GESTURE.md` | 제스처 동작 명세, handState 필드, 파라미터 | HandTracker.jsx 수정 시 |
| `CARDS.md` | 카드 1~10 상세 정보, 데이터 구조 | cards.js 또는 MotionPage 수정 시 |

---

**Last Updated**: 2026-06-07
**Version**: 1.2.0
