-- 과일 슬라이서 시드 데이터 (아케이드 게임이라 quiz_item 문제는 없다)
-- 여러 번 실행해도 결과가 같다. (점수 기록은 유지)
-- 적용: pnpm db:seed:local (seeds/*.sql 전체가 파일명 순서대로 적용됨)

INSERT OR IGNORE INTO game (id, name, category) VALUES ('fruit-slicer', '과일 슬라이서', 'arcade');
