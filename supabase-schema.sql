-- Supabase 데이터베이스 스키마
-- 이 SQL을 Supabase 대시보드의 SQL Editor에서 실행하세요

-- recommendations 테이블 생성
CREATE TABLE IF NOT EXISTS recommendations (
    id BIGSERIAL PRIMARY KEY,
    place_name TEXT NOT NULL,
    address TEXT,
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성 (성능 향상)
CREATE INDEX IF NOT EXISTS idx_recommendations_place_name ON recommendations(place_name);
CREATE INDEX IF NOT EXISTS idx_recommendations_created_at ON recommendations(created_at);

-- Row Level Security (RLS) 설정
-- 서버 사이드에서만 접근하므로 RLS는 비활성화하거나 서비스 역할 키를 사용합니다
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기/쓰기 가능하도록 정책 생성 (서비스 역할 키 사용 시 필요 없음)
-- 하지만 보안을 위해 서비스 역할 키를 사용하는 것을 권장합니다
CREATE POLICY "Allow all operations for service role" ON recommendations
    FOR ALL
    USING (true)
    WITH CHECK (true);

