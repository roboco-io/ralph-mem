# Issue #023: 토큰 계산 유틸리티

> Phase 4: Polish | 의존성: #001

## 배경

Context budget 관리를 위해 정확한 토큰 수 계산이 필요합니다.

## 작업 내용

1. **Token Counter** (`src/utils/tokens.ts`)
   ```typescript
   interface TokenCounter {
     count(text: string): number;
     countMessages(messages: Message[]): number;
     estimateTokens(text: string): number;  // 빠른 추정
   }
   ```

2. **토큰 계산 방법**
   - tiktoken 또는 유사 라이브러리 사용
   - Claude 모델 토크나이저 호환

3. **빠른 추정**
   - 정확한 계산이 필요 없을 때
   - 대략적인 문자/단어 기반 추정
   - 한국어 고려 (문자당 ~1.5 토큰)

4. **Budget 계산**
   ```typescript
   interface BudgetCalculator {
     getUsedTokens(): number;
     getRemainingTokens(): number;
     isOverBudget(): boolean;
     getUsagePercent(): number;
   }
   ```

## 인수 조건

- [x] 영어 텍스트 토큰 계산
- [x] 한국어 텍스트 토큰 계산
- [x] 코드 토큰 계산
- [x] 빠른 추정 오차 20% 이내
- [x] Budget 계산 정확

## Evidence

[evidence.md](evidence.md)

## 검증 명령

```bash
bun test src/utils/__tests__/tokens.test.ts

# 테스트 케이스
# - 영어 문장 토큰 수
# - 한국어 문장 토큰 수
# - 코드 블록 토큰 수
# - 추정 vs 실제 오차
# - Budget 임계값 검사
```
