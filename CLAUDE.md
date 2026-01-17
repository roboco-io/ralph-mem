# ralph-mem

Claude Code를 위한 Ralph Loop 기반 지속적 컨텍스트 관리 플러그인

## 프로젝트 개요

ralph-mem은 [Ralph Loop](https://ghuntley.com/ralph/)의 "성공할 때까지 반복" 철학과 지능적 컨텍스트 관리를 결합한 Claude Code 플러그인입니다.

**해결하는 문제:**
- Context Rot: 누적된 불필요한 정보로 인한 모델 성능 저하
- Compaction: context window 60-70% 초과 시 출력 품질 급락
- Forgetfulness: 세션 간 작업 맥락 손실
- One-shot 실패: 복잡한 작업에서 단일 시도 성공률 저조

## 기술 스택

| 항목 | 기술 |
|------|------|
| Runtime | Bun |
| Language | TypeScript (ES2022, strict mode) |
| Database | SQLite + FTS5 |
| Testing | Vitest |
| Linting | Biome |

## 프로젝트 구조

```text
ralph-mem/
├── src/
│   ├── index.ts           # 플러그인 엔트리포인트
│   ├── core/              # Core Layer
│   │   ├── db/            # SQLite 클라이언트
│   │   ├── store.ts       # MemoryStore 인터페이스
│   │   └── search.ts      # SearchEngine 인터페이스
│   ├── hooks/             # Lifecycle hooks
│   ├── features/ralph/    # Ralph Loop 엔진
│   ├── skills/            # Slash commands
│   └── utils/             # 유틸리티
├── tests/                 # Vitest 테스트
├── docs/
│   ├── design/            # 설계 문서
│   └── issues/            # 구현 태스크 (폴더별 관리)
│       ├── 001-project-setup/
│       │   ├── README.md      # 이슈 내용
│       │   └── evidence.md    # 완료 검증 증거
│       ├── 002-plugin-manifest/
│       │   └── README.md
│       └── ...
└── .claude/               # Claude Code 설정
    ├── hooks/             # UserPromptSubmit hook
    └── commands/          # Custom skills
```

## 아키텍처

3계층 아키텍처로 구성:

1. **Core Layer** (`src/core/`)
   - MemoryStore: 세션/관찰 관리
   - SearchEngine: FTS5 전문 검색
   - SQLite 스토리지

2. **Hook Layer** (`src/hooks/`)
   - SessionStart: 관련 메모리 자동 주입
   - SessionEnd: 세션 요약 생성 및 저장
   - PostToolUse: 도구 사용 결과 기록
   - UserPromptSubmit: 컨텍스트 자동 주입

3. **Feature Layer** (`src/features/ralph/`)
   - Loop Engine: 성공까지 반복 실행
   - Success Criteria: 성공 기준 평가
   - Overbaking Prevention: 과도한 반복 방지

## 주요 개념

### Progressive Disclosure (3계층 검색)

토큰 효율적인 메모리 검색:

| Layer | 내용 | 토큰 |
|-------|------|------|
| Layer 1 | Index (ID + 점수) | 50-100/result |
| Layer 2 | Timeline (시간순 컨텍스트) | 200-300/result |
| Layer 3 | Full Details | 500-1000/result |

### Observation Types

```typescript
type ObservationType = "tool_use" | "bash" | "error" | "success" | "note";
```

## 커맨드

```bash
# 개발
bun install          # 의존성 설치
bun run dev          # Watch 모드 개발
bun run build        # 빌드

# 테스트
bun run test         # 테스트 실행 (vitest run)
bun run test:watch   # Watch 모드 테스트
bun run test:coverage # 커버리지 포함

# 검증
bun run typecheck    # TypeScript 타입 체크
bun run lint         # Biome lint
bun run lint:fix     # Biome lint 자동 수정
```

## 개발 가이드라인

### 코드 스타일

- TypeScript strict mode 사용
- ES2022 문법 사용 가능
- `@/*` path alias로 src 참조 (`import { foo } from "@/core/store"`)
- Biome으로 린트/포맷팅

### 테스트

- 테스트 파일: `tests/**/*.test.ts`
- Vitest 사용, globals: true 설정됨
- 커버리지 목표: 80%

### 이슈 작업 프로세스

1. `docs/issues/<이슈폴더>/README.md` 에서 이슈 확인
2. 의존성 그래프에 따라 순서대로 구현
3. 완료 시 인수조건 체크 (`[x]`)
4. 같은 폴더에 `evidence.md` 작성
5. `README.md`에 evidence 링크 추가

### 설계 문서

구현 전 반드시 해당 설계 문서 참조:

| 문서 | 내용 |
|------|------|
| [core-layer.md](docs/design/core-layer.md) | MemoryStore, SearchEngine 설계 |
| [hook-layer.md](docs/design/hook-layer.md) | Lifecycle hooks 설계 |
| [ralph-loop.md](docs/design/ralph-loop.md) | Loop 엔진 설계 |
| [storage-schema.md](docs/design/storage-schema.md) | SQLite 스키마 |
| [config-system.md](docs/design/config-system.md) | 설정 시스템 |
| [error-handling.md](docs/design/error-handling.md) | 에러 핸들링 전략 |

## 현재 상태

- **v0.1.0 릴리즈 완료** (2025-01-17)
- 전체 30개 이슈 완료 (Phase 1-4)
- npm 배포: <https://www.npmjs.com/package/ralph-mem>
- GitHub: <https://github.com/roboco-io/ralph-mem>

## 릴리즈

### 자동 릴리즈 (권장)

Git 태그를 푸시하면 GitHub Actions가 자동으로 릴리즈를 생성하고 npm에 배포합니다.

```bash
# 1. 버전 업데이트 (package.json, CHANGELOG.md)
npm version patch  # 또는 minor, major

# 2. 태그 푸시 (릴리즈 자동 트리거)
git push origin main --tags
```

**자동 실행 내용:**

- GitHub Release 생성 (CHANGELOG.md에서 릴리즈 노트 추출)
- npm 배포

### 수동 릴리즈

```bash
# 1. 버전 업데이트
npm version patch

# 2. 빌드 및 테스트
bun run build
bun run test

# 3. GitHub Release 생성
git push origin main --tags
gh release create v0.1.1 --generate-notes

# 4. npm 배포
npm publish --access public
```

### CHANGELOG 작성 규칙

`CHANGELOG.md`에 릴리즈 노트를 다음 형식으로 작성:

```markdown
## [0.1.1] - 2025-01-20

### Added
- 새로운 기능

### Changed
- 변경된 기능

### Fixed
- 버그 수정
```

### CI/CD 파이프라인

| 워크플로우 | 트리거 | 내용 |
|-----------|--------|------|
| CI ([ci.yml](.github/workflows/ci.yml)) | PR, push to main | typecheck, lint, test, build |
| Release ([release.yml](.github/workflows/release.yml)) | tag push (v*) | GitHub Release + npm publish |

### 필요한 Secrets

- `NPM_TOKEN`: npm 배포용 액세스 토큰 (GitHub Repository Settings > Secrets)

## 컨텍스트 자동 주입

이 프로젝트는 `.claude/hooks/user-prompt-submit.sh`를 통해 자동 컨텍스트 주입이 설정되어 있습니다:

- `#001`, `#002` 등 이슈 번호 언급 시 해당 이슈 폴더 안내
- `hook`, `loop`, `store`, `search` 등 키워드 언급 시 관련 설계 문서 주입
