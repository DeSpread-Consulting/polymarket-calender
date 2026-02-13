# Polymarket Event Calendar

Polymarket 예측 시장을 캘린더 형식으로 시각화하는 웹 애플리케이션입니다.

> **최신 업데이트 (2026-02-11)**: 번역 시스템 안정성 개선, URL 생성 버그 수정, 음수 온도 시장 지원 추가

---

## 📌 주요 기능

### 🗓 Week View (주간 타임라인)
- 현재 주 5일간의 이벤트를 시간대별로 상세 표시
- KST (한국 표준시) 기준 타임라인
- 시간대별 색상 구분 (새벽/낮/밤)
- 이벤트 클릭 시 Polymarket 시장 페이지로 이동

### 📅 Calendar Overview (월간 개요)
- 향후 3주간의 주요 이벤트 미리보기
- 각 날짜별 상위 3개 이벤트만 표시
- 무한 스크롤 지원 (lazy loading)

### 🔍 필터링 시스템
- **카테고리**: Politics, Crypto, Sports, Pop Culture 등
- **태그**: 세부 주제별 필터링
- **거래량**: 최소 거래량 기준 설정 ($1K ~ $1M)
- **유동성**: 최소 유동성 기준 설정
- **시간 범위**: 1일/7일/30일/전체

### 🎨 사용자 설정
- **테마**: Dark / Light 모드
- **밀도**: Comfortable / Compact / Spacious
- **언어**: 한국어 / English 토글

---

## 🚀 빠른 시작

### 1. 저장소 클론

```bash
git clone https://github.com/DeSpread-Consulting/polymarket-etl.git
cd polymarket-etl
```

### 2. Supabase 설정

`config.js.example`을 복사하여 `config.js` 생성:

```bash
cp config.js.example config.js
```

`config.js`에 Supabase 연결 정보 입력:

```javascript
const CONFIG = {
    SUPABASE_URL: 'https://your-project.supabase.co',
    SUPABASE_ANON_KEY: 'your-anon-key'
};
```

> **참고**: Supabase anon key는 공개 가능한 키입니다. RLS(Row Level Security)로 보호됩니다.

### 3. 웹 서버 실행

로컬 개발 서버 실행:

```bash
# Python 간단 서버
python -m http.server 8000

# 또는 Node.js http-server
npx http-server -p 8000
```

