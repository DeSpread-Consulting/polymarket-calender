# Polymarket ETL Pipeline

Polymarket API에서 예측 시장 데이터를 수집하여 Supabase에 저장하는 ETL 파이프라인입니다.

> **주의**: 이 파이프라인은 캘린더 앱의 데이터 공급을 위한 백그라운드 작업입니다.
> 캘린더 앱 사용자는 이 문서를 읽을 필요가 없습니다.

---

## 📋 개요

### 역할
- Polymarket API에서 활성 시장 데이터 수집
- Supabase `poly_events` 테이블에 Upsert (중복 시 업데이트)
- GitHub Actions를 통해 4시간마다 자동 실행

### 수집 데이터

| 필드 | 설명 |
|------|------|
| `id` | 시장 고유 ID |
| `title` | 베팅 질문 |
| `slug` | URL용 슬러그 |
| `end_date` | 마감 일시 |
| `volume` | 총 거래량 (USD) |
| `volume_24hr` | 24시간 거래량 |
| `probs` | 결과별 확률 (JSONB) |
| `outcomes` | 결과 옵션명 (JSONB) |
| `category` | 카테고리 |
| `tags` | 태그 배열 |
| `image_url` | 썸네일 이미지 |
| `api_created_at` | 이벤트 생성일 |
| `closed` | 정산 완료 여부 |

---

## 🚀 설치 및 실행

### 1. 의존성 설치

```bash
cd etl
pip install -r requirements.txt
```

**requirements.txt:**
```
requests
python-dotenv
supabase
```

### 2. 환경 변수 설정

루트 디렉토리에 `.env` 파일 생성:

```bash
# 프로젝트 루트에 생성
cp .env.example .env
```

`.env` 파일 내용:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
```

> **중요**: ETL 파이프라인은 **service_role key**가 필요합니다 (RLS 우회).
> 웹 앱의 anon key와는 다릅니다.

### 3. 수동 실행

```bash
# etl 디렉토리에서
python main.py

# 또는 프로젝트 루트에서
python etl/main.py
```

---

## 🔄 자동 실행 (GitHub Actions)

`.github/workflows/etl-backup.yml` 참조

### 실행 주기

| UTC | KST |
|-----|-----|
| 00:00 | 09:00 |
| 04:00 | 13:00 |
| 08:00 | 17:00 |
| 12:00 | 21:00 |
| 16:00 | 01:00 |
| 20:00 | 05:00 |

### 수동 트리거

GitHub Actions 페이지에서 "Run workflow" 버튼 클릭

---

## 🗃 데이터베이스 설정

### 1. 테이블 생성

`schema.sql` 실행:

```sql
-- Supabase SQL Editor에서 실행
-- schema.sql 파일 내용 복사 → 붙여넣기 → Run
```

### 2. 컬럼 추가 (옵션)

`migration.sql` 실행 (필요 시):

```sql
-- 추가 컬럼이나 인덱스 생성
```

---

## 📁 파일 설명

```
etl/
├── main.py              # ETL 메인 스크립트
├── requirements.txt     # Python 의존성
├── schema.sql          # 테이블 생성 SQL
├── migration.sql       # 마이그레이션 SQL
├── translate_titles.py # 제목 번역 스크립트 (옵션)
└── README.md           # 이 파일
```

### main.py

핵심 로직:

```python
# 1. Polymarket API 호출
response = requests.get('https://gamma-api.polymarket.com/markets',
                       params={'active': 'true', 'closed': 'false'})

# 2. 데이터 변환
for market in markets:
    event = {
        'id': market['id'],
        'title': market['question'],
        'slug': market['slug'],
        # ...
    }

# 3. Supabase Upsert
supabase.table('poly_events').upsert(event).execute()
```

### translate_titles.py

제목을 한국어로 번역하는 스크립트 (필요 시 사용):

```bash
python etl/translate_titles.py
```

---

## 🔧 트러블슈팅

### 문제: "supabase module not found"

**해결:**
```bash
pip install supabase
```

### 문제: "SUPABASE_KEY 권한 없음"

**해결:**
- Supabase Dashboard → Settings → API
- `service_role` key 사용 (anon key 아님)
- `.env` 파일에 정확히 입력

### 문제: GitHub Actions 실패

**해결:**
1. Secrets 설정 확인:
   - Repository Settings → Secrets → Actions
   - `SUPABASE_URL`, `SUPABASE_KEY` 등록 확인
2. 워크플로우 로그 확인:
   - Actions 탭 → 실패한 실행 클릭 → 로그 확인

---

## 📊 데이터 검증

### Supabase SQL Editor에서 확인

```sql
-- 전체 이벤트 수
SELECT COUNT(*) FROM poly_events;

-- 최근 업데이트된 이벤트
SELECT id, title, end_date, volume
FROM poly_events
ORDER BY api_created_at DESC
LIMIT 10;

-- 카테고리별 분포
SELECT category, COUNT(*) as count
FROM poly_events
GROUP BY category
ORDER BY count DESC;
```

---

## 🔐 보안 주의사항

1. **절대 커밋 금지:**
   - `.env` 파일 (이미 .gitignore에 포함)
   - `service_role` key

2. **GitHub Secrets 사용:**
   - 모든 민감 정보는 Repository Secrets로 관리

3. **RLS(Row Level Security):**
   - 웹 앱은 anon key + RLS로 보호
   - ETL은 service_role key (RLS 우회)

---

## 📈 성능 최적화

### 배치 처리

현재 이벤트별로 개별 upsert → 배치 upsert로 변경 가능:

```python
# 개선 전
for event in events:
    supabase.table('poly_events').upsert(event).execute()

# 개선 후
supabase.table('poly_events').upsert(events).execute()
```

### 증분 업데이트

변경된 이벤트만 업데이트 (현재는 전체 upsert):

```python
# 마지막 업데이트 시간 이후만 가져오기
params = {'updated_after': last_update_time}
```

---

## 🚧 알려진 제약사항

1. **API Rate Limit**: Polymarket API 제한 (현재 문제 없음)
2. **Slug 불일치**: API의 slug가 실제 URL과 다를 수 있음 (웹 앱에서 정규화)
3. **정산 처리**: `closed` 필드는 수동 관리 필요

---

## 📝 개발 노트

### 데이터 흐름

```
Polymarket API
    ↓
main.py (ETL)
    ↓
Supabase poly_events
    ↓
웹 앱 (app.js)
```

### 향후 개선 사항

- [ ] 배치 upsert로 성능 개선
- [ ] 증분 업데이트로 API 호출 감소
- [ ] 에러 알림 (Slack, Email 등)
- [ ] 실행 로그 DB 저장
- [ ] 정산 완료 이벤트 자동 처리

---

## 📚 관련 문서

- **[../README.md](../README.md)**: 캘린더 앱 메인 문서
- **[../SYSTEM_OVERVIEW.md](../SYSTEM_OVERVIEW.md)**: 전체 시스템 아키텍처

---

**ETL 파이프라인 관리자용 문서**
