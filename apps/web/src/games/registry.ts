import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { GameCategory, GameProps } from '@simsim/shared';
import chairStackThumbnail from './chair-stack/thumbnail.svg';
import chosungQuizThumbnail from './chosung-quiz/thumbnail.svg';
import flagQuizThumbnail from './flag-quiz/thumbnail.svg';
import fruitSlicerThumbnail from './fruit-slicer/thumbnail.svg';
import hintQuizThumbnail from './hint-quiz/thumbnail.svg';
import imjin50Thumbnail from './imjin-50/thumbnail.svg';
import ruinsDashThumbnail from './ruins-dash/thumbnail.webp';
import skyAceThumbnail from './sky-ace/thumbnail.webp';

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
   * 메인 화면·시작 메뉴는 이 번호 순서로 게임을 보여 준다. 아직 등록되지 않은 번호는 보이지 않는다.
   * 샘플 게임처럼 카드 번호가 없는 게임은 비워 두면 맨 뒤에 표시된다.
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
  // 카드 6 (경수)
  {
    id: 'ruins-dash',
    name: '유적 탈출',
    description: '굴러오는 바위를 피해 달려라! 점프·슬라이드·레인 이동으로 즐기는 3레인 러너',
    thumbnail: ruinsDashThumbnail,
    category: 'arcade',
    card: 6,
    component: lazy(() => import('./ruins-dash')),
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
  // 카드 9 (혁)
  {
    id: 'chair-stack',
    name: '의자 탑 쌓기',
    description: '의자를 돌리고 떨어뜨려 높이 쌓아라! 물리로 흔들리는 탑 쌓기',
    thumbnail: chairStackThumbnail,
    category: 'arcade',
    card: 9,
    component: lazy(() => import('./chair-stack')),
  },
];

/**
 * 카드 담당 순서 — CLAUDE.md 의 "게임 카드 담당" 표와 같게 유지한다.
 * 카드 번호는 이 순서로 4장씩 돌아간다: 1~4 = 첫 번째 게임, 5~8 = 두 번째 게임, …
 */
export const CARD_OWNERS = ['혁', '경수', '신영', '동한'] as const;

/**
 * 메인 화면·시작 메뉴에 보여 줄 순서 — 카드 번호 순, 카드 번호가 없는 게임(샘플 등)은 뒤에.
 * 등록된 게임만 들어가므로 아직 만들지 않은 카드 번호는 화면에 나오지 않는다.
 */
export const GAMES_BY_CARD: readonly GameMeta[] = [...GAMES].sort(
  (a, b) => (a.card ?? Number.MAX_SAFE_INTEGER) - (b.card ?? Number.MAX_SAFE_INTEGER),
);

export const CATEGORY_LABEL: Record<GameCategory, string> = {
  quiz: '퀴즈',
  arcade: '아케이드',
};

export function findGame(gameId: string | undefined): GameMeta | undefined {
  return GAMES.find((game) => game.id === gameId);
}
