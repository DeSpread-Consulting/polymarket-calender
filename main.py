"""
Polymarket ETL Pipeline
- Polymarket API에서 모든 이벤트 데이터를 가져와 Supabase에 저장
- 페이지네이션으로 전체 시장 수집
- 캘린더 기능용 데이터 수집 (필터 없이 전체 아카이빙)
"""

import os
import json
import requests
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

# 설정값
BATCH_SIZE = 500  # API 최대 limit
REQUEST_TIMEOUT = 60


def load_env() -> tuple[str, str]:
    """환경 변수 로드"""
    load_dotenv()

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")

    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL과 SUPABASE_KEY가 .env 파일에 설정되어야 합니다.")

    return supabase_url, supabase_key


def fetch_polymarket_data() -> list[dict]:
    """Polymarket API에서 모든 진행 중인 이벤트 데이터 가져오기 (페이지네이션)"""
    url = "https://gamma-api.polymarket.com/markets"
    all_data = []
    offset = 0

    print(f"  데이터 수집 중", end="", flush=True)

    while True:
        params = {
            "limit": BATCH_SIZE,
            "offset": offset,
            "active": "true",
            "closed": "false"
        }

        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()

        batch = response.json()
        if not batch:
            break

        all_data.extend(batch)
        print(".", end="", flush=True)

        if len(batch) < BATCH_SIZE:
            break

        offset += BATCH_SIZE

    print()  # 줄바꿈
    return all_data


def safe_json_parse(value):
    """문자열이면 JSON 파싱, 아니면 그대로 반환"""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return value


def safe_float(value) -> float:
    """안전하게 float으로 변환"""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except (ValueError, TypeError):
            return 0.0
    return 0.0


def infer_category_from_title(title: str, category: Optional[str]) -> str:
    """제목 기반으로 카테고리 추론"""
    if category:
        return category

    if not title:
        return 'Uncategorized'

    title_lower = title.lower()

    # Sports 키워드
    sports_keywords = ['nba', 'nfl', 'nhl', 'mlb', 'soccer', 'basketball', 'football', 'baseball',
                      'hockey', 'ncaa', 'fifa', 'champion', 'playoff', 'finals', 'game',
                      'vs', 'vs.', 'team', 'player', 'score', 'win', 'match', 'tennis',
                      'cricket', 'golf', 'racing', 'boxing', 'ufc', 'mma', 'esports']

    # Crypto 키워드
    crypto_keywords = ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'blockchain', 'defi',
                      'nft', 'solana', 'xrp', 'ripple', 'cardano', 'ada', 'doge', 'coin',
                      'token', 'wallet', 'mining', 'exchange', 'binance', 'coinbase']

    # Politics 키워드
    politics_keywords = ['trump', 'biden', 'president', 'election', 'congress', 'senate',
                        'democrat', 'republican', 'vote', 'poll', 'campaign', 'governor',
                        'mayor', 'minister', 'parliament', 'government', 'political']

    # Finance 키워드
    finance_keywords = ['stock', 'market', 'economy', 'gdp', 'inflation', 'fed', 'federal reserve',
                       'dow', 'nasdaq', 's&p', 'trading', 'price', 'dollar', 'euro', 'bank']

    # Pop Culture 키워드
    culture_keywords = ['movie', 'film', 'album', 'song', 'artist', 'celebrity', 'award',
                       'oscar', 'grammy', 'emmy', 'netflix', 'spotify', 'box office']

    # Science/Tech 키워드
    science_keywords = ['ai', 'artificial intelligence', 'robot', 'space', 'nasa', 'spacex',
                       'climate', 'vaccine', 'drug', 'technology', 'apple', 'google',
                       'microsoft', 'tesla', 'research', 'scientific']

    # 키워드 매칭
    if any(keyword in title_lower for keyword in sports_keywords):
        return 'Sports'
    if any(keyword in title_lower for keyword in crypto_keywords):
        return 'Crypto'
    if any(keyword in title_lower for keyword in politics_keywords):
        return 'Politics'
    if any(keyword in title_lower for keyword in finance_keywords):
        return 'Finance'
    if any(keyword in title_lower for keyword in culture_keywords):
        return 'Pop Culture'
    if any(keyword in title_lower for keyword in science_keywords):
        return 'Science'

    return 'Uncategorized'


