---
description: 수동으로 컨텍스트를 메모리에 주입
---

# Memory Inject

수동으로 컨텍스트를 메모리에 저장합니다.

## 사용법

- `"context"` - 컨텍스트 저장
- `"context" --type note` - 타입 지정하여 저장
- `"context" --tags tag1,tag2` - 태그와 함께 저장

## 관찰 타입

- `note` - 일반 메모 (기본값)
- `tool_use` - 도구 사용 기록
- `bash` - 명령어 실행 기록
- `error` - 에러 기록
- `success` - 성공 기록

$ARGUMENTS
