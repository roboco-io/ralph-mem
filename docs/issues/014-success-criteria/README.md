# Issue #014: Success Criteria 평가기 구현

> Phase 3: Feature Layer | 의존성: #013

## 배경

Ralph Loop의 성공 여부를 판단하는 기준 평가기가 필요합니다.
test_pass, build_success 등 다양한 기준을 지원합니다.

## 작업 내용

1. **Criteria 인터페이스** (`src/features/ralph/criteria.ts`)
   ```typescript
   interface SuccessCriteria {
     type: CriteriaType;
     command?: string;
     expectedExitCode?: number;
   }

   type CriteriaType =
     | 'test_pass'
     | 'build_success'
     | 'lint_clean'
     | 'type_check'
     | 'custom';

   interface CriteriaEvaluator {
     evaluate(criteria: SuccessCriteria): Promise<EvaluationResult>;
   }

   interface EvaluationResult {
     success: boolean;
     output: string;
     reason: string;
     suggestions?: string[];
   }
   ```

2. **기본 평가기 구현**
   - `test_pass`: `npm test` 또는 설정된 명령 실행
   - `build_success`: `npm run build` 실행
   - `custom`: 사용자 정의 명령 실행

3. **Claude 기반 판단**
   - 명령 출력을 Claude에게 전달
   - 성공/실패 판단 요청
   - 개선 제안 추출

4. **명령 실행**
   - 타임아웃 설정
   - exit code 확인
   - stdout/stderr 캡처

## 인수 조건

- [x] test_pass 평가 동작
- [x] build_success 평가 동작
- [x] custom 명령 평가 동작
- [x] 명령 실패 시 실패 판정
- [x] Claude 판단 결과 반영
- [x] 타임아웃 처리

## Evidence

[완료 검증 문서](./evidence.md)

## 검증 명령

```bash
bun test src/features/ralph/__tests__/criteria.test.ts

# 테스트 케이스
# - 테스트 통과 → success
# - 테스트 실패 → failure + 이유
# - 빌드 성공/실패
# - 커스텀 명령
# - 타임아웃 발생
```
