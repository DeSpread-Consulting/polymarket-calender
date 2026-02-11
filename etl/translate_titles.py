"""
제목 번역 스크립트 (병렬 처리 버전)
- Supabase의 기존 마켓 제목을 OpenAI API로 한국어 번역
- title_ko가 NULL인 레코드만 번역 (비용 절감)
- 병렬 처리로 10-20배 빠른 속도
"""

import os
import time
from typing import Tuple, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from dotenv import load_dotenv
from supabase import create_client, Client
from openai import OpenAI

# 설정값
MAX_WORKERS = 8  # 동시 실행 스레드 수 (Rate Limit 고려)
BATCH_SIZE = 100  # 한 번에 가져올 레코드 수
MAX_RETRIES = 5  # Rate Limit 시 재시도 횟수

# 번역할 카테고리 (Sports는 한국 법적 이슈로 제외)
TRANSLATE_CATEGORIES = ['Crypto', 'Politics', 'Finance', 'Pop Culture', 'Science']

# 진행 상황 추적용
progress_lock = Lock()
success_count = 0
fail_count = 0


def load_env() -> Tuple[str, str, str]:
    """환경 변수 로드"""
    load_dotenv()

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    openai_api_key = os.getenv("OPENAI_API_KEY")

    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL과 SUPABASE_KEY가 .env 파일에 설정되어야 합니다.")

    if not openai_api_key:
        raise ValueError("OPENAI_API_KEY가 .env 파일에 설정되어야 합니다.")

    return supabase_url, supabase_key, openai_api_key


def translate_to_korean(client: OpenAI, title: str) -> Optional[str]:
    """OpenAI API로 제목을 한국어로 번역 (Rate Limit 자동 재시도)"""
    for attempt in range(MAX_RETRIES):
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",  # 비용 효율적인 모델
                messages=[
                    {
                        "role": "system",
                        "content": """당신은 Polymarket의 예측 시장 제목을 한국어로 번역하는 전문가입니다.
다음 규칙을 따라 번역하세요:
1. 날짜, 시간, 숫자는 그대로 유지
2. 자연스러운 한국어로 번역
3. 질문 형식 유지
4. 고유명사는 원어 그대로 또는 한글 표기

예시:
- "Will Bitcoin reach $100K by end of 2024?" → "비트코인이 2024년 말까지 $100K에 도달할까요?"
- "XRP Up or Down - February 3, 3AM ET" → "XRP 상승 또는 하락 - 2월 3일, 오전 3시 ET"
"""
                    },
                    {
                        "role": "user",
                        "content": f"다음 제목을 한국어로 번역해주세요:\n{title}"
                    }
                ],
                temperature=0.3,  # 일관성 있는 번역
                max_tokens=200
            )

            translated = response.choices[0].message.content.strip()
            return translated

        except Exception as e:
            error_str = str(e)

            # Rate Limit 에러 체크
            if "rate_limit" in error_str.lower() or "429" in error_str:
                if attempt < MAX_RETRIES - 1:
                    wait_time = (2 ** attempt)  # 1초, 2초, 4초, 8초, 16초
                    time.sleep(wait_time)
                    continue
                else:
                    return None
            else:
                # 다른 에러는 즉시 실패
                print(f"  ✗ 번역 실패: {title[:50]}... - {error_str[:100]}")
                return None

    return None


def translate_and_update(record: dict, openai_client: OpenAI, supabase_client: Client, total: int) -> bool:
    """단일 레코드 번역 및 업데이트 (병렬 실행용)"""
    global success_count, fail_count

    record_id = record["id"]
    title = record["title"]

    # 번역 실행
    translated = translate_to_korean(openai_client, title)

    if translated:
        try:
            # Supabase 업데이트
            supabase_client.table("poly_events") \
                .update({"title_ko": translated}) \
                .eq("id", record_id) \
                .execute()

            with progress_lock:
                success_count += 1
                if success_count % 10 == 0:  # 10건마다 진행 상황 출력
                    print(f"  ✓ 진행: {success_count}/{total}건 완료 ({(success_count/total*100):.1f}%)")

            return True

        except Exception as e:
            with progress_lock:
                fail_count += 1
            print(f"  ✗ 업데이트 실패: {record_id}")
            return False
    else:
        with progress_lock:
            fail_count += 1
        return False


