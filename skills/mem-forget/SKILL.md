---
name: mem-forget
description: 특정 메모리 항목을 삭제합니다. 더 이상 필요 없는 컨텍스트를 정리할 때 사용합니다.
---

# Memory Forget

특정 메모리 항목을 삭제합니다.

## 사용법

```
/mem-forget obs-a1b2c3d4
/mem-forget --session sess-xyz123
/mem-forget --before 30d
```

## 옵션

- `--session <id>` - 특정 세션의 모든 관찰 삭제
- `--before <duration>` - 지정 기간 이전의 관찰 삭제
- `--type <type>` - 특정 타입의 관찰만 삭제
- `--dry-run` - 실제 삭제 없이 대상 확인

$ARGUMENTS
