# Issue #020: Loop-Hook 통합

> Phase 3: Feature Layer | 의존성: #010, #013

## 배경

Ralph Loop 실행 중에도 Hook Layer가 정상 동작해야 합니다.
각 iteration 결과가 자동으로 메모리에 기록되어야 합니다.

## 작업 내용

1. **Loop 컨텍스트 전달**
   ```typescript
   // PostToolUse hook에서
   interface ToolUseContext {
     // 기존 필드...
     loopContext?: {
       runId: string;
       iteration: number;
     };
   }
   ```

2. **Observation에 Loop 정보 추가**
   ```typescript
   interface CreateObservation {
     // 기존 필드...
     loop_run_id?: string;
     iteration?: number;
   }
   ```

3. **Loop Engine 이벤트**
   - onIterationStart: Hook에 Loop 컨텍스트 설정
   - onIterationEnd: 결과 자동 기록
   - onComplete: 전체 결과 요약 기록

4. **컨텍스트 주입 강화**
   - UserPromptSubmit hook에서 Loop 상태 인식
   - 이전 iteration 결과를 컨텍스트에 포함

## 인수 조건

- [x] Loop 중 도구 사용 시 loop_run_id 기록
- [x] iteration 번호 정확히 기록
- [x] 이전 iteration 결과 컨텍스트 주입
- [x] Loop 완료 시 요약 observation 생성

## 검증 명령

```bash
bun test tests/features/ralph/hook-integration.test.ts

# 테스트 케이스
# - Loop 중 PostToolUse → loop_run_id 포함
# - 이전 iteration 결과 검색 가능
# - Loop 완료 후 요약 존재
```

## Evidence

- [evidence.md](./evidence.md)
