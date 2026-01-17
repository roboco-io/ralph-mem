---
description: Ralph Loop 제어 - 성공할 때까지 반복 실행 (start, stop, status, config)
---

# Ralph Loop

성공 기준을 달성할 때까지 작업을 자동으로 반복 실행합니다.

## 사용법

- `start "task"` - Loop 시작
- `start "task" --criteria lint_clean` - 커스텀 성공 기준으로 시작
- `stop` - Loop 중단
- `stop --rollback` - 변경사항 롤백하며 중단
- `status` - 현재 상태 확인
- `config` - 설정 확인/변경

## 성공 기준

- `test_pass` - 테스트 통과 (기본값)
- `build_success` - 빌드 성공
- `lint_clean` - Lint 오류 없음
- `type_check` - 타입 체크 통과
- `custom` - 사용자 정의 명령

$ARGUMENTS
