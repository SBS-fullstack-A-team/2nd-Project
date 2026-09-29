import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { GameCategory, GameProps } from '@simsim/shared';
import chosungQuizThumbnail from './chosung-quiz/thumbnail.svg';
import fruitSlicerThumbnail from './fruit-slicer/thumbnail.svg';
import hintQuizThumbnail from './hint-quiz/thumbnail.svg';

/**
 * 게임 등록부 — 메인 화면 카드와 /games/:gameId 라우트가 이 목록으로 자동 생성된다.
 * 배열 순서 = 메인 화면 카드 순서 (CLAUDE.md 의 "게임 카드 담당" 번호 순서대로 둔다).
 * 새 게임 추가 시 여기에 한 줄 등록하면 된다. (README 의 "새 게임 추가 체크리스트" 참고)
 */
export interface GameMeta {
  /** URL·DB·점수 상한에서 쓰는 고유 ID. DB game.id 와 같아야 한다. (소문자, 숫자, 하이픈) */
  id: string;
  name: string;
  description: string;
  /** 썸네일 이미지 URL (게임 폴더 안의 이미지를 import 해서 사용) */
  thumbnail: string;
  category: GameCategory;
  /**
   * 메인 화면 카드 번호 (CLAUDE.md "게임 카드 담당" 의 카드 번호, 1~4).
   * 이 번호 칸에 게임이 들어가고, 게임이 없는 칸은 "준비 중" 으로 표시된다.
   * 샘플 게임처럼 카드 칸에 속하지 않는 게임은 비워 두면 카드 칸 뒤에 표시된다.
   */
  card?: number;
  /** 게임 컴포넌트 — React.lazy 로 게임별 코드를 분리 로딩한다 */
  component: LazyExoticComponent<ComponentType<GameProps>>;
}

export const GAMES: readonly GameMeta[] = [
  // 카드 1 (혁)
  {
    id: 'hint-quiz',
    name: '힌트 퀴즈',
    description: '힌트가 하나씩 열린다! 적은 힌트로 먼저 맞힐수록 고득점',
    thumbnail: hintQuizThumbnail,
    category: 'quiz',
    card: 1,
    component: lazy(() => import('./hint-quiz')),
  },
  {
    id: 'chosung-quiz',
    name: '초성 퀴즈',
    description: '초성만 보고 단어를 맞혀라! 60초 동안 10문제',
    thumbnail: chosungQuizThumbnail,
    category: 'quiz',
    component: lazy(() => import('./chosung-quiz')),
  },
  // 카드 3 (신영)
  {
    id: 'fruit-slicer',
    name: '과일 슬라이서',
    description: '날아오는 과일을 베고 폭탄은 피하라! 검 스킨 10종 해금과 피버 타임',
    thumbnail: fruitSlicerThumbnail,
    category: 'arcade',
    card: 3,
    component: lazy(() => import('./fruit-slicer')),
  },
];

/**
 * 메인 화면 카드 칸 — CLAUDE.md 의 "게임 카드 담당" 표와 같게 유지한다.
 * 게임 담당자는 여기를 고치지 않고, GAMES 에 등록할 때 card 번호만 적는다.
 */
export const GAME_CARD_SLOTS: readonly { card: number; owner: string }[] = [
  { card: 1, owner: '혁' },
  { card: 2, owner: '경수' },
  { card: 3, owner: '신영' },
  { card: 4, owner: '동한' },
];

export const CATEGORY_LABEL: Record<GameCategory, string> = {
  quiz: '퀴즈',
  arcade: '아케이드',
};

export function findGame(gameId: string | undefined): GameMeta | undefined {
  return GAMES.find((game) => game.id === gameId);
}
