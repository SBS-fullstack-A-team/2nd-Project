/**
 * 게임 공통 타입 — web(게임 컴포넌트)과 api(점수 검증)가 함께 사용한다.
 */

/** 게임 분류. 새 분류가 필요하면 여기에 추가한다. */
export type GameCategory = 'quiz' | 'arcade';

/**
 * 모든 게임 컴포넌트가 따르는 공통 Props.
 * 게임은 점수 계산까지만 책임지고, 점수 등록/랭킹 표시는 공통 페이지가 처리한다.
 */
export interface GameProps {
  /** 게임이 끝났을 때 최종 점수를 전달한다. 한 판에 한 번만 호출해야 한다. */
  onFinish: (score: number) => void;
}

/** 퀴즈류 게임의 문제 1개. meta 구조는 게임마다 다르다. */
export interface QuizItem<TMeta = Record<string, unknown>> {
  id: number;
  question: string;
  answer: string;
  meta: TMeta;
}

/** 초성 퀴즈 문제의 meta */
export interface ChosungQuizMeta {
  /** 정답 분류 (예: 과일, 동물) — 화면에 항상 보여준다 */
  category: string;
  /** 추가 힌트 (선택) */
  hint?: string;
  /** 정답으로 함께 인정할 단어 (선택) */
  aliases?: string[];
}

/** 힌트 퀴즈 힌트 1개 (예: { label: '국적', value: '대한민국' }) */
export interface HintQuizHint {
  label: string;
  value: string;
}

/** 힌트 퀴즈 문제의 meta */
export interface HintQuizMeta {
  /** 정답 분류 (예: 축구선수, 동물) — 화면에 항상 보여준다 */
  category: string;
  /** 막연한 것 → 구체적인 것 순서의 힌트 (한 문제에 5개) */
  hints: HintQuizHint[];
  /** 정답으로 함께 인정할 이름 (선택, 예: 별명·영문 이름) */
  aliases?: string[];
  /** 자동 생성한 문제의 출처 (예: 'wikidata'). 직접 만든 문제는 없음 */
  source?: string;
  /** 출처가 위키데이터일 때 항목 ID (예: 'Q615') — 데이터 확인·갱신용 */
  wikidata?: string;
}

/**
 * 게임별 점수 상한 — 서버가 비정상 점수를 거르는 데 사용한다.
 * 새 게임을 추가하면 반드시 여기에 등록할 것 (미등록 시 DEFAULT_MAX_SCORE 적용).
 */
export const MAX_SCORE_BY_GAME: Record<string, number> = {
  'chosung-quiz': 100,
  'flag-quiz': 1500,
  'fruit-slicer': 100_000,
  'hint-quiz': 1000,
  // 시뮬레이션상 무피해 완전 방어가 약 201만 점 — 더 잘하는 플레이어를 위해 넉넉히 잡은 상한
  'imjin-50': 3_000_000,
  // 시뮬레이션상 무피해 올 클리어가 약 75~80만 점 — 게임 내부 상한(config.ts MAX_SCORE)과 같게
  'sky-ace': 1_500_000,
  // 최고 속도 42m/s · 배율 ×5 로 1시간 넘게 달려도 닿지 않을 만큼 넉넉한 상한
  'ruins-dash': 3_000_000,
  // 점수 = 최고 높이(cm). 의자 수백 개를 쌓아도 닿지 않을 상한 — 게임 내부 상한(config.ts MAX_SCORE)과 같게
  'chair-stack': 50_000,
};

export const DEFAULT_MAX_SCORE = 1_000_000;

export function getMaxScore(gameId: string): number {
  return MAX_SCORE_BY_GAME[gameId] ?? DEFAULT_MAX_SCORE;
}
