#!/usr/bin/env python3
"""
Polymarket 시장 제목 한글 번역 (통합 스크립트)

사용법:
    # 기본: 앞으로 2개월, 미번역만
    python translate.py

    # Sports 제외, 6개월, 5워커
    python translate.py --exclude-sports --months 6 --workers 5

    # 덮어쓰기 모드 (이미 번역된 것도 재번역)
    python translate.py --overwrite

    # 특정 날짜 범위
    python translate.py --from 2026-02-11 --to 2026-04-11

    # 테스트 (1배치만)
    python translate.py --test
"""

import os
import sys
import time
import threading
import argparse
from typing import List, Dict
from pathlib import Path
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client, Client
from postprocess import postprocess_translation

# .env 로드
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# 설정값
BATCH_SIZE = 100
MAX_RETRIES = 3


def load_translation_prompt() -> str:
    """translation_prompt.md에서 프롬프트 로드"""
    prompt_file = Path(__file__).parent / 'translation_prompt.md'
    try:
        content = prompt_file.read_text(encoding='utf-8')
        start = content.find('```\n당신은') + 4
        end = content.find('\n```', start)
        if start > 3 and end > start:
            return content[start:end].strip()
    except Exception as e:
        print(f"⚠️  프롬프트 로드 실패: {e}")

    return """당신은 Polymarket 예측 시장 제목을 한국어로 번역하는 전문가입니다.
반말로 번역하세요 (~할까?, ~될까?). 날짜는 한글로 (February 11 → 2월 11일).
시간대는 반드시 유지 (4AM ET → 오전 4시 ET). 번호와 함께 출력하세요."""


TRANSLATION_PROMPT = load_translation_prompt()

SYSTEM_MESSAGE = """당신은 전문 번역가입니다.

중요 규칙:
1. 반드시 반말로 번역 (~할까, ~될까, ~인가)
2. 절대 존댓말 사용 금지 (~할까요, ~될까요 ❌)
3. 시간대 표기 필수: ET, PT 등은 반드시 유지 (4AM ET → 오전 4시 ET ✅)
4. "have"를 "가지다"로 직역 금지. 문맥에 맞게 "차지할까/선보일까/기록할까" 사용
5. 모든 제목에서 일관성 유지"""


def calculate_date_range(months: int, from_date: str = None, to_date: str = None):
    """날짜 범위 계산 (KST 기준)"""
    if from_date and to_date:
        return from_date, to_date

    now_utc = datetime.now(timezone.utc)
    # KST 오늘 시작 = UTC 전날 15:00
    today_start = now_utc.replace(hour=15, minute=0, second=0, microsecond=0) - timedelta(days=1)
    if now_utc.hour >= 15:
        today_start = now_utc.replace(hour=15, minute=0, second=0, microsecond=0)

    start = today_start.strftime('%Y-%m-%d %H:%M:%S+00')
    end = (today_start + timedelta(days=months * 30)).strftime('%Y-%m-%d %H:%M:%S+00')
    return start, end


