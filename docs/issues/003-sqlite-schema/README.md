# Issue #003: SQLite 스키마 정의 및 마이그레이션

> Phase 1: Core Layer | 의존성: #001

## 배경

메모리 저장을 위한 SQLite 데이터베이스 스키마와 마이그레이션 시스템이 필요합니다.
FTS5 전문 검색 인덱스도 포함되어야 합니다.

## 작업 내용

1. **스키마 파일 생성** (`src/core/db/schema.ts`)
   - sessions 테이블 정의
   - observations 테이블 정의
   - loop_runs 테이블 정의
   - observations_fts 가상 테이블 (FTS5)
   - 인덱스 정의

2. **마이그레이션 시스템** (`src/core/db/migrations/`)
   - 버전 관리 테이블 (`_migrations`)
   - 마이그레이션 파일 구조
   - 마이그레이션 실행 함수

3. **초기 마이그레이션** (`migrations/001_initial.ts`)
   ```sql
   CREATE TABLE sessions (...)
   CREATE TABLE observations (...)
   CREATE TABLE loop_runs (...)
   CREATE VIRTUAL TABLE observations_fts USING fts5(...)
   CREATE TRIGGER obs_ai AFTER INSERT ON observations ...
   ```

4. **타입 정의** (`src/core/db/types.ts`)
   - Session, Observation, LoopRun 타입
   - CreateSession, CreateObservation 입력 타입

## 인수 조건

- [x] 마이그레이션 실행 시 모든 테이블 생성됨
- [x] FTS5 가상 테이블이 정상 생성됨
- [x] 트리거가 정상 동작 (observations INSERT → FTS 동기화)
- [x] 마이그레이션 버전 추적 가능
- [x] 중복 마이그레이션 실행 시 스킵

## 검증 명령

```bash
# 마이그레이션 테스트
bun run test tests/core/db/migrations.test.ts
```

## 완료

- **완료일**: 2025-01-17
- **Evidence**: [evidence.md](./evidence.md)
