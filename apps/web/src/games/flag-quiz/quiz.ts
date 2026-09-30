import { COUNTRIES, type Country } from './countries';
import {
  CHOICE_COUNT,
  FULL_BONUS_SEC,
  MIN_TIME_MULTIPLIER,
  POINTS_PER_QUESTION,
  QUESTION_TIME_SEC,
  type LevelId,
  type ModeId,
} from './config';

export interface Question {
  country: Country;
  /** 보기 (정답 포함, 섞인 순서) */
  choices: Country[];
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** 이 모드·난이도에서 나올 수 있는 나라 (수도 모드는 수도 문제에 쓰는 나라만) */
function pool(mode: ModeId, level: LevelId): Country[] {
  return COUNTRIES.filter(
    (c) => (level === 'all' || c.easy) && (mode === 'flag' || c.capital !== null),
  );
}

/**
 * 한 판의 문제를 만든다 — 나라가 겹치지 않게 고르고,
 * 오답 보기는 헷갈리도록 같은 대륙에서 먼저 고른다 (모자라면 다른 대륙에서)
 */
export function buildQuestions(mode: ModeId, level: LevelId, count: number): Question[] {
  const candidates = pool(mode, level);
  return shuffle(candidates)
    .slice(0, count)
    .map((country) => {
      const others = candidates.filter((c) => c.code !== country.code);
      const sameContinent = shuffle(others.filter((c) => c.continent === country.continent));
      const rest = shuffle(others.filter((c) => c.continent !== country.continent));
      const wrong = [...sameContinent, ...rest].slice(0, CHOICE_COUNT - 1);
      return { country, choices: shuffle([country, ...wrong]) };
    });
}

/** 보기에 보여줄 글자 — 국기 모드는 나라 이름, 수도 모드는 수도 */
export function choiceLabel(mode: ModeId, country: Country): string {
  return mode === 'flag' ? country.name : (country.capital ?? country.name);
}

/** 걸린 시간(초) → 한 문제 점수 (FULL_BONUS_SEC 까지 만점, 제한시간까지 MIN_TIME_MULTIPLIER 배로 줄어듦) */
export function questionPoints(seconds: number): number {
  if (seconds <= FULL_BONUS_SEC) return POINTS_PER_QUESTION;
  const ratio = Math.min(1, (seconds - FULL_BONUS_SEC) / (QUESTION_TIME_SEC - FULL_BONUS_SEC));
  return Math.round(POINTS_PER_QUESTION * (1 - ratio * (1 - MIN_TIME_MULTIPLIER)));
}
