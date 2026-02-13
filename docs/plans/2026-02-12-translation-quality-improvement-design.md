# 번역 품질 개선 설계서

> 작성일: 2026-02-12
> 범위: 앞으로 2개월 이내 시장 (19,644개 이벤트)

---

## 1. 현황 분석

### 번역 아키텍처

```
[Polymarket API]
      |
      v  (4시간 주기, main.py + GitHub Actions)
[Supabase: poly_events]
      |
      |  title (영어 원문)
      v
[파이썬 번역 스크립트]  <-- 수동 실행 (ETL과 분리)
  - gpt-4o-mini / 100개 배치
  - translation_prompt.md + 용어 교정 사전
      |
      v
[Supabase: title_ko 컬럼]
```

- 번역 비용: 전체 ~$5 (gpt-4o-mini 기준)
- 최신 프롬프트: `translate_feb11_15_bot.py`로 2개월 이내 시장 덮어쓰기 번역 완료

### 2개월 이내 시장 현황

| 항목 | 수치 |
|------|------|
| 총 이벤트 | 19,644개 |
| 번역 완료 | 11,293개 (57.5%) |
| 미번역 | 8,351개 (42.5%) |

### 최신 프롬프트로도 해결 안 된 문제 3가지

| 문제 | 건수 | 원인 |
|------|------|------|
| "~을/를 가질까" 직역 | 103건 | gpt-4o-mini가 "have"를 기계적으로 "가지다"로 번역 |
| 문화 맥락 부재 | 8건+ | "Spring Festival Gala" -> "봄 축제 갈라" 등 |
| 영어 월명 잔존 | 22건 | February, March 등이 번역 안 됨 |
| 번역 일관성 분열 | 85개 title (382건) | 같은 title인데 다른 번역 (배치마다 LLM 응답 달라짐) |

참고: 시간대(ET/PT) 누락은 `_fix_timezone_consistency` 후처리로 **0건**까지 해결됨.

---

## 2. 개선 설계

### 접근 방식: 프롬프트 + 후처리 체계화 + 번역 캐시 (A안)

- 현재 모델(gpt-4o-mini) 유지
- API 추가 비용 $0
- 구조적 개선으로 품질 향상

---

### 2-1. 1단계: SQL로 일관성 정리 (비용 $0)

같은 title에 여러 다른 title_ko가 존재하는 85개 케이스를 가장 최신 번역으로 통일.

```sql
UPDATE poly_events p
SET title_ko = best.title_ko
FROM (
  SELECT DISTINCT ON (title) title, title_ko
  FROM poly_events
  WHERE title_ko IS NOT NULL AND end_date >= NOW()
  ORDER BY title, end_date DESC
) best
WHERE p.title = best.title
  AND p.title_ko != best.title_ko;
```

**효과**: 382개 이벤트의 번역 일관성 즉시 확보.

---

### 2-2. 2단계: 번역 캐시 도입 (비용 $0)

번역 전 DB에서 같은 title의 기존 번역을 조회하여 재사용.

```
[번역할 배치 100건]
      |
      v
[캐시 조회]
  SELECT DISTINCT ON (title) title, title_ko
  FROM poly_events
  WHERE title IN (배치 제목들) AND title_ko IS NOT NULL
  ORDER BY title, end_date DESC
      |
      +-- 캐시 히트 -> 재사용 (API 호출 안 함)
      |
      +-- 캐시 미스 -> OpenAI API 호출 -> 번역 -> DB 저장
```

**효과**:
- 일관성 100% 보장 (같은 title = 같은 번역, 영원히)
- API 비용 절감 (중복 title 재번역 방지)
- 속도 향상 (캐시 히트 시 즉시 처리)

---

### 2-3. 3단계: 후처리 파이프라인 통합 모듈화

현재 스크립트마다 제각각인 후처리를 **하나의 함수로 통합**.

#### 처리 순서

```
[OpenAI 번역 결과]
      |
      v
[1] 용어 교정 (GLOSSARY_CORRECTIONS)        <- 기존
      |
      v
[2] 시간대 검증 (_fix_timezone_consistency)  <- 기존
      |
      v
[3] "가질까" 문맥 교정                       <- 신규
      |
      v
[4] 문화 맥락 사전                           <- 신규
      |
      v
[5] 영어 월명 -> 한글 변환                   <- 신규
      |
      v
[최종 title_ko]
```

