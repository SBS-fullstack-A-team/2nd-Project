-- 임진 50 시드 데이터 (퀴즈류가 아니라 문제 데이터 없음)
-- 적용: pnpm db:seed:local (seeds/*.sql 전체가 파일명 순서대로 적용됨)

INSERT OR IGNORE INTO game (id, name, category) VALUES ('imjin-50', '임진 50', 'arcade');