class Translator:
    def __init__(self, workers: int, overwrite: bool, exclude_sports: bool,
                 start_date: str, end_date: str):
        # 환경 변수
        self.openai_key = os.getenv('OPENAI_API_KEY')
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_KEY')

        if not all([self.openai_key, self.supabase_url, self.supabase_key]):
            print("❌ 환경 변수를 설정해주세요:")
            print("   OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY")
            sys.exit(1)

        # 클라이언트
        self.openai_client = OpenAI(api_key=self.openai_key)
        self.supabase: Client = create_client(self.supabase_url, self.supabase_key)

        # 옵션
        self.workers = workers
        self.overwrite = overwrite
        self.exclude_sports = exclude_sports
        self.start_date = start_date
        self.end_date = end_date

        # 통계 (Thread-safe)
        self.lock = threading.Lock()
        self.total_translated = 0
        self.total_batches = 0
        self.failed_batches = 0
        self.cache_hits = 0

    def translate_batch(self, titles: List[str]) -> List[str]:
        """OpenAI API로 배치 번역"""
        if not titles:
            return []

        titles_text = "\n".join([f"{i+1}. {t}" for i, t in enumerate(titles)])
        request_text = f"{TRANSLATION_PROMPT}\n\n번역할 제목들:\n{titles_text}"

        for attempt in range(MAX_RETRIES):
            try:
                completion = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    max_tokens=5000,
                    temperature=0.3,
                    messages=[
                        {"role": "system", "content": SYSTEM_MESSAGE},
                        {"role": "user", "content": request_text}
                    ]
                )

                response_text = completion.choices[0].message.content.strip()

                # 번호 기반 파싱
                translations_dict = {}
                for line in response_text.split('\n'):
                    line = line.strip()
                    if not line:
                        continue
                    if '. ' in line and line[0].isdigit():
                        parts = line.split('. ', 1)
                        try:
                            num = int(parts[0])
                            translations_dict[num] = parts[1]
                        except (ValueError, IndexError):
                            continue

                # 후처리 파이프라인 적용
                results = []
                for i in range(len(titles)):
                    translation = translations_dict.get(i + 1, titles[i])
                    translation = postprocess_translation(titles[i], translation)
                    results.append(translation)

                if len(results) != len(titles):
                    print(f"  ⚠️  번역 개수 불일치: {len(results)} != {len(titles)}")

                return results

            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    print(f"  ⚠️  재시도 {attempt + 1}/{MAX_RETRIES}")
                    time.sleep(2 ** attempt)
                else:
                    print(f"  ❌ API 호출 실패: {e}")
                    return []

        return []

    def _lookup_cache(self, client: Client, titles: List[str]) -> Dict[str, str]:
        """DB에서 기존 번역 캐시 조회"""
        cache = {}
        unique_titles = list(set(titles))

        for i in range(0, len(unique_titles), 50):
            chunk = unique_titles[i:i + 50]
            response = client.table('poly_events') \
                .select('title, title_ko') \
                .in_('title', chunk) \
                .not_.is_('title_ko', 'null') \
                .order('end_date', desc=True) \
                .execute()
            for row in response.data:
                if row['title'] not in cache:
                    cache[row['title']] = row['title_ko']

        return cache

    def _update_with_retry(self, client: Client, ids: List[str], translations: List[str]) -> int:
        """DB 업데이트 (재시도 포함)"""
        success = 0
        for eid, trans in zip(ids, translations):
            for attempt in range(MAX_RETRIES):
                try:
                    client.table('poly_events') \
                        .update({'title_ko': trans}) \
                        .eq('id', eid) \
                        .execute()
                    success += 1
                    break
                except Exception as e:
                    if attempt < MAX_RETRIES - 1:
                        time.sleep(0.5 * (attempt + 1))
                    else:
                        print(f"  ❌ 업데이트 실패 (ID: {eid[:8]}...): {e}")
        return success

    def fetch_all_target_ids(self) -> List[Dict]:
        """번역 대상 이벤트의 id, title을 한번에 모두 조회"""
        all_events = []
        offset = 0
        page_size = 1000

        while True:
            query = self.supabase.table('poly_events') \
                .select('id, title') \
                .gte('end_date', self.start_date) \
                .lt('end_date', self.end_date)

            if not self.overwrite:
                query = query.is_('title_ko', 'null')

            if self.exclude_sports:
                query = query.neq('category', 'Sports')

            response = query.order('end_date').limit(page_size).offset(offset).execute()

            if not response.data:
                break

            all_events.extend(response.data)
            offset += page_size

            if len(response.data) < page_size:
                break

        return all_events

    def process_batch(self, batch_num: int, batch_events: List[Dict], total_batches: int) -> Dict:
        """단일 배치 처리 (워커 스레드) - ID 기반"""
        worker_supabase = create_client(self.supabase_url, self.supabase_key)

        try:
            if not batch_events:
                return {'success': False, 'reason': 'empty'}

            batch_titles = [e['title'] for e in batch_events]
            batch_ids = [e['id'] for e in batch_events]

            # 캐시 조회 (덮어쓰기 모드가 아닐 때만)
            batch_cache_hits = 0
            if not self.overwrite:
                cache = self._lookup_cache(worker_supabase, batch_titles)

                titles_to_translate = []
                indices_to_translate = []
                translations = [''] * len(batch_titles)

                for i, title in enumerate(batch_titles):
                    if title in cache:
                        translations[i] = cache[title]
                        batch_cache_hits += 1
                    else:
                        titles_to_translate.append(title)
                        indices_to_translate.append(i)

                if titles_to_translate:
                    api_results = self.translate_batch(titles_to_translate)
                    for idx, trans in zip(indices_to_translate, api_results):
                        translations[idx] = trans
            else:
                translations = self.translate_batch(batch_titles)
                if len(translations) != len(batch_titles):
                    translations = translations[:len(batch_titles)]

            success = self._update_with_retry(worker_supabase, batch_ids, translations)

            with self.lock:
                self.total_translated += success
                self.total_batches += 1
                self.cache_hits += batch_cache_hits

            progress = (self.total_batches / total_batches) * 100
            cache_info = f" (캐시: {batch_cache_hits})" if batch_cache_hits > 0 else ""
            print(f"  ✅ 배치 {batch_num:3d}/{total_batches} | "
                  f"{success:3d}개 번역{cache_info} | "
                  f"누적: {self.total_translated:,}개 ({progress:.1f}%)")

            return {'success': True, 'count': success}

        except Exception as e:
            with self.lock:
                self.failed_batches += 1
            print(f"  ❌ 배치 {batch_num} 실패: {e}")
            return {'success': False, 'error': str(e)}

    def run(self, max_batches: int = None):
        """번역 실행"""
        # 설정 출력
        print(f"\n{'='*55}")
        print(f"  Polymarket 제목 번역")
        print(f"{'='*55}")
        print(f"  기간       : {self.start_date[:10]} ~ {self.end_date[:10]}")
        print(f"  워커       : {self.workers}개")
        print(f"  모드       : {'덮어쓰기' if self.overwrite else '미번역만'}")
        if self.exclude_sports:
            print(f"  제외       : Sports")
        print()

        # 대상 ID를 미리 모두 조회 (race condition 방지)
        print("  ID 조회 중...")
        all_events = self.fetch_all_target_ids()
        total_count = len(all_events)

        # 배치 분할
        batches = [all_events[i:i + BATCH_SIZE] for i in range(0, total_count, BATCH_SIZE)]
        total_batches = len(batches)

        if max_batches:
            batches = batches[:max_batches]
            total_batches = len(batches)

        print(f"  대상       : {total_count:,}개")
        print(f"  배치       : {total_batches}개")
        print(f"  예상 시간  : ~{(total_batches * 1.5 / self.workers / 60):.1f}분")
        print(f"{'='*55}\n")

        if total_count == 0:
            print("  ✅ 번역할 이벤트가 없습니다.\n")
            return

        start_time = time.time()

        # 병렬 처리 (ID 기반 배치)
        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            futures = {
                executor.submit(self.process_batch, i + 1, batch, total_batches): i + 1
                for i, batch in enumerate(batches)
            }
            for future in as_completed(futures):
                future.result()

        # 결과
        elapsed = time.time() - start_time
        print(f"\n{'='*55}")
        print(f"  번역 완료!")
        print(f"  번역 : {self.total_translated:,}개")
        if self.cache_hits > 0:
            print(f"  캐시 : {self.cache_hits:,}개 재사용")
        print(f"  실패 : {self.failed_batches}개 배치")
        print(f"  시간 : {elapsed/60:.1f}분")
        if self.total_translated > 0:
            print(f"  속도 : {self.total_translated/(elapsed/60):.0f}개/분")
        print(f"{'='*55}\n")


