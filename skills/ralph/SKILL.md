---
name: ralph
description: Ralph Loop 제어 - 성공할 때까지 반복 실행합니다. start, stop, status, config 서브커맨드를 지원합니다.
---

# Ralph Loop

성공 기준을 달성할 때까지 작업을 자동으로 반복 실행합니다.

## 사용법

### 시작
```
/ralph start "Implement feature X"
/ralph start "Fix lint errors" --criteria lint_clean
```

### 상태 확인
```
/ralph status
```

### 중단
```
/ralph stop
/ralph stop --rollback  # 변경사항 롤백
```

### 설정
```
/ralph config
/ralph config --max-iterations 15
```

## 성공 기준

- `test_pass` - 테스트 통과 (기본값)
- `build_success` - 빌드 성공
- `lint_clean` - Lint 오류 없음
- `type_check` - 타입 체크 통과
- `custom` - 사용자 정의 명령

$ARGUMENTS
