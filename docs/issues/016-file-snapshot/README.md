# Issue #016: 파일 스냅샷 및 롤백

> Phase 3: Feature Layer | 의존성: #013

## 배경

Loop 시작 전 파일 상태를 저장하고, 실패 시 롤백할 수 있어야 합니다.
변경된 파일만 스냅샷하여 저장 공간을 절약합니다.

## 작업 내용

1. **Snapshot Manager** (`src/features/ralph/snapshot.ts`)
   ```typescript
   interface SnapshotManager {
     create(runId: string): Promise<string>;  // 스냅샷 경로 반환
     restore(snapshotPath: string): Promise<void>;
     delete(snapshotPath: string): Promise<void>;
     list(): Promise<SnapshotInfo[]>;
   }

   interface SnapshotInfo {
     runId: string;
     path: string;
     createdAt: Date;
     fileCount: number;
   }
   ```

2. **스냅샷 생성**
   - git diff로 변경 파일 감지
   - 변경 파일만 `.ralph-mem/snapshots/{runId}/`에 복사
   - 디렉토리 구조 유지

3. **롤백**
   - 스냅샷 파일을 원래 위치로 복원
   - 복원 전 현재 상태 백업 (선택적)

4. **스냅샷 정리**
   - 오래된 스냅샷 자동 삭제
   - 성공한 Loop의 스냅샷 정리

## 인수 조건

- [x] 변경 파일 감지 정확
- [x] 스냅샷 생성 성공
- [x] 롤백 시 파일 복원
- [x] 디렉토리 구조 유지
- [x] 스냅샷 목록 조회

## Evidence

[완료 검증 문서](./evidence.md)

## 검증 명령

```bash
bun test src/features/ralph/__tests__/snapshot.test.ts

# 테스트 케이스
# - 파일 변경 후 스냅샷 생성
# - 스냅샷에서 롤백
# - 빈 변경사항 시 빈 스냅샷
# - 스냅샷 삭제
```
