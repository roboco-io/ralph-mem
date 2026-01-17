---
name: mem-inject
description: 수동으로 컨텍스트를 메모리에 주입합니다. 중요한 정보를 영구 저장할 때 사용합니다.
---

# Memory Inject

수동으로 컨텍스트를 메모리에 저장합니다.

## 사용법

```
/mem-inject "이 프로젝트는 Express + Prisma 기반"
/mem-inject "API 엔드포인트는 /api/v1 prefix 사용" --type note
```

## 옵션

- `--type <type>` - 관찰 타입 (note, tool_use, bash, error, success)
- `--tags <tags>` - 태그 (쉼표로 구분)

$ARGUMENTS
