-- 초성 퀴즈 시드 데이터 (직접 만든 샘플 문제 20개)
-- 여러 번 실행해도 결과가 같도록 기존 문제를 지우고 다시 넣는다. (점수 기록은 유지)
-- 적용: pnpm db:seed:local

INSERT OR IGNORE INTO game (id, name, category) VALUES ('chosung-quiz', '초성 퀴즈', 'quiz');

DELETE FROM quiz_item WHERE game_id = 'chosung-quiz';

INSERT INTO quiz_item (game_id, question, answer, meta) VALUES
  ('chosung-quiz', 'ㅅㄱ', '사과', '{"category":"과일","hint":"빨갛고 아삭한 과일"}'),
  ('chosung-quiz', 'ㅂㄴㄴ', '바나나', '{"category":"과일","hint":"노랗고 길쭉한 과일"}'),
  ('chosung-quiz', 'ㅅㅂ', '수박', '{"category":"과일","hint":"여름에 먹는 커다란 과일"}'),
  ('chosung-quiz', 'ㄸㅂㅇ', '떡볶이', '{"category":"음식","hint":"빨간 양념의 분식"}'),
  ('chosung-quiz', 'ㄱㅂ', '김밥', '{"category":"음식","hint":"소풍 도시락 단골 메뉴"}'),
  ('chosung-quiz', 'ㅎㅂㄱ', '햄버거', '{"category":"음식","hint":"빵 사이에 고기 패티"}'),
  ('chosung-quiz', 'ㅎㄹㅇ', '호랑이', '{"category":"동물","hint":"줄무늬가 있는 맹수"}'),
  ('chosung-quiz', 'ㅋㄲㄹ', '코끼리', '{"category":"동물","hint":"코가 아주 긴 동물"}'),
  ('chosung-quiz', 'ㅍㄱ', '펭귄', '{"category":"동물","hint":"남극에 사는 날지 못하는 새"}'),
  ('chosung-quiz', 'ㄱㅇㅇ', '고양이', '{"category":"동물","hint":"야옹 하고 우는 반려동물"}'),
  ('chosung-quiz', 'ㄴㄱ', '농구', '{"category":"스포츠","hint":"공을 링에 넣는 경기"}'),
  ('chosung-quiz', 'ㅅㅇ', '수영', '{"category":"스포츠","hint":"물에서 하는 운동"}'),
  ('chosung-quiz', 'ㅂㅎㄱ', '비행기', '{"category":"탈것","hint":"하늘을 나는 교통수단"}'),
  ('chosung-quiz', 'ㅈㅈㄱ', '자전거', '{"category":"탈것","hint":"두 바퀴로 페달을 밟는다"}'),
  ('chosung-quiz', 'ㅈㅎㅊ', '지하철', '{"category":"탈것","hint":"땅 밑으로 다니는 열차"}'),
  ('chosung-quiz', 'ㄴㅈㄱ', '냉장고', '{"category":"가전","hint":"음식을 차갑게 보관"}'),
  ('chosung-quiz', 'ㅅㅌㄱ', '세탁기', '{"category":"가전","hint":"빨래를 해주는 기계"}'),
  ('chosung-quiz', 'ㅁㅈㄱ', '무지개', '{"category":"자연","hint":"비 온 뒤 하늘의 일곱 빛깔"}'),
  ('chosung-quiz', 'ㄴㅅㄹ', '눈사람', '{"category":"겨울","hint":"눈을 굴려서 만든다"}'),
  ('chosung-quiz', 'ㄷㅅㄱ', '도서관', '{"category":"장소","hint":"책을 빌려 볼 수 있는 곳"}');
