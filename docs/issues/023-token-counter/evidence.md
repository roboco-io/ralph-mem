# Evidence: Issue #023 토큰 계산 유틸리티

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (37개)

```
$ bun run test tests/utils/tokens.test.ts
 ✓ tests/utils/tokens.test.ts (37 tests) 5ms

 Test Files  1 passed
      Tests  37 passed
```

### 2. TokenCounter 인터페이스

```typescript
interface TokenCounter {
  count(text: string): number;
  countMessages(messages: Message[]): number;
  estimateTokens(text: string): number;
}
```

### 3. 영어 텍스트 토큰 계산

```typescript
estimateTokens("Hello world"); // → 3 (11 chars / 4)
countTokens("This is a test."); // → 4
```

### 4. 한국어 텍스트 토큰 계산

```typescript
estimateTokens("안녕하세요"); // → 4 (5 chars / 1.5)
estimateTokens("대한민국의 수도는 서울입니다"); // → 10-15
```

### 5. 코드 토큰 계산

```typescript
const code = `
function hello() {
  const message = "Hello";
  return message;
}
`;
estimateTokens(code); // → 17 (uses 3.5 chars/token)
```

### 6. BudgetCalculator

```typescript
const calculator = createBudgetCalculator({
  totalBudget: 1000,
  getCurrentContent: () => currentContext,
});

calculator.getUsedTokens();      // → 250
calculator.getRemainingTokens(); // → 750
calculator.isOverBudget();       // → false
calculator.getUsagePercent();    // → 25
```

### 7. 빠른 추정

```typescript
// 빠른 추정 (~3.5 chars/token)
quickEstimate("Hello world"); // → 4

// 정확도별 추정
getTokenEstimate(text, "quick");   // 빠름
getTokenEstimate(text, "normal");  // 기본
getTokenEstimate(text, "precise"); // 정밀
```

### 8. 압축 절감 계산

```typescript
const savings = calculateSavings(original, compressed);
// {
//   originalTokens: 50,
//   compressedTokens: 20,
//   savedTokens: 30,
//   savingsPercent: 60
// }
```

### 9. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `src/utils/tokens.ts` | Token Counter 구현 |
| `tests/utils/tokens.test.ts` | 37개 테스트 |

## 구현 상세

- **estimateTokens**: 언어별 토큰 추정 (영어 4, 한국어 1.5, 코드 3.5 chars/token)
- **countTokens**: 토큰 수 계산
- **countMessagesTokens**: 메시지 배열 토큰 계산 (오버헤드 포함)
- **createTokenCounter**: TokenCounter 팩토리
- **createBudgetCalculator**: BudgetCalculator 팩토리
- **quickEstimate**: 빠른 추정
- **calculateSavings**: 압축 절감 계산

## 전체 테스트

```
$ bun run test
 Test Files  22 passed (22)
      Tests  514 passed | 4 skipped (518)
```
