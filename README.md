# Polymarket ETL Pipeline

Polymarket API에서 예측 시장 데이터를 수집하여 Supabase에 저장하는 ETL 파이프라인입니다.

## 기능

- Polymarket의 모든 활성 시장 데이터 수집
- 4시간마다 자동 업데이트 (GitHub Actions)
- Supabase에 Upsert (중복 시 업데이트)

## 수집 데이터

| 필드 | 설명 |
|------|------|
| `id` | 시장 고유 ID |
| `title` | 베팅 질문 |
| `slug` | URL용 슬러그 |
| `end_date` | 마감 일시 |
| `volume` | 총 거래량 (USD) |
| `volume_24hr` | 24시간 거래량 |
| `probs` | 결과별 확률 |
| `outcomes` | 결과 옵션명 |
| `category` | 카테고리 |
| `tags` | 태그 배열 |
| `image_url` | 썸네일 이미지 |
| `api_created_at` | 이벤트 생성일 |

## 설치

```bash
# 의존성 설치
pip install -r requirements.txt

# 환경 변수 설정
cp .env.example .env
# .env 파일에 SUPABASE_URL, SUPABASE_KEY 입력
```

## 사용법

### 수동 실행

```bash
python main.py
```

### 자동 실행

GitHub Actions로 4시간마다 자동 실행됩니다.

| UTC | KST |
|-----|-----|
| 00:00 | 09:00 |
| 04:00 | 13:00 |
| 08:00 | 17:00 |
| 12:00 | 21:00 |
| 16:00 | 01:00 |
| 20:00 | 05:00 |

## 파일 구조

```
├── .github/
│   └── workflows/
│       └── etl.yml         # GitHub Actions (4시간 자동 실행)
├── main.py                 # ETL 메인 코드
├── schema.sql              # 테이블 생성 SQL
├── migration.sql           # 컬럼 추가 SQL
├── requirements.txt        # Python 의존성
├── .env.example            # 환경 변수 샘플
└── .gitignore
```

## 환경 변수

| 변수 | 설명 |
|------|------|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_KEY` | Supabase API Key |

## Supabase 설정

1. [Supabase](https://supabase.com)에서 프로젝트 생성
2. SQL Editor에서 `schema.sql` 실행
3. Settings > API에서 URL과 Key 확인

## 데이터 소스

- API: `https://gamma-api.polymarket.com/markets`
- 조건: `active=true`, `closed=false`
