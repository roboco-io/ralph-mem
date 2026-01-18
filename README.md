# ralph-mem

[![npm version](https://img.shields.io/npm/v/ralph-mem.svg)](https://www.npmjs.com/package/ralph-mem)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black.svg)](https://bun.sh/)

Claude Code를 위한 Ralph Loop 기반 지속적 컨텍스트 관리 플러그인

## 개요

ralph-mem은 [Geoffrey Huntley](https://ghuntley.com/)의 [Ralph Loop](https://ghuntley.com/ralph/)와 [thedotmack](https://github.com/thedotmack)의 [claude-mem](https://github.com/thedotmack/claude-mem)에서 영감을 받아 시작된 프로젝트입니다.

Ralph Loop의 "성공할 때까지 반복" 철학과 claude-mem의 "지능적 컨텍스트 관리"를 결합하여 Claude Code를 위한 지속적 메모리 관리 플러그인을 구현했습니다.

### 해결하는 문제

| 문제              | 설명                                         |
| ----------------- | -------------------------------------------- |
| **Context Rot**   | 누적된 불필요한 정보로 인한 모델 성능 저하   |
| **Compaction**    | context window 60-70% 초과 시 출력 품질 급락 |
| **Forgetfulness** | 세션 간 작업 맥락 손실                       |
| **One-shot 실패** | 복잡한 작업에서 단일 시도 성공률 저조        |

## 핵심 기능

### 1. Ralph Loop Engine

성공 기준 달성까지 자동으로 반복 실행합니다.

```bash
/ralph start "Add user authentication with JWT"
```

```mermaid
flowchart LR
    A[Prompt + Context] --> B[Agent Execute]
    B --> C{Success?}
    C -->|YES| D[Done]
    C -->|NO| E[Append Result]
    E --> A
```

**지원하는 성공 기준:**

- `test_pass` - 테스트 통과 (`npm test`, `pytest`)
- `build_success` - 빌드 성공
- `lint_clean` - Lint 오류 없음
- `type_check` - 타입 체크 통과
- `custom` - 사용자 정의 명령

### 2. Persistent Memory

세션 간 컨텍스트를 자동으로 저장하고 복원합니다.

```mermaid
flowchart TB
    A[새 세션 시작] --> B[관련 메모리 검색]
    B --> C[이전 작업 컨텍스트 주입]
    C --> D[세션 진행]
    D --> E[관찰 기록]
    E --> F[세션 종료]
    F --> G[요약 생성 및 저장]
```

**Lifecycle Hooks:**

- `SessionStart` - 관련 메모리 자동 주입
- `PostToolUse` - 도구 사용 결과 기록
- `Stop` - 세션 강제 종료 시 정리 작업
- `SessionEnd` - 세션 요약 생성 및 저장

### 3. Progressive Disclosure

토큰 효율적인 3계층 검색으로 약 10배 토큰 절약:

| Layer   | 내용                       | 토큰            |
| ------- | -------------------------- | --------------- |
| Layer 1 | Index (ID + 점수)          | 50-100/result   |
| Layer 2 | Timeline (시간순 컨텍스트) | 200-300/result  |
| Layer 3 | Full Details               | 500-1000/result |

```bash
/mem-search "authentication error"           # Layer 1
/mem-search --layer 3 obs-a1b2               # Layer 3
```

## 설치

### npm

```bash
npm install ralph-mem
```

### yarn

```bash
yarn add ralph-mem
```

### pnpm

```bash
pnpm add ralph-mem
```

### bun

```bash
bun add ralph-mem
```

### Claude Code 플러그인

Claude Code에서 플러그인으로 사용하려면 [roboco-io/plugins](https://github.com/roboco-io/plugins) 마켓플레이스를 통해 설치합니다:

```bash
# 1. 마켓플레이스 추가
/plugin marketplace add roboco-io/plugins

# 2. 플러그인 설치
/plugin install ralph-mem@roboco-plugins
```

또는 `/plugin` 명령으로 플러그인 매니저를 열어 UI에서 설치할 수 있습니다.

### 플러그인 업데이트

```bash
# 방법 1: CLI 명령으로 업데이트 (터미널에서 실행)
claude plugin update ralph-mem@roboco-plugins

# 방법 2: 재설치 (세션 내에서 실행)
/plugin uninstall ralph-mem
/plugin install ralph-mem@roboco-plugins
```

업데이트 후 Claude Code를 재시작하면 변경 사항이 적용됩니다.

## 사용법

### Ralph Loop

```bash
# Loop 시작 (기본: 테스트 통과까지)
/ralph start "Implement feature X"

# 커스텀 성공 기준으로 시작
/ralph start "Fix lint errors" --criteria lint_clean

# Loop 상태 확인
/ralph status

# Loop 중단
/ralph stop
```

### Memory 검색

```bash
# 키워드 검색
/mem-search "JWT authentication"

# 특정 관찰 상세 조회
/mem-search --layer 3 <observation-id>

# 시간 범위 검색
/mem-search "database" --since 7d
```

### Memory 관리

```bash
# 메모리 상태 확인
/mem-status

# 수동 컨텍스트 주입
/mem-inject "이 프로젝트는 Express + Prisma 기반"

# 특정 메모리 제거
/mem-forget <observation-id>
```

### 4. Privacy 기능

민감한 정보를 메모리에서 제외합니다.

**`<private>` 태그:**

```bash
# 태그로 감싼 내용은 저장되지 않습니다
My API key is <private>sk-1234567890</private>
# 저장됨: My API key is [PRIVATE]
```

**설정 기반 제외:**

```yaml
privacy:
  exclude_patterns:
    - "*.env"
    - "*password*"
    - "*secret*"
```

### 5. MCP 도구

스킬 외에 MCP(Model Context Protocol) 도구로도 메모리에 접근할 수 있습니다.

| 도구 | 설명 |
|------|------|
| `ralph_mem_search` | Progressive Disclosure 기반 검색 |
| `ralph_mem_timeline` | 특정 관찰 주변 시간순 컨텍스트 |
| `ralph_mem_get` | 관찰 ID로 전체 상세 조회 |

## 설정

`~/.config/ralph-mem/config.yaml`:

```yaml
ralph:
  max_iterations: 10          # 최대 반복 횟수
  context_budget: 0.6         # context window 사용률 상한
  cooldown_ms: 1000           # 반복 간 대기 시간
  success_criteria:
    - type: test_pass
      command: "npm test"

memory:
  auto_inject: true           # 세션 시작 시 자동 주입
  max_inject_tokens: 2000     # 주입 최대 토큰
  retention_days: 30          # 메모리 보관 기간

privacy:
  exclude_patterns:           # 저장 제외 패턴
    - "*.env"
    - "*password*"
    - "*secret*"
```

## 동작 원리

ralph-mem은 크게 두 가지 모드로 동작합니다:

1. **자동 모드 (Lifecycle Hooks)**: 사용자 개입 없이 백그라운드에서 동작
2. **명시적 모드 (Skills/Commands)**: 사용자가 슬래시 명령어로 직접 제어

### Lifecycle Hooks

플러그인이 설치되면 Claude Code의 lifecycle에 자동으로 연결되어 동작합니다.

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant Hook as Hook Layer
    participant Core as Core Layer
    participant DB as SQLite

    CC->>Hook: SessionStart
    Hook->>Core: 관련 메모리 검색
    Core->>DB: FTS5 + Embedding 검색
    DB-->>Core: 이전 컨텍스트
    Core-->>Hook: 검색 결과
    Hook-->>CC: 컨텍스트 자동 주입

    CC->>Hook: UserPromptSubmit
    Hook->>Core: 쿼리 관련 검색
    Core-->>Hook: 관련 메모리 알림
    Hook-->>CC: 알림 표시 (주입 X)

    CC->>Hook: PostToolUse
    Hook->>Core: 도구 사용 결과 기록
    Core->>DB: Observation 저장

    CC->>Hook: SessionEnd
    Hook->>Core: 세션 요약 생성
    Core->>DB: 요약 저장
```

| Hook | 시점 | 동작 |
|------|------|------|
| `SessionStart` | 세션 시작 | 프로젝트 관련 이전 컨텍스트 자동 주입 |
| `UserPromptSubmit` | 프롬프트 제출 | 관련 메모리 알림 (토큰 절약을 위해 주입하지 않음) |
| `PostToolUse` | 도구 사용 후 | 쓰기 도구, Bash 명령 결과를 Observation으로 기록 |
| `SessionEnd` | 세션 종료 | 세션 요약 생성 및 저장 |

### Ralph Loop 동작

`/ralph start` 명령으로 활성화되며, 성공 기준 달성까지 자동 반복합니다.

```mermaid
flowchart LR
    A[Task + Context] --> B[Claude 실행]
    B --> C{성공 판단}
    C -->|YES| D[완료]
    C -->|NO| E[결과 추가]
    E --> F{중단 조건?}
    F -->|NO| A
    F -->|YES| G[실패 + 롤백 안내]
```

**성공 판단**: Claude가 테스트/빌드 출력을 분석하여 성공 여부를 판단합니다.

**Overbaking 방지**: 무한 반복을 방지하기 위한 중단 조건:

| 조건 | 기본값 | 설명 |
|------|--------|------|
| `maxIterations` | 10 | 최대 반복 횟수 |
| `maxDurationMs` | 30분 | 최대 실행 시간 |
| `noProgressThreshold` | 3회 | 진척 없음 허용 횟수 |

**스냅샷**: Loop 시작 시 변경 파일을 스냅샷으로 저장하여 실패 시 롤백 가능.

### 검색 엔진

2단계 검색으로 최적의 결과를 반환합니다:

1. **FTS5 전문 검색** (기본): SQLite FTS5를 사용한 빠른 텍스트 검색
2. **Embedding 유사도** (폴백): FTS5 결과가 부족할 때 의미 기반 검색

**Embedding 모델**: `paraphrase-multilingual-MiniLM-L12-v2`
- 로컬 실행 (API 호출 없음)
- 50+ 언어 지원 (한국어, 영어 포함)
- 384차원, ~278MB

### 데이터 흐름

```mermaid
flowchart TB
    subgraph Input["입력"]
        Tool[도구 사용 결과]
        Prompt[사용자 프롬프트]
    end

    subgraph Process["처리"]
        Privacy[Privacy 필터]
        Compress[압축기]
        Embed[Embedding 생성]
    end

    subgraph Storage["저장"]
        Obs[(Observations)]
        Session[(Sessions)]
        FTS[(FTS5 Index)]
        Vec[(Embedding)]
    end

    Tool --> Privacy
    Privacy --> Compress
    Compress --> Obs
    Obs --> FTS
    Obs --> Embed
    Embed --> Vec

    Prompt --> FTS
    Prompt --> Vec
    FTS --> Result[검색 결과]
    Vec --> Result
```

### Observation 타입

도구 사용 결과는 타입별로 분류되어 저장됩니다:

| 타입 | 설명 | 기록 대상 |
|------|------|----------|
| `tool_use` | 도구 사용 결과 | Edit, Write 등 쓰기 도구 |
| `bash` | 명령 실행 결과 | Bash 명령어 |
| `error` | 에러 발생 | 모든 에러 (높은 중요도) |
| `success` | 성공 기록 | 테스트 통과, 빌드 성공 |
| `note` | 수동 메모 | `/mem-inject`로 주입된 내용 |

**중요도 자동 산정**:
- 에러 발생: 1.0 (최고)
- 테스트 통과/실패: 0.9
- 파일 생성/수정: 0.7
- 일반 명령: 0.5

## 아키텍처

```mermaid
flowchart TB
    subgraph Plugin["ralph-mem Plugin"]
        subgraph Interface["Interface Layer"]
            Hooks[Hooks]
            Skills[Skills]
            Loop[Loop Engine]
        end

        subgraph Core["Core Service"]
            Store[Memory Store]
            Search[Search Engine]
            Compress[Compressor]
        end

        subgraph Storage["Storage"]
            DB[(SQLite + FTS5)]
        end

        Hooks --> Core
        Skills --> Core
        Loop --> Core
        Core --> DB
    end
```

## 프로젝트 구조

```text
ralph-mem/
├── src/
│   ├── hooks/           # Lifecycle hooks
│   ├── skills/          # Slash commands
│   ├── loop/            # Ralph Loop engine
│   ├── memory/          # Memory store & search
│   └── db/              # SQLite + FTS5
├── prompts/             # AI 프롬프트
├── docs/
│   └── PRD.md           # Product Requirements
└── tests/
```

## 기술 스택

- **Runtime**: Bun
- **Language**: TypeScript
- **Database**: SQLite + FTS5
- **Testing**: Vitest

## 개발

```bash
# 의존성 설치
bun install

# 개발 모드
bun run dev

# 테스트
bun test

# 빌드
bun run build
```

## 참고 자료

- [Ralph Loop - Geoffrey Huntley](https://ghuntley.com/ralph/)
- [claude-mem](https://github.com/thedotmack/claude-mem)
- [Inventing the Ralph Wiggum Loop (Podcast)](https://linearb.io/dev-interrupted/podcast/inventing-the-ralph-wiggum-loop)
- [The Brief History of Ralph](https://www.humanlayer.dev/blog/brief-history-of-ralph)

## 라이선스

MIT
