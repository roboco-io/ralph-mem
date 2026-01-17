---
name: mem-search
description: 저장된 메모리를 검색합니다. Progressive disclosure로 토큰을 효율적으로 사용합니다.
---

# Memory Search

저장된 관찰 기록과 세션 정보를 검색합니다.

## 사용법

```
/mem-search "authentication error"
/mem-search "JWT" --since 7d
/mem-search --layer 3 obs-a1b2c3d4
```

## 옵션

- `--layer <1|2|3>` - 검색 레이어 지정
  - Layer 1: Index (ID + 점수) - 50-100 토큰/결과
  - Layer 2: Timeline (시간순 컨텍스트) - 200-300 토큰/결과
  - Layer 3: Full Details - 500-1000 토큰/결과
- `--since <duration>` - 시간 범위 (예: 7d, 24h)
- `--limit <n>` - 최대 결과 수

$ARGUMENTS
