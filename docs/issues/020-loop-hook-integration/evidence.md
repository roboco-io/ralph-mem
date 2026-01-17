# Evidence: Issue #020 Loop-Hook 통합

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (12개)

```
$ bun run test tests/features/ralph/hook-integration.test.ts
 ✓ tests/features/ralph/hook-integration.test.ts (12 tests) 174ms

 Test Files  1 passed
      Tests  12 passed
```

### 2. Loop 컨텍스트 전달

```typescript
// PostToolUseContext에 loopContext 추가
interface PostToolUseContext {
  // ...기존 필드
  loopContext?: {
    runId: string;
    iteration: number;
  };
}

// Hook에서 observation에 loop 정보 저장
const observation = client.createObservation({
  session_id: sessionId,
  type,
  tool_name: toolName,
  content,
  importance,
  loop_run_id: context.loopContext?.runId,
  iteration: context.loopContext?.iteration,
});
```

### 3. Observation Loop 정보 조회

```typescript
// Loop별 observation 조회
const observations = client.listObservationsByLoopRun(loopRunId);

// Observation에서 loop 정보 접근
expect(obs.loop_run_id).toBe(loopRunId);
expect(obs.iteration).toBe(1);
```

### 4. Loop Engine 이벤트

```typescript
const engine = createLoopEngine(testDir, sessionId, { client });

// 반복 시작 이벤트
engine.onIterationStart((ctx) => {
  console.log(`Starting iteration ${ctx.iteration}`);
});

// 반복 종료 이벤트
engine.onIterationEnd((ctx, result) => {
  console.log(`Iteration ${ctx.iteration}: ${result.success}`);
});

// Loop 중 컨텍스트 접근
engine.onIteration(async () => {
  const loopContext = engine.getLoopContext();
  // { runId: "loop-...", iteration: 1 }
  return { success: true };
});
```

### 5. Loop 완료 요약

```typescript
// Loop 완료 시 자동 요약 생성
const result = await engine.start("Task", { maxIterations: 5 });

const observations = client.listObservationsByLoopRun(result.loopRunId);
const summary = observations.find(o => o.content.includes("Ralph Loop 완료"));

// 요약 내용:
// Ralph Loop 완료
// 태스크: Task
// 상태: 성공
// 반복: 3회
```

### 6. DB 마이그레이션

```sql
-- Migration 2: add_loop_context_to_observations
ALTER TABLE observations ADD COLUMN loop_run_id TEXT REFERENCES loop_runs(id);
ALTER TABLE observations ADD COLUMN iteration INTEGER;

CREATE INDEX idx_obs_loop_run ON observations(loop_run_id);
CREATE INDEX idx_obs_iteration ON observations(iteration);
```

### 7. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `tests/features/ralph/hook-integration.test.ts` | 12개 테스트 |

## 수정된 파일

| 파일 | 변경 내용 |
|------|------|
| `src/core/db/types.ts` | Observation에 loop_run_id, iteration 추가 |
| `src/core/db/migrations/index.ts` | Migration 2 추가 |
| `src/core/db/client.ts` | createObservation, listObservationsByLoopRun 수정 |
| `src/hooks/post-tool-use.ts` | LoopContext 타입, observation 저장 수정 |
| `src/features/ralph/engine.ts` | onIterationStart/End, getLoopContext, 요약 생성 |

## 구현 상세

- **LoopContext**: Loop 실행 중 runId와 iteration 정보 제공
- **getLoopContext()**: Engine에서 현재 Loop 컨텍스트 반환
- **onIterationStart/End**: 반복 시작/종료 이벤트 핸들러
- **createLoopSummary**: Loop 완료 시 자동 요약 observation 생성
- **listObservationsByLoopRun**: Loop별 observation 조회

## 전체 테스트

```
$ bun run test
 Test Files  19 passed (19)
      Tests  424 passed (424)
```
