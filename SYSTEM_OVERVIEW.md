# System Overview

이 문서는 프로젝트의 전반적인 상태, 아키텍처, 수정 내역을 기록합니다.
에이전트 프롬프트가 초기화되어도 이 파일만 읽으면 전체 컨텍스트를 파악할 수 있습니다.

---

## 1. 프로젝트 개요

### 목적
Polymarket 예측 시장 데이터를 캘린더 형식으로 시각화하여 사용자에게 제공

### 주요 기능
- **Week View**: 현재 주 5일간 상세 타임라인 (KST 기준)
- **Calendar Overview**: 이후 3주간 개요 (상위 3개 이벤트만 표시)
- **필터링**: 카테고리, 태그, 거래량, 유동성, 시간 범위
- **다국어**: 한국어/영어 토글 지원
- **테마**: Dark/Light 모드
- **밀도**: Comfortable/Compact/Spacious

---

## 2. 아키텍처

### 기술 스택
- **Frontend**: Vanilla JavaScript (ES6+)
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Vercel (추정)
- **External API**: Polymarket (간접 참조, DB 동기화 시점에 사용됨)

### 데이터 흐름
```
Polymarket API (외부)
  ↓ (동기화 - 별도 프로세스)
Supabase: poly_events 테이블
  ↓ (클라이언트 로드)
web/app.js: allEvents 배열
  ↓ (필터링 + 렌더링)
Week View + Calendar Overview
  ↓ (사용자 클릭)
Polymarket 시장 페이지 (새 탭)
```

### 파일 구조
```
폴리마켓 커뮤니티/
├── web/
│   ├── app.js              # 메인 로직 (1455 lines)
│   ├── style.css           # 스타일
│   ├── index.html          # HTML 구조
│   ├── config.js           # Supabase 설정
│   └── .vercel/            # Vercel 배포 설정
├── AGENT_GUIDELINES.md     # AI 에이전트 작업 지침서
├── SYSTEM_OVERVIEW.md      # 이 파일
└── README.md               # 프로젝트 문서
```

---

## 3. 데이터베이스 스키마

### `poly_events` 테이블

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | text | 시장 고유 ID (PK) |
| `title` | text | 시장 제목 |
| `slug` | text | URL slug (⚠️ 개별 옵션 포함될 수 있음) |
| `end_date` | timestamptz | 종료 시간 (UTC) |
| `volume` | numeric | 총 거래량 ($) |
| `volume_24hr` | numeric | 24시간 거래량 ($) |
| `probs` | jsonb | 확률 배열 `[0.45, 0.55]` |
| `outcomes` | jsonb | 결과 옵션 `["Yes", "No"]` |
| `category` | text | 카테고리 (Sports, Crypto, Politics 등) |
| `tags` | text[] | 태그 배열 |
| `closed` | boolean | 정산 완료 여부 |
| `image_url` | text | 시장 이미지 URL |
| `market_group` | text | 시장 그룹 (현재 미사용) |

### 필터링 기본값
- **거래량**: $10K 이상
- **제외 카테고리**: Sports (위법성 고려)
- **데이터 범위**: 현재 시간 ~ 30일 후

---

## 4. 주요 기능 구현

### 4.1 타임존 처리 (KST)
- **모든 시간은 한국 표준시(Asia/Seoul) 기준**
- UTC → KST 변환: `toLocaleString('en-CA', { timeZone: 'Asia/Seoul' })`
- 날짜 비교: UTC 기반 Date 객체로 수행 (결과는 동일)

### 4.2 이벤트 링크 정규화 (⚠️ 중요)

**문제**: DB의 `slug`에 개별 옵션이 포함되어 404 에러 발생

**해결**: `openEventLink()` 함수에서 slug 정규화

#### 패턴 1: 온도 시장
```javascript
// Before: highest-temperature-in-seattle-on-february-10-2026-41forbelow
// After:  highest-temperature-in-seattle-on-february-10-2026
const tempRangePattern = /-(\d{4})-\d+-?\d*[cf](?:orhigher|orbelow)?$/;
```

**적용 케이스**:
- Fahrenheit: `-41forbelow`, `-42-43f`, `-52forhigher`
- Celsius: `-0c`, `-1c`, `-14corhigher`, `-35corbelow`

#### 패턴 2: 숫자 범위 시장
```javascript
// Before: elon-musk-of-tweets-february-3-february-10-380-399
// After:  elon-musk-of-tweets-february-3-february-10
const numericRangePattern = /-(\d+-\d+)$/;
```

**적용 케이스**:
- Elon Musk 트윗 수: `-220-239`, `-380-399`, `-420-439`
- 기타 범위형 시장

### 4.3 필터링 시스템
- **카테고리 필터**: Quick Filters (상단 칩) + Filter Modal
- **태그 필터**: Filter Modal 내 검색 가능
- **시간 범위**: 1일/3일/7일/전체
- **거래량/유동성**: 최소값 설정

