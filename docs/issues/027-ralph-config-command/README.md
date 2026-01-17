# Issue #027: /ralph config 명령 구현

> Phase 4: Polish | 의존성: #005

## 배경

Ralph Loop 설정을 조회하고 수정하는 명령이 필요합니다.

## 작업 내용

1. **명령 정의**
   ```
   /ralph config                           # 현재 설정 조회
   /ralph config set ralph.max_iterations 15
   /ralph config init                      # 대화형 초기 설정
   ```

2. **설정 조회 출력**
   ```
   ⚙️ Ralph 설정

   ralph:
     max_iterations: 10
     context_budget: 0.6
     cooldown_ms: 1000
     success_criteria:
       - type: test_pass
         command: npm test

   memory:
     auto_inject: true
     max_inject_tokens: 2000

   설정 파일: .ralph-mem/config.yaml
   ```

3. **대화형 초기 설정** (init)
   - 프로젝트 유형 감지
   - 테스트/빌드 명령 제안
   - 설정 파일 생성

4. **설정 수정**
   - 점 표기법으로 경로 지정
   - 타입 검증
   - 파일 저장

## 인수 조건

- [x] 현재 설정 조회
- [x] 개별 값 수정
- [x] 대화형 초기 설정
- [x] 잘못된 키 에러 처리
- [x] 타입 검증

## Evidence

[evidence.md](evidence.md)

## 검증 명령

```bash
bun test src/skills/__tests__/ralph-config.test.ts

# 테스트 케이스
# - 설정 조회
# - 값 수정 및 저장
# - 잘못된 키 에러
# - 타입 불일치 에러
```
