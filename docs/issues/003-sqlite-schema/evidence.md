# Evidence: Issue #003 SQLite 스키마 정의 및 마이그레이션

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (14개)

```
$ bun run test
 ✓ tests/core/db/migrations.test.ts (14 tests) 22ms

 Test Files  1 passed
      Tests  14 passed
```

**테스트 케이스:**
- runMigrations: 테이블 생성, FTS5 생성, 중복 실행 스킵, 버전 추적
- FTS triggers: INSERT 동기화, DELETE 동기화, UPDATE 동기화
- getCurrentVersion: 초기값 0, 마이그레이션 후 버전
- needsMigration: 신규 DB true, 마이그레이션 완료 후 false
- Schema constraints: observation type 제약, loop_runs status 제약, CASCADE DELETE

### 2. 마이그레이션 실행 시 테이블 생성

```
테이블 목록:
- _migrations (마이그레이션 버전 추적)
- sessions
- observations
- observations_fts (FTS5 가상 테이블)
- loop_runs
```

### 3. FTS5 트리거 동작

```
# INSERT 트리거
INSERT INTO observations → observations_fts 자동 동기화

# DELETE 트리거
DELETE FROM observations → observations_fts에서 자동 제거

# UPDATE 트리거
UPDATE observations → observations_fts 자동 업데이트
```

### 4. 중복 마이그레이션 스킵

```
First run:  { applied: ['1_initial'], currentVersion: 1 }
Second run: { applied: [], currentVersion: 1 }  // 스킵됨
```

### 5. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `src/core/db/types.ts` | Session, Observation, LoopRun 등 타입 정의 |
| `src/core/db/schema.ts` | SQL 스키마 정의 |
| `src/core/db/migrations/index.ts` | 마이그레이션 시스템 (runMigrations, needsMigration 등) |
| `src/core/db/index.ts` | DB 모듈 re-export |
| `tests/core/db/migrations.test.ts` | 마이그레이션 테스트 (14개) |

## 의존성 추가

```json
{
  "dependencies": {
    "better-sqlite3": "^12.6.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13"
  }
}
```