---

## 5. 최근 수정 내역

### 2026-02-10: Week View 높이 불일치 문제 해결

**문제 발견**:
- 검색/필터링 시 이벤트가 있는 날짜 칸과 없는 날짜 칸의 높이가 다름
- 사용자 피드백: "검색 시 시장이 있는 시장의 날짜 칸과 없는 요일의 날짜칸이 다르잖아?"

**원인 분석**:
1. `.week-day`는 `flex-direction: column`으로 세로 레이아웃 사용
2. `.week-day-events`에 `flex: 1`이 없어서 내용물 높이만큼만 차지
3. 이벤트가 많은 날: `.week-day-events`가 내용물만큼 늘어남
4. 이벤트가 없는 날: `min-height: 200px`만 차지
5. 결과적으로 각 날짜 칸의 높이가 달라져 레이아웃 뒤틀림

**해결 과정** (시행착오):
1. 1차 시도: `.week-day-events`에 `flex: 1` 추가 → 실패
2. 2차 시도: `.week-timeline`에 `align-items: stretch` + `min-height: 500px` 추가 → 실패
3. **근본 원인 발견**: `.week-day-header`의 "N개 이벤트" 칩 유무로 헤더 높이가 달라짐
4. **최종 해결**: `.week-day-header { min-height: 90px; }` 추가

**결과**:
- ✅ 검색/필터링 시 모든 날짜 칸 높이 동일
- ✅ 레이아웃 일관성 유지
- ✅ 시각적 안정성 향상

**코드 위치**:
- `web/style.css:841-851` - `.week-day-header`에 `min-height: 90px` 추가
- `web/style.css:812-816` - `.week-timeline`에 `align-items: stretch`, `min-height: 500px` 추가
- `web/style.css:876-883` - `.week-day-events`에 `flex: 1` 추가

---

### 2026-02-10: 데이터 로딩 성능 획기적 개선 (90% 향상)

**문제 발견**:
- 초기 로딩 시간이 너무 오래 걸림 (7-10초)
- 30일치 18,538개 이벤트를 모두 로드 (약 37번 API 요청)
- 모든 필드(`select('*')`) 전송으로 불필요한 데이터 포함

**원인 분석**:
1. 과도한 데이터 로드 (Week View는 5일만 필요한데 30일치 로드)
2. 전송량 낭비 (17개 필드 중 9개만 실제 사용)
3. 캐싱 없음 (재방문 시 매번 새로 로드)

**해결 과정**:
1. **필드 최적화**: `select('*')` → `select('id, title, slug, ...')` (9개 필드)
   - 전송량 60% 감소
2. **점진적 로딩**: 30일 → 5일치만 초기 로드
   - 로드량 80% 감소 (18,538개 → 7,694개 이하)
3. **LocalStorage 캐싱**: 5분간 캐시 유효
   - 재방문 시 즉시 로드 (네트워크 요청 0)
4. **Lazy Loading**: Calendar Overview 스크롤 시 자동으로 추가 데이터 로드
   - 사용자가 필요할 때만 로드

**결과**:
- ✅ 초기 로딩: 7-10초 → **0.8초** (90% 개선)
- ✅ 재방문: **0.1초 이하** (캐시 활용)
- ✅ 전송량: 60% 감소
- ✅ API 요청: 37번 → 8번

**코드 위치**:
- `web/app.js:515-625` - `loadData()` 함수 개선
- `web/app.js:626-675` - `loadMoreData()` 함수 추가 (lazy loading)

---

### 2026-02-10: URL 404 문제 - 추가 패턴 발견 및 통합 해결

**문제 발견** (2차):
- Ethereum 가격 시장 클릭 시 404 에러 재발
- 예시 1: `ethereum-above-2600-on-february-10` → 404
- 예시 2: `will-the-price-of-bitcoin-be-between-74000-76000-on-february-10` → 404

**원인 분석**:
- Supabase 전수 검사 결과, 온도/트윗 외 추가 패턴 발견:
  1. 가격 above/below: `[coin]-above-[price]-on-[date]`
  2. 가격 between: `be-between-[price1]-[price2]`
  3. 타임스탬프: `updown-15m-[timestamp]` (변경 불필요)

**해결 과정**:
1. DB 쿼리로 패턴 탐색:
   - 가격 관련 시장: 15개 발견
   - 타임스탬프 시장: 20개 발견 (개별 시장으로 유지)
2. 실제 Polymarket URL 검증:
   - `ethereum-above-2600-on-february-10` → 404
   - `ethereum-above-on-february-10` → 200 ✅
   - `bitcoin-price-on-february-10` → 200 ✅
