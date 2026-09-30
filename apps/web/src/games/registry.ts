import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { GameCategory, GameProps } from '@simsim/shared';
import chosungQuizThumbnail from './chosung-quiz/thumbnail.svg';
import flagQuizThumbnail from './flag-quiz/thumbnail.svg';
import fruitSlicerThumbnail from './fruit-slicer/thumbnail.svg';
import hintQuizThumbnail from './hint-quiz/thumbnail.svg';
import imjin50Thumbnail from './imjin-50/thumbnail.svg';
import skyAceThumbnail from './sky-ace/thumbnail.svg';

/**
 * 게임 등록부 — 메인 화면 카드와 /games/:gameId 라우트가 이 목록으로 자동 생성된다.
 * 메인 화면 카드 순서는 card 번호로 정해진다. 배열도 card 번호 순서대로 둔다.
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
   * 메인 화면 카드 번호 — 4명이 순서대로 돌아가며 받는다 (CARD_OWNERS 참고).
   * 내 n번째 게임 = (n - 1) × 4 + 내 순번. 예: 혁 1·5·9, 경수 2·6·10, 신영 3·7·11, 동한 4·8·12
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
  // 카드 2 (경수)
  {
    id: 'imjin-50',
    name: '임진 50',
    description: '벽으로 길을 접어 50차례의 공세를 막는 미로형 타워디펜스',
    thumbnail: imjin50Thumbnail,
    category: 'arcade',
    card: 2,
    component: lazy(() => import('./imjin-50')),
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
  // 카드 5 (혁)
  {
    id: 'flag-quiz',
    name: '국기 퀴즈',
    description: '국기 보고 나라, 나라 보고 수도! 10초 안에 4지선다로 맞혀라',
    thumbnail: flagQuizThumbnail,
    category: 'quiz',
    card: 5,
    component: lazy(() => import('./flag-quiz')),
  },
  // 카드 7 (신영)
  {
    id: 'sky-ace',
    name: '스카이 에이스',
    description: '기체 3종 중 하나로 출격! 2단 변신 보스 3체가 기다리는 종스크롤 탄막 슈팅',
    thumbnail: skyAceThumbnail,
    category: 'arcade',
    card: 7,
    component: lazy(() => import('./sky-ace')),
  },
];

/**
 * 카드 담당 순서 — CLAUDE.md 의 "게임 카드 담당" 표와 같게 유지한다.
 * 카드 번호는 이 순서로 4장씩 돌아간다: 1~4 = 첫 번째 게임, 5~8 = 두 번째 게임, …
 */
export const CARD_OWNERS = ['혁', '경수', '신영', '동한'] as const;

/** 카드 번호의 담당자 (1·5·9 → 혁, 2·6·10 → 경수 …) */
export function cardOwner(card: number): string {
  return CARD_OWNERS[(card - 1) % CARD_OWNERS.length] ?? '';
}

/**
 * 메인 화면 카드 칸 — 등록된 가장 큰 card 번호가 속한 차례(4장 묶음)까지 만든다.
 * 예: card 5 가 등록되면 5~8 칸이 생기고, 아직 게임이 없는 6·7·8 은 "준비 중".
 * 게임 담당자는 여기를 고치지 않고, GAMES 에 등록할 때 card 번호만 적는다.
 */
const maxCard = Math.max(CARD_OWNERS.length, ...GAMES.map((game) => game.card ?? 0));
const slotCount = Math.ceil(maxCard / CARD_OWNERS.length) * CARD_OWNERS.length;

export const GAME_CARD_SLOTS: readonly { card: number; owner: string }[] = Array.from(
  { length: slotCount },
  (_, i) => ({ card: i + 1, owner: cardOwner(i + 1) }),
);

export const CATEGORY_LABEL: Record<GameCategory, string> = {
  quiz: '퀴즈',
  arcade: '아케이드',
};

export function findGame(gameId: string | undefined): GameMeta | undefined {
  return GAMES.find((game) => game.id === gameId);
}
