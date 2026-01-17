# ralph-mem 태스크 리스트

> PRD의 구현 태스크를 추적합니다. 완료된 항목은 `[x]`로 표시합니다.

## Phase 1: Core Layer

- [ ] 프로젝트 구조 설정 (Bun, TypeScript, Vitest)
- [ ] plugin.json 매니페스트 작성
- [ ] SQLite 스키마 정의 및 마이그레이션 시스템
- [ ] DB 클라이언트 구현 (src/core/db/client.ts)
- [ ] Memory Store 구현 (src/core/store.ts)
- [ ] Search Engine 구현 (src/core/search.ts)

## Phase 2: Hook Layer

- [ ] SessionStart hook 구현
- [ ] SessionEnd hook 구현
- [ ] UserPromptSubmit hook 구현 (컨텍스트 주입)
- [ ] PostToolUse hook 구현 (관찰 기록)
- [ ] 기본 설정 관리 (src/utils/config.ts)
- [ ] `/mem-search` skill 구현 (Layer 1)

## Phase 3: Feature Layer (Ralph Loop)

- [ ] Loop Engine 기본 구조 (src/features/ralph/engine.ts)
- [ ] Success Criteria 평가기 (test_pass, build_success)
- [ ] Success Criteria 확장 (lint_clean, type_check, custom)
- [ ] Loop 상태 관리 (running, success, failed, stopped)
- [ ] `/ralph start` 명령 구현
- [ ] `/ralph stop` 명령 구현
- [ ] `/ralph status` 명령 구현
- [ ] Loop-Hook 통합 (iteration 결과 자동 기록)

## Phase 4: Polish

- [ ] AI 기반 컨텍스트 압축 (src/core/compressor.ts)
- [ ] 압축용 프롬프트 작성 (prompts/compressor.md)
- [ ] FTS5 전문 검색 최적화
- [ ] Progressive Disclosure 구현 (Layer 2, 3)
- [ ] 세션 요약 자동 생성
- [ ] 토큰 계산 유틸리티 (src/utils/tokens.ts)
- [ ] 단위 테스트 작성 (tests/core/)
- [ ] 단위 테스트 작성 (tests/hooks/)
- [ ] 단위 테스트 작성 (tests/features/)
- [ ] 테스트 커버리지 80% 달성
- [ ] `/mem-inject` skill 구현
- [ ] `/mem-forget` skill 구현
- [ ] `/mem-status` skill 구현
- [ ] `/ralph config` 명령 구현
- [ ] 성능 최적화 (검색 응답 < 200ms)
- [ ] 에러 핸들링 및 graceful degradation
- [ ] 문서화 (docs/ARCHITECTURE.md)