def main():
    parser = argparse.ArgumentParser(
        description='Polymarket 제목 한글 번역',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
예시:
  python translate.py                              # 기본 (2개월, 미번역만)
  python translate.py --exclude-sports -m 6 -w 5   # Sports 제외, 6개월, 5워커
  python translate.py --overwrite -m 2             # 2개월 전체 재번역
  python translate.py --from 2026-02-11 --to 2026-04-11  # 날짜 지정
  python translate.py --test                       # 테스트 (1배치)
        """)

    parser.add_argument('-w', '--workers', type=int, default=4,
                        help='워커 수 (기본: 4, 권장: 3-5)')
    parser.add_argument('-m', '--months', type=int, default=2,
                        help='번역 기간 - 오늘부터 N개월 (기본: 2)')
    parser.add_argument('--from', dest='from_date', type=str, default=None,
                        help='시작 날짜 (YYYY-MM-DD)')
    parser.add_argument('--to', dest='to_date', type=str, default=None,
                        help='종료 날짜 (YYYY-MM-DD)')
    parser.add_argument('--overwrite', action='store_true',
                        help='이미 번역된 것도 재번역')
    parser.add_argument('--exclude-sports', action='store_true',
                        help='Sports 카테고리 제외')
    parser.add_argument('--max-batches', type=int, default=None,
                        help='최대 배치 수 (테스트용)')
    parser.add_argument('--test', action='store_true',
                        help='테스트 모드 (1배치만)')

    args = parser.parse_args()

    if args.test:
        args.max_batches = 1

    if args.workers > 10:
        print("⚠️  워커가 너무 많으면 API Rate Limit에 걸릴 수 있습니다 (권장: 3-5)")
        if input("   계속? (y/N): ").lower() != 'y':
            sys.exit(0)

    start_date, end_date = calculate_date_range(
        args.months, args.from_date, args.to_date
    )

    translator = Translator(
        workers=args.workers,
        overwrite=args.overwrite,
        exclude_sports=args.exclude_sports,
        start_date=start_date,
        end_date=end_date,
    )
    translator.run(max_batches=args.max_batches)


if __name__ == '__main__':
    main()