def transform_data(raw_data: list[dict]) -> list[dict]:
    """API 응답 데이터를 DB 스키마에 맞게 변환 (필터 없이 전체)"""
    transformed = []

    for item in raw_data:
        # outcomePrices 처리
        outcome_prices = safe_json_parse(item.get("outcomePrices"))

        # outcomes 처리
        outcomes = safe_json_parse(item.get("outcomes"))

        # tags 처리: None이면 빈 배열
        tags = item.get("tags")
        if tags is None:
            tags = []
        elif isinstance(tags, str):
            tags = safe_json_parse(tags) or []

        # 카테고리 추론
        inferred_cat = infer_category_from_title(
            item.get("question", ""),
            item.get("category")
        )

        record = {
            "id": item.get("conditionId"),
            "title": item.get("question"),
            "slug": item.get("slug"),
            "end_date": item.get("endDate"),
            "api_created_at": item.get("createdAt"),
            "volume": safe_float(item.get("volume")),
            "volume_24hr": safe_float(item.get("volume24hr")),
            "probs": outcome_prices,
            "outcomes": outcomes,
            "category": item.get("category"),
            "tags": tags,
            "image_url": item.get("image"),
            "inferred_category": inferred_cat,
        }

        # id가 없는 레코드는 건너뛰기
        if record["id"]:
            transformed.append(record)

    return transformed


def upsert_to_supabase(client: Client, data: list[dict], batch_size: int = 500) -> dict:
    """Supabase에 데이터 Upsert (Insert or Update) - 배치 처리"""
    if not data:
        return {"success": 0, "errors": ["저장할 데이터가 없습니다."]}

    total_success = 0
    errors = []

    # 배치 단위로 처리
    total_batches = (len(data) + batch_size - 1) // batch_size
    print(f"  저장 중 ({total_batches}개 배치)", end="", flush=True)

    for i in range(0, len(data), batch_size):
        batch = data[i:i + batch_size]
        try:
            result = client.table("poly_events").upsert(
                batch,
                on_conflict="id"
            ).execute()
            total_success += len(result.data)
            print(".", end="", flush=True)
        except Exception as e:
            errors.append(f"배치 {i // batch_size + 1} 오류: {str(e)}")
            print("x", end="", flush=True)

    print()  # 줄바꿈

    return {
        "success": total_success,
        "errors": errors
    }


def main():
    """메인 실행 함수"""
    print("=" * 50)
    print("Polymarket ETL Pipeline 시작")
    print("=" * 50)

    # 1. 환경 변수 로드
    try:
        supabase_url, supabase_key = load_env()
        print("✓ 환경 변수 로드 완료")
    except ValueError as e:
        print(f"✗ 환경 변수 오류: {e}")
        return

    # 2. Supabase 클라이언트 생성
    try:
        client = create_client(supabase_url, supabase_key)
        print("✓ Supabase 클라이언트 연결 완료")
    except Exception as e:
        print(f"✗ Supabase 연결 실패: {e}")
        return

    # 3. Polymarket API에서 데이터 가져오기
    try:
        raw_data = fetch_polymarket_data()
        print(f"✓ API 데이터 조회 완료: {len(raw_data)}건")
    except requests.RequestException as e:
        print(f"✗ API 요청 실패: {e}")
        return

    # 4. 데이터 변환 (Cleaning)
    transformed_data = transform_data(raw_data)
    print(f"✓ 데이터 변환 완료: {len(transformed_data)}건")

    # 5. Supabase에 Upsert
    result = upsert_to_supabase(client, transformed_data)

    # 6. 결과 출력
    print("-" * 50)
    if result["errors"]:
        print(f"⚠ 일부 오류 발생: {len(result['errors'])}건")
        for err in result["errors"][:3]:  # 최대 3개만 출력
            print(f"  - {err}")

    print(f"✓ 저장 완료: {result['success']}건 Upsert 성공")

    print("=" * 50)
    print("ETL Pipeline 완료")
    print("=" * 50)


if __name__ == "__main__":
    main()
