-- 추론된 카테고리 컬럼 추가
ALTER TABLE poly_events
ADD COLUMN IF NOT EXISTS inferred_category TEXT;

-- 인덱스 추가 (필터링 성능 향상)
CREATE INDEX IF NOT EXISTS idx_poly_events_inferred_category
ON poly_events(inferred_category);

-- 기존 데이터에 대해 Uncategorized 설정
UPDATE poly_events
SET inferred_category = 'Uncategorized'
WHERE inferred_category IS NULL;
