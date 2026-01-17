---
description: 저장된 메모리 검색 (Progressive disclosure로 토큰 효율적 사용)
---

# Memory Search

저장된 관찰 기록과 세션 정보를 검색합니다.

## 사용법

- `"keyword"` - 키워드로 검색 (Layer 1)
- `"keyword" --layer 2` - 타임라인 컨텍스트 포함
- `--layer 3 obs-id` - 특정 관찰의 전체 상세 정보
- `"keyword" --since 7d` - 최근 7일 내 검색

## 검색 레이어

| Layer | 내용 | 토큰 |
|-------|------|------|
| 1 | Index (ID + 점수) | 50-100/결과 |
| 2 | Timeline (시간순 컨텍스트) | 200-300/결과 |
| 3 | Full Details | 500-1000/결과 |

$ARGUMENTS
