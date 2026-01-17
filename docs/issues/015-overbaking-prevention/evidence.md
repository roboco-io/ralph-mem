# Evidence: Issue #015 Overbaking 방지 로직

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (35개)

```
$ bun run test tests/features/ralph/stop-conditions.test.ts
 ✓ tests/features/ralph/stop-conditions.test.ts (35 tests) 7ms

 Test Files  1 passed
      Tests  35 passed
```

### 2. StopConditions 인터페이스

```typescript
interface StopConditions {
  maxIterations: number;      // 기본: 10
  maxDurationMs: number;      // 기본: 30분
  noProgressThreshold: number; // 기본: 3회
}

interface StopReason {
  reason: 'max_iterations' | 'max_duration' | 'no_progress';
  details: string;
}
```

### 3. 중단 조건 검사

```typescript
const reason = shouldStop(state, conditions);

// 우선순위:
// 1. max_iterations (하드 리밋)
// 2. max_duration (시간 제한)
// 3. no_progress (진척 없음)

if (reason) {
  console.log(`Stopping: ${reason.reason} - ${reason.details}`);
}
```

### 4. 진척 감지

```typescript
const detector = createSimpleProgressDetector();

// 에러 수 감소 = 진척
await detector.detectProgress(
  "error: 2 tests failed",
  "error: 1 test failed"
); // → true

// 성공 패턴 증가 = 진척
await detector.detectProgress(
  "Running tests...",
  "Running tests... ✓ All passed"
); // → true

// 동일 출력 = 진척 없음
await detector.detectProgress("same", "same"); // → false
```

### 5. StopConditionManager 사용

```typescript
const manager = createStopConditionManager({
  maxIterations: 10,
  maxDurationMs: 60000,
  noProgressThreshold: 3,
});

// 반복 기록
await manager.recordIteration(output);

// 중단 조건 검사
const reason = manager.shouldStop();

// 성공 시 카운터 리셋
manager.resetNoProgressCount();
```

### 6. Claude 기반 진척 감지

```typescript
const detector = createClaudeProgressDetector(async (prev, current) => {
  // Claude API 호출로 진척 판단
  return true;
});
```

### 7. Config 연동

```typescript
const conditions = loadStopConditions({
  ralph: {
    max_iterations: 20,
    max_duration_ms: 3600000,
    no_progress_threshold: 5,
    // ...
  },
});
```

### 8. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `src/features/ralph/stop-conditions.ts` | Overbaking 방지 로직 |
| `tests/features/ralph/stop-conditions.test.ts` | 35개 테스트 |

## 수정된 파일

| 파일 | 변경 내용 |
|------|------|
| `src/utils/config.ts` | `max_duration_ms`, `no_progress_threshold` 추가 |

## 구현 상세

- **shouldStop**: 복합 중단 조건 검사 (우선순위 적용)
- **createSimpleProgressDetector**: 휴리스틱 기반 진척 감지
- **createClaudeProgressDetector**: Claude 기반 진척 감지 (fallback 지원)
- **createStopConditionManager**: 상태 관리 및 중단 조건 통합
- **loadStopConditions**: Config에서 조건 로드
- **loopRunToState**: DB 레코드 → 상태 변환

## 전체 테스트

```
$ bun run test
 Test Files  14 passed (14)
      Tests  326 passed (326)
```
