# Issue #024: /mem-status Skill 구현

> Phase 4: Polish | 의존성: #006, #023

## 배경

메모리 사용량과 상태를 조회하는 skill이 필요합니다.

## 작업 내용

1. **Skill 정의** (`src/skills/mem-status.ts`)
   ```typescript
   interface MemStatusSkill {
     name: '/mem-status';
     execute(): Promise<string>;
   }
   ```

2. **출력 형식**
   ```
   📊 ralph-mem 상태

   메모리:
   ├─ 세션: 15개 (최근 30일)
   ├─ 관찰: 342개
   ├─ 용량: 12.5 MB
   └─ 마지막 백업: 1/15 14:00

   토큰:
   ├─ 현재 세션: 2,340 tokens
   ├─ Budget: 15,000 tokens (60%)
   └─ 사용률: 15.6%

   Loop:
   ├─ 현재: 비활성
   ├─ 총 실행: 8회
   └─ 성공률: 75%

   설정: .ralph-mem/config.yaml
   ```

3. **통계 수집**
   - 세션 수, 관찰 수
   - DB 파일 크기
   - 토큰 사용량
   - Loop 실행 이력

## 인수 조건

- [x] 세션/관찰 통계 표시
- [x] DB 용량 표시
- [x] 토큰 사용량 표시
- [x] Loop 통계 표시
- [x] 설정 파일 경로 표시

## Evidence

[evidence.md](evidence.md)

## 검증 명령

```bash
bun test src/skills/__tests__/mem-status.test.ts

# 테스트 케이스
# - 기본 상태 출력
# - 빈 DB 상태
# - Loop 이력 있을 때
```