def main():
    """메인 실행 함수"""
    global success_count, fail_count

    print("=" * 60)
    print("Polymarket 제목 번역 (병렬 처리 버전)")
    print("=" * 60)

    # 1. 환경 변수 로드
    try:
        supabase_url, supabase_key, openai_api_key = load_env()
        print("✓ 환경 변수 로드 완료")
    except ValueError as e:
        print(f"✗ 환경 변수 오류: {e}")
        return

    # 2. 클라이언트 생성
    try:
        supabase_client = create_client(supabase_url, supabase_key)
        openai_client = OpenAI(api_key=openai_api_key)
        print("✓ API 클라이언트 연결 완료")
    except Exception as e:
        print(f"✗ 클라이언트 연결 실패: {e}")
        return

    # 3. 번역 필요한 레코드 조회 (카테고리 필터링)
    try:
        print("\n📥 번역 필요한 레코드 조회 중...")
        print(f"📌 번역 대상 카테고리: {', '.join(TRANSLATE_CATEGORIES)}")

        # 먼저 전체 개수 확인
        count_response = supabase_client.table("poly_events") \
            .select("id", count="exact") \
            .is_("title_ko", "null") \
            .in_("category", TRANSLATE_CATEGORIES) \
            .execute()

        total_count = count_response.count
        print(f"📊 전체 레코드 수: {total_count:,}건")

        # 전체 데이터 가져오기 (페이지네이션)
        print("📥 전체 데이터 로딩 중 (페이지네이션)...")
        all_records = []
        offset = 0
        page_size = 1000

        while True:
            response = supabase_client.table("poly_events") \
                .select("id, title, category") \
                .is_("title_ko", "null") \
                .in_("category", TRANSLATE_CATEGORIES) \
                .range(offset, offset + page_size - 1) \
                .execute()

            if not response.data:
                break

            all_records.extend(response.data)
            offset += page_size
            print(f"  로딩 중: {len(all_records):,}건...", end="\r")

            if len(response.data) < page_size:
                break

        print(f"  로딩 완료: {len(all_records):,}건     ")
        records = all_records
        total_count = len(records)

        # 카테고리별 개수 출력
        from collections import Counter
        category_counts = Counter([r['category'] for r in records])
        print(f"\n✓ 번역 대상: {total_count}건")
        for cat, count in sorted(category_counts.items(), key=lambda x: -x[1]):
            print(f"  - {cat}: {count}건")

        if total_count == 0:
            print("\n번역할 레코드가 없습니다.")
            return

    except Exception as e:
        print(f"✗ 레코드 조회 실패: {e}")
        return

    # 4. 병렬 번역 시작
    print(f"\n🔄 병렬 번역 시작 (동시 작업: {MAX_WORKERS}개)")
    print(f"⚡ 예상 시간: 약 {int(total_count / MAX_WORKERS / 2)}분")

    start_time = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # 모든 번역 작업을 병렬로 실행
        futures = []
        for record in records:
            future = executor.submit(
                translate_and_update,
                record,
                openai_client,
                supabase_client,
                total_count
            )
            futures.append(future)

        # 완료 대기
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as e:
                print(f"  ✗ 작업 실패: {str(e)}")

    elapsed_time = time.time() - start_time

    # 5. 결과 요약
    print("\n" + "=" * 60)
    print("번역 완료")
    print("=" * 60)
    print(f"✓ 성공: {success_count}건")
    print(f"✗ 실패: {fail_count}건")
    print(f"📊 성공률: {(success_count / total_count * 100):.1f}%")
    print(f"⏱️  소요 시간: {int(elapsed_time / 60)}분 {int(elapsed_time % 60)}초")
    print(f"⚡ 평균 속도: {(total_count / elapsed_time):.1f}건/초")


if __name__ == "__main__":
    main()
