import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { GameCategory, GameProps } from '@simsim/shared';
import catBladeThumbnail from './cat-blade/thumbnail.svg';
import chairStackThumbnail from './chair-stack/thumbnail.svg';
import chosungQuizThumbnail from './chosung-quiz/thumbnail.svg';
import flagQuizThumbnail from './flag-quiz/thumbnail.svg';
import fruitSlicerThumbnail from './fruit-slicer/thumbnail.svg';
import hintQuizThumbnail from './hint-quiz/thumbnail.svg';
import imjin50Thumbnail from './imjin-50/thumbnail.svg';
import ruinsDashThumbnail from './ruins-dash/thumbnail.webp';
import skyAceThumbnail from './sky-ace/thumbnail.webp';
import wormArenaThumbnail from './worm-arena/thumbnail.svg';

/**
 * 카드 담당 순서 — CLAUDE.md 의 "게임 카드 담당" 표와 같게 유지한다.
 * 카드 번호는 이 순서로 4장씩 돌아간다: 1~4 = 첫 번째 게임, 5~8 = 두 번째 게임, …
 */
export const CARD_OWNERS = ['혁', '경수', '신영', '동한'] as const;
export type CardOwner = (typeof CARD_OWNERS)[number];

/**
 * 게임 등록부 — 메인 화면 카드와 /games/:gameId 라우트가 이 목록으로 자동 생성된다.
 * 새 게임은 GAME_ENTRIES **맨 뒤에** owner(내 이름)와 함께 추가하면 카드 번호가 자동으로 붙는다.
 * (README 의 "새 게임 추가 체크리스트" 참고)
 */
interface GameEntry {
  /** URL·DB·점수 상한에서 쓰는 고유 ID. DB game.id 와 같아야 한다. (소문자, 숫자, 하이픈) */
  id: string;
  name: string;
  description: string;
  /** 썸네일 이미지 URL (게임 폴더 안의 이미지를 import 해서 사용) */
  thumbnail: string;
  category: GameCategory;
  /**
   * 게임 카드 담당자 (CARD_OWNERS 중 하나) — 카드 번호를 정하는 기준.
   * 담당자 카드가 아닌 공통 게임(초성 퀴즈)은 비워 두면 카드 번호 없이 맨 뒤에 표시된다.
   */
  owner?: CardOwner;
  /** 게임 컴포넌트 — React.lazy 로 게임별 코드를 분리 로딩한다 */
  component: LazyExoticComponent<ComponentType<GameProps>>;
}

export interface GameMeta extends GameEntry {
  /**
   * 메인 화면 카드 번호 — owner 와 등록 순서로 자동 계산된다 (assignCards 참고). 직접 적지 않는다.
   * 내 n번째 게임 = (n - 1) × 4 + 내 순번. 예: 혁 1·5·9, 경수 2·6·10, 신영 3·7·11, 동한 4·8·12
   * 메인 화면·시작 메뉴는 이 번호 순서로 게임을 보여 준다. owner 가 없는 공통 게임은 undefined.
   */
  card?: number;
}

/**
 * 등록 목록 — 담당자별 n번째 게임은 이 배열에서 그 담당자의 게임이 나온 순서로 정해진다.
 * 그래서 새 게임은 반드시 **맨 뒤에** 추가하고, 이미 있는 항목의 순서는 바꾸지 않는다.
 * (앞에 끼워 넣거나 빼면 같은 담당자의 뒤쪽 게임들 카드 번호가 바뀐다)
 */
