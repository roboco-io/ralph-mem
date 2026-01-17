# Issue #015: Overbaking 방지 로직

> Phase 3: Feature Layer | 의존성: #013, #014

## 배경

Loop가 무한히 실행되거나 진척 없이 반복되는 것을 방지해야 합니다.
복합 중단 조건을 구현합니다.

## 작업 내용

1. **중단 조건** (`src/features/ralph/stop-conditions.ts`)
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

   function shouldStop(run: LoopRun, conditions: StopConditions): StopReason | null;
   ```

2. **진척 감지**
   ```typescript
   interface ProgressDetector {
     detectProgress(prev: string, current: string): Promise<boolean>;
   }
   ```
   - 이전 출력과 현재 출력 비교
   - Claude에게 진척 여부 판단 요청
   - 에러 수 감소, 새로운 접근 시도 등 고려

3. **Loop Engine 통합**
   - 각 iteration 후 중단 조건 검사
   - 진척 없음 카운터 관리
   - 중단 시 이유 기록

4. **설정 연동**
   - config.ralph에서 조건 값 로드

## 인수 조건

- [x] maxIterations 도달 시 중단
- [x] maxDuration 도달 시 중단
- [x] 연속 진척 없음 시 중단
- [x] 진척 있으면 카운터 리셋
- [x] 중단 이유 정확히 기록

## Evidence

[완료 검증 문서](./evidence.md)

## 검증 명령

```bash
bun test src/features/ralph/__tests__/stop-conditions.test.ts

# 테스트 케이스
# - 최대 반복 도달
# - 최대 시간 도달
# - 진척 없음 3회 연속
# - 진척 있어서 카운터 리셋
# - 복합 조건 우선순위
```
