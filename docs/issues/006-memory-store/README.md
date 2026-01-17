# Issue #006: Memory Store 구현

> Phase 1: Core Layer | 의존성: #004, #005

## 배경

DB 클라이언트 위에서 동작하는 고수준 Memory Store가 필요합니다.
Session과 Observation의 생명주기를 관리하고 토큰 카운트를 추적합니다.

## 작업 내용

1. **Memory Store 인터페이스** (`src/core/store.ts`)
   ```typescript
   interface MemoryStore {
     // Session 관리
     createSession(projectPath: string): Promise<Session>;
     getCurrentSession(): Session | null;
     endSession(summary?: string): Promise<void>;

     // Observation 관리
     addObservation(obs: CreateObservation): Promise<Observation>;
     getObservation(id: string): Promise<Observation | null>;
     getRecentObservations(limit: number): Promise<Observation[]>;

     // 정리
     summarizeAndDelete(before: Date): Promise<number>;

     // 통계
     getTokenCount(): number;
   }
   ```

2. **세션 생명주기**
   - 세션 시작 시 DB 백업
   - 현재 세션 상태 유지
   - 세션 종료 시 요약 저장

3. **Observation 추가 시**
   - ID 자동 생성
   - 타임스탬프 자동 설정
   - 토큰 수 계산 및 누적

4. **메모리 정리**
   - retention_days 이전 데이터 조회
   - 요약 후 삭제 (삭제된 개수 반환)

## 인수 조건

- [x] createSession → getCurrentSession 일치
- [x] addObservation 후 getObservation 성공
- [x] endSession 후 getCurrentSession null
- [x] getRecentObservations 최신순 정렬
- [x] getTokenCount 누적 정확
- [x] summarizeAndDelete 정상 동작

## 검증 명령

```bash
bun run test tests/core/store.test.ts
```

## 완료

- **완료일**: 2025-01-17
- **Evidence**: [evidence.md](./evidence.md)
