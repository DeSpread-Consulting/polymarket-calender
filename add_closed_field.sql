-- 시장 정산 여부 필드 추가
ALTER TABLE poly_events
ADD COLUMN IF NOT EXISTS closed BOOLEAN DEFAULT false;

-- 인덱스 추가 (필터링 성능 향상)
CREATE INDEX IF NOT EXISTS idx_poly_events_closed
ON poly_events(closed);

-- 기본값 설정: 기존 데이터는 마감일 지난 것은 closed=true로 추정
UPDATE poly_events
SET closed = (end_date < NOW())
WHERE closed IS NULL;
