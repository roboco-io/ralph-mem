# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.8] - 2025-01-20

### Fixed
- Hook 실행 시 `bun:sqlite` 모듈을 찾을 수 없는 오류 수정 (node → bun 런타임 변경)

## [0.1.7] - 2025-01-20

### Fixed
- macOS ARM64에서 "Could not locate the bindings file" 에러 수정 (Issue #5)
- better-sqlite3에서 bun:sqlite로 마이그레이션하여 네이티브 바인딩 문제 해결
- FTS5 트리거로 인한 삭제 카운트 오류 수정 (mem-forget)

### Changed
- 테스트 러너를 vitest에서 bun test로 변경
- 모든 문서를 영문으로 번역
- 한국어 문서는 .ko.md 형식으로 이름 변경

### Documentation
- README, PRD, ARCHITECTURE 영문 번역
- docs/design/ 전체 영문 번역 (7개 문서)
- 각 영문 문서에 한국어 버전 링크 추가

## [0.1.3] - 2025-01-18

### Fixed
- CI 환경에서 타임아웃 테스트 안정화 (sleep 시간 단축)

## [0.1.2] - 2025-01-18

### Fixed
- CI 환경에서 테스트 타임아웃 문제 수정 (testTimeout 30초로 증가)

## [0.1.1] - 2025-01-18

### Fixed
- Hook 명령어가 사용자 프로젝트 디렉토리에서 실행될 때 MODULE_NOT_FOUND 오류 발생 문제 수정 (`$CLAUDE_PLUGIN_ROOT` 절대 경로 사용)
- Bun bundler duplicate export 버그 워크어라운드 추가

### Changed
- Claude Code 플러그인 구조를 공식 스키마로 재구성
- 플러그인 업데이트 안내 문서 개선

### Added
- commands 폴더 추가로 슬래시 명령어 등록 방식 개선
- README에 플러그인 업데이트 방법과 동작 원리 섹션 추가
- GitHub Actions CI/CD 워크플로우

## [0.1.0] - 2025-01-17

### Added

#### Core Layer
- SQLite + FTS5 기반 메모리 저장소
- Memory Store (세션/관찰 CRUD)
- Search Engine (전문 검색, Progressive Disclosure)
- Context Compressor (토큰 기반 압축)
- Embedding Service (의미 기반 검색)
- 설정 시스템 (글로벌/프로젝트 우선순위)

#### Hook Layer
- `SessionStart` - 세션 시작 시 이전 컨텍스트 주입
- `SessionEnd` - 세션 종료 시 요약 생성
- `PostToolUse` - 도구 사용 결과 자동 기록
- `UserPromptSubmit` - 관련 메모리 검색 및 주입

#### Feature Layer (Ralph Loop)
- Loop Engine - 성공 기준 달성까지 반복 실행
- Success Criteria - test_pass, build_success, lint_clean, type_check, custom
- Stop Conditions - 최대 반복, 시간 제한, 진척 없음 감지
- File Snapshot - 변경 파일 스냅샷 및 롤백

#### Skills (Slash Commands)
- `/ralph start <goal>` - Loop 시작
- `/ralph stop [--rollback]` - Loop 중단
- `/ralph status` - 상태 조회
- `/ralph config [key] [value]` - 설정 조회/변경
- `/mem-search <query> [--layer N]` - 메모리 검색
- `/mem-status` - 메모리 사용량 조회
- `/mem-inject <content>` - 수동 메모리 주입
- `/mem-forget <id> [--confirm]` - 메모리 삭제

#### Infrastructure
- 에러 핸들링 및 Graceful Degradation
- 토큰 계산 유틸리티
- 성능 벤치마크 (검색 < 1ms, Hook < 10ms)

### Performance
- 검색 응답: 0.6ms (1000 observations, 목표 < 200ms)
- Hook 오버헤드: 9ms (목표 < 50ms)
- 세션 시작: 1ms (목표 < 500ms)
- DB 크기: 60MB/1000 세션 (목표 < 100MB)

### Documentation
- PRD (Product Requirements Document)
- 아키텍처 문서
- 30개 이슈별 상세 문서 및 검증 기록