const GAME_ENTRIES: readonly GameEntry[] = [
  {
    id: 'hint-quiz',
    name: '힌트 퀴즈',
    description: '힌트가 하나씩 열린다! 적은 힌트로 먼저 맞힐수록 고득점',
    thumbnail: hintQuizThumbnail,
    category: 'quiz',
    owner: '혁',
    component: lazy(() => import('./hint-quiz')),
  },
  // 공통 게임 (owner 없음 → 카드 번호 없이 맨 뒤에 표시)
  {
    id: 'chosung-quiz',
    name: '초성 퀴즈',
    description:
      '초성만 보고 단어를 맞혀라! 10개 분야 250여 문제, 연속 정답 콤보와 올클리어 보너스',
    thumbnail: chosungQuizThumbnail,
    category: 'quiz',
    component: lazy(() => import('./chosung-quiz')),
  },
  {
    id: 'imjin-50',
    name: '임진 50',
    description: '벽으로 길을 접어 50차례의 공세를 막는 미로형 타워디펜스',
    thumbnail: imjin50Thumbnail,
    category: 'arcade',
    owner: '경수',
    component: lazy(() => import('./imjin-50')),
  },
  {
    id: 'fruit-slicer',
    name: '과일 슬라이서',
    description: '날아오는 과일을 베고 폭탄은 피하라! 검 스킨 16종·배경 테마 10종과 피버 타임',
    thumbnail: fruitSlicerThumbnail,
    category: 'arcade',
    owner: '신영',
    component: lazy(() => import('./fruit-slicer')),
  },
  {
    id: 'flag-quiz',
    name: '국기 퀴즈',
    description: '국기 보고 나라, 나라 보고 수도! 10초 안에 4지선다로 맞혀라',
    thumbnail: flagQuizThumbnail,
    category: 'quiz',
    owner: '혁',
    component: lazy(() => import('./flag-quiz')),
  },
  {
    id: 'ruins-dash',
    name: '유적 탈출',
    description: '굴러오는 바위를 피해 달려라! 점프·슬라이드·레인 이동으로 즐기는 3레인 러너',
    thumbnail: ruinsDashThumbnail,
    category: 'arcade',
    owner: '경수',
    component: lazy(() => import('./ruins-dash')),
  },
  {
    id: 'sky-ace',
    name: '스카이 에이스',
    description:
      '기체 3종 중 하나로 출격! 2단 변신 보스 5체가 기다리는 5스테이지 종스크롤 탄막 슈팅',
    thumbnail: skyAceThumbnail,
    category: 'arcade',
    owner: '신영',
    component: lazy(() => import('./sky-ace')),
  },
  {
    id: 'chair-stack',
    name: '의자 탑 쌓기',
    description: '의자를 돌리고 떨어뜨려 높이 쌓아라! 물리로 흔들리는 탑 쌓기',
    thumbnail: chairStackThumbnail,
    category: 'arcade',
    owner: '혁',
    component: lazy(() => import('./chair-stack')),
  },
  {
    id: 'cat-blade',
    name: '캣 블레이드',
    description: '무적 구르기·패링·5가지 폼 체인지로 2페이즈 보스 3체를 쓰러뜨리는 고양이 액션',
    thumbnail: catBladeThumbnail,
    category: 'arcade',
    owner: '신영',
    component: lazy(() => import('./cat-blade')),
  },
  {
    id: 'worm-arena',
    name: '지렁이 아레나',
    description: '먹이를 먹고 길어져라! AI 지렁이 앞을 가로막아 먹이로 만드는 슬리더리오 스타일',
    thumbnail: wormArenaThumbnail,
    category: 'arcade',
    owner: '경수',
    component: lazy(() => import('./worm-arena')),
  },
];

/**
 * 카드 번호 자동 지정 — 담당자마다 GAME_ENTRIES 에 나온 순서대로 n번째 게임을 세어
 * 카드 번호 = (n - 1) × 담당자 수 + 담당자 순번 을 붙인다.
 */
function assignCards(entries: readonly GameEntry[]): GameMeta[] {
  const countByOwner = new Map<CardOwner, number>();
  return entries.map((entry) => {
    if (!entry.owner) return entry;
    const nth = (countByOwner.get(entry.owner) ?? 0) + 1;
    countByOwner.set(entry.owner, nth);
    const ownerOrder = CARD_OWNERS.indexOf(entry.owner) + 1;
    return { ...entry, card: (nth - 1) * CARD_OWNERS.length + ownerOrder };
  });
}

export const GAMES: readonly GameMeta[] = assignCards(GAME_ENTRIES);

/**
 * 메인 화면·시작 메뉴에 보여 줄 순서 — 카드 번호 순, 카드 번호가 없는 공통 게임은 뒤에.
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