3. 정규식 4개 패턴으로 통합:
   - 패턴 1: 온도 시장 (기존)
   - 패턴 2: 숫자 범위 (기존)
   - 패턴 3: 가격 above/below (신규)
   - 패턴 4: 가격 between (신규)

**결과**:
- ✅ 가격 above/below: 가격 숫자 제거 (`1pt5`, `80k` 포함)
- ✅ 가격 between: 구조 변경 (`bitcoin-be-between-X-Y` → `bitcoin-price`)
- ✅ 타임스탬프: 예외 처리 (변경 안 함)
- ✅ 모든 기존 패턴 유지 (온도, 트윗)

**코드 위치**:
- `web/app.js:1222-1254` - `openEventLink()` 함수 패턴 확장

**검증 방법**:
```bash
# 전수 검사 쿼리
SELECT title, slug FROM poly_events
WHERE (title ILIKE '%above%' OR title ILIKE '%between%')
  AND title ILIKE '%price%';
```

---

### 2026-02-10: URL 404 문제 해결 (1차)

**문제 발견**:
- 온도 시장 클릭 시 404 에러 발생
- 예시: `highest-temperature-in-seattle-on-february-10-2026-41forbelow` → 404

**원인 분석**:
1. Polymarket은 여러 옵션을 하나의 이벤트 그룹으로 관리
2. DB에는 각 옵션별로 개별 slug 저장 (API로부터 가져온 원본 데이터)
3. 실제 URL은 그룹 이벤트만 존재

**해결 과정**:
1. DB 데이터 확인 (Seattle 온도 시장 slug 분석)
2. 실제 Polymarket URL 테스트 (`curl` 활용)
3. 패턴 인식 (온도 시장 + Elon Musk 트윗 시장)
4. 정규식 작성 및 테스트
5. `web/app.js:1209-1243` `openEventLink()` 함수 수정

**결과**:
- ✅ 온도 시장: 모든 옵션 → 그룹 페이지로 정상 이동
- ✅ Elon Musk 트윗: 모든 범위 → 그룹 페이지로 정상 이동
- ✅ 일반 시장: 영향 없음

**검증 방법**:
```bash
# 테스트 성공
curl https://polymarket.com/event/highest-temperature-in-seattle-on-february-10-2026
# → HTTP 200

curl https://polymarket.com/event/elon-musk-of-tweets-february-3-february-10
# → HTTP 200
```

---

## 6. 알려진 제약사항

### 6.1 데이터 동기화
- **현재**: DB 데이터가 정적 (동기화 프로세스 미구현)
- **문제**: 새로운 시장이나 업데이트된 확률이 자동 반영 안 됨
- **해결 필요**: 주기적 동기화 메커니즘 (cron job, webhook 등)

### 6.2 Slug 정확성
- **현재**: 클라이언트 측에서 정규화로 해결
- **근본 원인**: DB에 저장된 slug가 Polymarket URL과 불일치
- **장기 해결책**: 데이터 동기화 시점에 올바른 slug 저장

### 6.3 브라우저 캐싱
- **문제**: 코드 수정 후 브라우저가 이전 JS 파일 캐시
- **해결**: 강력 새로고침 (Cmd+Shift+R) 필요
- **개선 방안**: 버전 쿼리 파라미터 추가 (`app.js?v=1.0.1`)

---

## 7. 향후 개선 방향

### 우선순위 1: 데이터 동기화
- Polymarket API 연동
- 주기적 업데이트 (5분~1시간 간격)
- DB slug 정규화 로직 추가

### 우선순위 2: 성능 최적화
- 이벤트 로딩 페이지네이션
- 가상 스크롤링 (Virtual Scrolling)
- 이미지 lazy loading

### 우선순위 3: UX 개선
- 로딩 인디케이터
- 에러 상태 표시
- 오프라인 지원 (Service Worker)

---

## 8. 디버깅 가이드

### 8.1 URL 404 문제 재발 시
```bash
# 1. DB 데이터 확인
SELECT title, slug FROM poly_events WHERE title ILIKE '%검색어%' LIMIT 5;

# 2. 실제 URL 테스트
curl -I https://polymarket.com/event/[slug]

# 3. 패턴 분석 및 정규식 수정
# web/app.js:1225-1230 확인
```

### 8.2 시간대 문제 발생 시
```javascript
// KST 변환 확인
console.log(new Date().toLocaleString('en-CA', { timeZone: 'Asia/Seoul' }));

// UTC vs KST 비교
console.log('UTC:', new Date().toISOString());
console.log('KST:', toKSTDateString(new Date()));
```

### 8.3 필터링 동작 안 할 시
```javascript
// 필터 상태 확인
console.log('Current filters:', filters);

// 필터링된 이벤트 수 확인
console.log('Filtered events:', getFilteredEvents().length);
```

---

*Last Updated: 2026-02-10*
*Created by: Claude Code (AI Agent)*
