# Evidence: Issue #014 Success Criteria 평가기

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (45개)

```
$ bun run test tests/features/ralph/criteria.test.ts
 ✓ tests/features/ralph/criteria.test.ts (45 tests) 693ms

 Test Files  1 passed
      Tests  45 passed
```

### 2. CriteriaEvaluator 인터페이스

```typescript
interface CriteriaEvaluator {
  evaluate(criteria: SuccessCriteria, options?: EvaluationOptions): Promise<EvaluationResult>;
  evaluateAll(criteria: SuccessCriteria[], options?: EvaluationOptions): Promise<EvaluationResult>;
}

interface EvaluationResult {
  success: boolean;
  output: string;
  reason: string;
  exitCode?: number;
  suggestions?: string[];
}
```

### 3. 기본 Criteria 타입

```typescript
type SuccessCriteriaType =
  | "test_pass"      // npm test
  | "build_success"  // npm run build
  | "lint_clean"     // npm run lint
  | "type_check"     // npx tsc --noEmit
  | "custom";        // 사용자 정의 명령

// 기본 명령 설정
const DEFAULT_COMMANDS = {
  test_pass: { command: "npm", args: ["test"] },
  build_success: { command: "npm", args: ["run", "build"] },
  lint_clean: { command: "npm", args: ["run", "lint"] },
  type_check: { command: "npx", args: ["tsc", "--noEmit"] },
};
```

### 4. 사용 예시

```typescript
const evaluator = createCriteriaEvaluator();

// 단일 평가
const result = await evaluator.evaluate({
  type: "test_pass",
  command: "bun test", // 커스텀 명령 (선택)
  timeout: 60000,      // 타임아웃 (선택)
});

// 결과
// → { success: true, output: "...", reason: "test_pass passed", exitCode: 0 }

// 복수 평가 (하나라도 실패하면 중단)
const result = await evaluator.evaluateAll([
  { type: "type_check" },
  { type: "test_pass" },
]);
```

### 5. Claude 기반 판단

```typescript
const evaluator = createCriteriaEvaluatorWithClaude(async (type, output, exitCode) => {
  // Claude API 호출
  return {
    success: true,
    reason: "Claude says it passed",
    suggestions: [],
  };
});
```

### 6. 타임아웃 처리

```typescript
const result = await evaluator.evaluate({
  type: "custom",
  command: "long-running-command",
  timeout: 5000, // 5초 타임아웃
});

// 타임아웃 발생 시
// → { success: false, exitCode: -1, reason: "Command timed out", suggestions: ["Increase timeout..."] }
```

### 7. 개선 제안 자동 추출

```typescript
// 테스트 실패 시
const suggestions = extractSuggestions("test_pass", stdout, stderr);
// → ["Fix failing tests: FAIL tests/example.test.ts", "Check for runtime errors..."]

// 빌드 실패 시
// → ["Install missing dependencies", "Fix syntax errors..."]

// TypeScript 오류 시
// → ["Fix TypeScript errors: TS2339, TS2304"]
```

### 8. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `src/features/ralph/criteria.ts` | Success Criteria 평가기 구현 |
| `tests/features/ralph/criteria.test.ts` | 45개 테스트 |

## 수정된 파일

| 파일 | 변경 내용 |
|------|------|
| `src/utils/config.ts` | `type_check` 타입 추가, `expectedExitCode`, `timeout` 필드 추가 |

## 구현 상세

- **createCriteriaEvaluator**: 기본 평가기 팩토리
- **createCriteriaEvaluatorWithClaude**: Claude 통합 평가기 팩토리
- **executeCommand**: 타임아웃 지원 명령 실행
- **extractSuggestions**: 출력에서 개선 제안 추출
- **getCommandConfig**: Criteria 타입별 기본 명령 반환
- **parseCommand**: 명령 문자열 파싱

## 전체 테스트

```
$ bun run test
 ✓ tests/features/ralph/criteria.test.ts (45 tests) 690ms
 ✓ tests/features/ralph/engine.test.ts (24 tests) 471ms
 ...

 Test Files  13 passed (13)
      Tests  291 passed (291)
```