#### [3] "가질까" 문맥 교정 (103건 해결)

"have"를 "가지다"로 직역하는 패턴을 문맥에 따라 교정:

```python
HAVE_CORRECTIONS = [
    # 순위/모델 관련: "가질까" -> "차지할까"
    (r'(최고의|1위|2위|3위|#\d|위)\s.*을 가질까', '을 차지할까'),
    (r'(최고의|1위|2위|3위|#\d|위)\s.*를 가질까', '를 차지할까'),

    # 공연/선보이기: "가질까" -> "선보일까"
    (r'(댄서|공연|로봇).*를 가질까', '를 선보일까'),

    # 기록/수치: "가질까" -> "기록할까"
    (r'(청취자|조회수|팔로워).*를 가질까', '를 기록할까'),
]
```

적용 예시:

| 현재 | 교정 후 |
|------|--------|
| 최고의 AI 모델을 가질까? | 최고의 AI 모델을 차지할까? |
| 로봇 댄서를 가질까? | 로봇 댄서를 선보일까? |
| 가장 많은 청취자를 가질까? | 가장 많은 청취자를 기록할까? |

#### [4] 문화 맥락 사전 (8건+ 해결)

2단 방어 구조 (프롬프트 용어집 + 후처리 사전):

**후처리 사전:**

```python
CULTURAL_CONTEXT = {
    # 중국 문화
    '봄 축제 갈라': 'CCTV 춘완(춘절 갈라쇼)',
    '춘제 갈라': 'CCTV 춘완(춘절 갈라쇼)',
    '스프링 페스티벌 갈라': 'CCTV 춘완(춘절 갈라쇼)',

    # 격투기 용어
    '거리를 두고 갈까': '풀라운드까지 갈까',
    '거리가 끝날까': '풀라운드까지 갈까',
    '거리를 두고 진행될까': '풀라운드까지 갈까',
    '거리로 갈까': '풀라운드까지 갈까',

    # e스포츠 용어 (통일)
    '첫 번째 킬': '퍼스트 블러드',
    '첫 번째 피가 나올까': '퍼스트 블러드가 나올까',
    '첫 번째 피를 흘릴까': '퍼스트 블러드가 나올까',
    '첫 피를 흘릴까': '퍼스트 블러드가 나올까',
    '첫 피가 날까': '퍼스트 블러드가 나올까',
}
```

**프롬프트 용어집 추가:**

| 영어 | 한국어 | 설명 |
|------|--------|------|
| Spring Festival Gala | CCTV 춘완(춘절 갈라쇼) | 중국 설날 특별 생방송 |
| Go the Distance | 풀라운드까지 가다 | 격투기: 판정까지 가는 것 |
| First Blood | 퍼스트 블러드 | e스포츠: 첫 킬 |
| March Madness | NCAA 토너먼트 | 미국 대학 농구 |

새로운 문화 용어 발견 시 사전에 한 줄 추가로 해결 (코드 수정 불필요).

#### [5] 영어 월명 -> 한글 변환 (22건 해결)

```python
MONTH_MAP = {
    'January': '1월', 'February': '2월', 'March': '3월',
    'April': '4월', 'May': '5월', 'June': '6월',
    'July': '7월', 'August': '8월', 'September': '9월',
    'October': '10월', 'November': '11월', 'December': '12월',
}

def fix_english_months(text: str) -> str:
    for eng, kor in MONTH_MAP.items():
        text = text.replace(eng, kor)
    return text
```

#### 통합 함수

```python
def postprocess_translation(original: str, translated: str) -> str:
    """번역 후처리 파이프라인 (순서 중요)"""
    result = apply_glossary_corrections(translated)   # [1]
    result = fix_timezone_consistency(original, result) # [2]
    result = fix_have_translations(result)              # [3]
    result = apply_cultural_context(result)              # [4]
    result = fix_english_months(result)                  # [5]
    return result
```

---

## 3. 실행 계획 요약

| 단계 | 내용 | 비용 | 효과 |
|------|------|------|------|
| 1단계 | SQL로 85개 title 일관성 정리 | $0 | 382건 즉시 통일 |
| 2단계 | 번역 캐시 로직 도입 | $0 | 이후 일관성 100% + 비용 절감 |
| 3단계 | 후처리 파이프라인 통합 모듈 | $0 | 103 + 8 + 22건 교정 |

총 추가 비용: **$0** (모델 변경 없음, API 호출 추가 없음)
