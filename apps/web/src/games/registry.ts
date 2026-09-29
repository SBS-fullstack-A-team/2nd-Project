import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { GameCategory, GameProps } from '@simsim/shared';
import chosungQuizThumbnail from './chosung-quiz/thumbnail.svg';
import imjin50Thumbnail from './imjin-50/thumbnail.svg';

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
  /** 게임 컴포넌트 — React.lazy 로 게임별 코드를 분리 로딩한다 */
  component: LazyExoticComponent<ComponentType<GameProps>>;
}

export const GAMES: readonly GameMeta[] = [
  {
    id: 'chosung-quiz',
    name: '초성 퀴즈',
    description: '초성만 보고 단어를 맞혀라! 60초 동안 10문제',
    thumbnail: chosungQuizThumbnail,
    category: 'quiz',
    component: lazy(() => import('./chosung-quiz')),
  },
  {
    id: 'imjin-50',
    name: '임진 50',
    description: '벽으로 길을 접어 쉰 차례의 공세를 막는 미로형 타워디펜스',
    thumbnail: imjin50Thumbnail,
    category: 'arcade',
    component: lazy(() => import('./imjin-50')),
  },
];

export const CATEGORY_LABEL: Record<GameCategory, string> = {
  quiz: '퀴즈',
  arcade: '아케이드',
};

export function findGame(gameId: string | undefined): GameMeta | undefined {
  return GAMES.find((game) => game.id === gameId);
}
