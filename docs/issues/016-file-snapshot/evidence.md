# Evidence: Issue #016 파일 스냅샷 및 롤백

> 완료일: 2025-01-17

## 검증 결과

### 1. 테스트 통과 (28개)

```
$ bun run test tests/features/ralph/snapshot.test.ts
 ✓ tests/features/ralph/snapshot.test.ts (28 tests) 2800ms

 Test Files  1 passed
      Tests  28 passed
```

### 2. SnapshotManager 인터페이스

```typescript
interface SnapshotManager {
  create(runId: string): Promise<string>;
  restore(snapshotPath: string): Promise<void>;
  delete(snapshotPath: string): Promise<void>;
  list(): Promise<SnapshotInfo[]>;
  cleanup(maxAge: number): Promise<number>;
}

interface SnapshotInfo {
  runId: string;
  path: string;
  createdAt: Date;
  fileCount: number;
}
```

### 3. 변경 파일 감지 (git diff)

```typescript
const files = getModifiedFiles(projectPath);
// → ["src/file.ts", "tests/file.test.ts"]

// 감지 대상:
// - 수정된 파일 (git diff)
// - 스테이징된 파일 (git diff --cached)
// - 추적되지 않는 파일 (git ls-files --others)
```

### 4. 스냅샷 생성

```typescript
const manager = createSnapshotManager(projectPath);

// 스냅샷 생성
const snapshotPath = await manager.create("loop-001");
// → ".ralph-mem/snapshots/loop-001"

// 스냅샷 구조:
// .ralph-mem/snapshots/loop-001/
// ├── .snapshot-meta.json
// ├── src/
// │   └── file.ts
// └── tests/
//     └── file.test.ts
```

### 5. 롤백 (복원)

```typescript
// 파일 복원
await manager.restore(snapshotPath);

// 편의 함수
await restoreRunSnapshot(projectPath, "loop-001");
```

### 6. 스냅샷 관리

```typescript
// 목록 조회
const snapshots = await manager.list();
// → [{ runId: "loop-002", fileCount: 5, createdAt: Date }]

// 스냅샷 삭제
await manager.delete(snapshotPath);

// 오래된 스냅샷 정리 (1시간 이상)
const deleted = await manager.cleanup(3600000);
```

### 7. 디렉토리 구조 유지

```typescript
// 원본 파일
// src/utils/helper.ts

// 스냅샷 내 위치
// .ralph-mem/snapshots/loop-001/src/utils/helper.ts
```

### 8. TypeScript 컴파일 성공

```
$ bun run typecheck
(출력 없음 = 성공)
```

## 생성된 파일

| 파일 | 설명 |
|------|------|
| `src/features/ralph/snapshot.ts` | 스냅샷 매니저 구현 |
| `tests/features/ralph/snapshot.test.ts` | 28개 테스트 |

## 구현 상세

- **getModifiedFiles**: git diff로 변경 파일 감지
- **createSnapshotManager**: 스냅샷 매니저 팩토리
- **create**: 변경 파일 복사, 메타데이터 저장
- **restore**: 스냅샷에서 파일 복원
- **delete**: 스냅샷 디렉토리 삭제
- **list**: 모든 스냅샷 조회 (최신순)
- **cleanup**: 오래된 스냅샷 정리

## 전체 테스트

```
$ bun run test
 Test Files  15 passed (15)
      Tests  354 passed (354)
```