브라우저에서 [http://localhost:8000](http://localhost:8000) 접속

---

## 📁 프로젝트 구조

```
polymarket-etl/
├── index.html              # 메인 HTML
├── app.js                  # 캘린더 로직 (1,450+ lines)
├── style.css               # 스타일 (1,000+ lines)
├── config.js               # Supabase 설정 (gitignored)
├── config.js.example       # 설정 템플릿
├── .vercel/                # Vercel 배포 설정
├── etl/                    # 데이터 파이프라인 (백그라운드)
│   ├── main.py             # ETL 메인 스크립트
│   ├── requirements.txt    # Python 의존성
│   ├── schema.sql          # DB 스키마
│   └── README.md           # ETL 문서
├── .github/workflows/      # GitHub Actions (자동 동기화)
├── AGENT_GUIDELINES.md     # AI 에이전트 작업 지침
└── SYSTEM_OVERVIEW.md      # 시스템 아키텍처 문서
```

---

## 🏗 아키텍처 개요

### 데이터 흐름

```
Polymarket API
    ↓ (4시간마다 자동 동기화)
Supabase: poly_events 테이블
    ↓ (웹 앱 로드)
app.js: 필터링 + 렌더링
    ↓ (사용자 인터랙션)
Week View + Calendar Overview
```

### 기술 스택

- **프론트엔드**: Vanilla JavaScript (ES6+)
- **데이터베이스**: Supabase (PostgreSQL)
- **배포**: Vercel
- **데이터 동기화**: Python + GitHub Actions

---

## 🔧 핵심 기능 설명

### 1. KST 타임존 처리

모든 날짜/시간은 한국 표준시(Asia/Seoul) 기준:

```javascript
// UTC → KST 변환
function toKSTDateString(dateInput) {
    const date = new Date(dateInput);
    return date.toLocaleString('en-CA', { timeZone: 'Asia/Seoul' }).split(',')[0];
}
```

### 2. 성능 최적화

- **점진적 로딩**: 초기 5일치만 로드 (7초 → 0.8초)
- **LocalStorage 캐싱**: 5분간 유효 (재방문 시 0.1초)
- **Lazy Loading**: 스크롤 시 추가 데이터 자동 로드
- **필드 최적화**: 필요한 9개 필드만 전송 (전송량 60% 감소)

### 3. URL 정규화

Polymarket의 그룹 이벤트 처리:

```javascript
// 온도 시장: seattle-2026-41forbelow → seattle-2026
// 가격 시장: bitcoin-above-80k-on-feb-10 → bitcoin-price-on-feb-10
// 범위 시장: tweets-380-399 → tweets
```

---

## 🔌 통합 가이드

### 기존 프로젝트에 통합하기

#### 옵션 1: iframe 임베드 (간단)

```html
<iframe src="https://your-calendar-url.vercel.app"
        width="100%"
        height="800px"
        frameborder="0">
</iframe>
```

**장점**: 작업량 최소화
**단점**: 디자인 통일 어려움

#### 옵션 2: 코드 통합 (권장)

1. **필수 파일 복사**
   - `app.js` → 캘린더 로직
   - `style.css` → 스타일 (선택적)
   - `config.js` → Supabase 설정

2. **HTML 구조 통합**
   - `index.html`의 구조를 기존 페이지에 맞게 조정
   - 클래스명 충돌 확인 및 수정

3. **핵심 함수 활용**
   ```javascript
   // 데이터 로드
   async function loadData() { ... }

   // 필터링
   function getFilteredEvents() { ... }

   // 렌더링
   function renderWeekView() { ... }
   function renderCalendarOverview() { ... }
   ```

4. **Supabase 연결**
   - 동일한 Supabase 프로젝트 사용 권장
   - 또는 자체 DB로 데이터 이전

**자세한 통합 가이드는 [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) 참조** *(선택사항)*

---

## 🗃 데이터베이스

### `poly_events` 테이블 스키마

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | text | 시장 고유 ID (PK) |
| `title` | text | 시장 제목 |
| `slug` | text | URL slug |
| `end_date` | timestamptz | 종료 시간 (UTC) |
| `volume` | numeric | 총 거래량 ($) |
| `volume_24hr` | numeric | 24시간 거래량 ($) |
| `probs` | jsonb | 확률 배열 |
| `outcomes` | jsonb | 결과 옵션 |
| `category` | text | 카테고리 |
| `tags` | text[] | 태그 배열 |
| `closed` | boolean | 정산 완료 여부 |

### 데이터 동기화

- **자동 실행**: GitHub Actions (4시간마다)
- **수동 실행**: `python etl/main.py`
- **상세 문서**: [etl/README.md](./etl/README.md)

---

## 🎨 디자인 커스터마이징

### CSS 변수 (테마)

```css
:root {
    --bg-primary: #0b0d11;
    --bg-secondary: #121620;
    --text-primary: #f8fafc;
    --accent-blue: #4ea1ff;
    /* ... */
}
```

### 주요 컴포넌트 클래스

- `.week-timeline` - 주간 타임라인
- `.calendar-overview-grid` - 월간 캘린더
- `.event-card` - 이벤트 카드
- `.filter-modal` - 필터 모달

---

## 📚 추가 문서

- **[SYSTEM_OVERVIEW.md](./SYSTEM_OVERVIEW.md)**: 상세 아키텍처 + 수정 내역
- **[AGENT_GUIDELINES.md](./AGENT_GUIDELINES.md)**: AI 에이전트 작업 지침
- **[etl/README.md](./etl/README.md)**: ETL 파이프라인 문서

---

## 🚀 배포

### Vercel (권장)

```bash
# Vercel CLI 설치
npm i -g vercel

# 배포
vercel

# 프로덕션 배포
vercel --prod
```

### GitHub Pages

```bash
# settings > Pages > Source: main branch / root
```

---

## 🤝 기여

이슈가 발견된다면 한번 곰곰히 생각해 봅시다. 
내가 해결할 문제인지 아닌지. 
감사합니다.

---

## 📄 라이선스

코블린에게 항상 물어보거라. 

---

## 📧 문의

- **GitHub**: [DeSpread-Consulting](https://github.com/DeSpread-Consulting)
- **Issues**: [GitHub Issues](https://github.com/DeSpread-Consulting/polymarket-etl/issues)

---

**Made by Coblin