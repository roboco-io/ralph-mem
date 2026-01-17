# Issue #022: AI 기반 컨텍스트 압축

> Phase 4: Polish | 의존성: #006

## 배경

Context budget 초과 시 자동으로 오래된 컨텍스트를 압축해야 합니다.
유형에 따라 다른 압축 전략을 적용합니다.

## 작업 내용

1. **Compressor 인터페이스** (`src/core/compressor.ts`)
   ```typescript
   interface Compressor {
     compress(obs: Observation): Promise<string>;
     shouldCompress(obs: Observation): boolean;
     compressBatch(observations: Observation[]): Promise<void>;
   }
   ```

2. **유형별 압축 전략**
   | 유형 | 압축 방식 |
   |------|----------|
   | `tool_use` | 도구명 + 결과 요약 |
   | `bash` | 명령어 + 출력 요약 |
   | `error` | 전체 유지 (디버깅용) |
   | `success` | 전체 유지 (패턴 학습) |

3. **압축 프롬프트** (`prompts/compressor.md`)
   ```markdown
   다음 도구 사용 결과를 한 문장으로 요약하세요:

   도구: {tool_name}
   결과: {content}

   요약:
   ```

4. **자동 압축 트리거**
   - context budget 60% 초과 시
   - 오래된 것부터 압축
   - 압축된 버전을 content_compressed에 저장

## 인수 조건

- [x] tool_use 압축 동작
- [x] bash 출력 압축 동작
- [x] error/success 압축 안 함
- [x] 압축 결과 저장
- [x] 배치 압축 동작

## Evidence

[evidence.md](evidence.md)

## 검증 명령

```bash
bun test src/core/__tests__/compressor.test.ts

# 테스트 케이스
# - tool_use 압축
# - bash 출력 압축
# - error 압축 스킵
# - 배치 압축
# - 압축률 검증 (원본 대비 50% 이하)
```
