import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import marbleRaceThumbnail from './marble-race/thumbnail.svg';
import pinballLadderThumbnail from './pinball-ladder/thumbnail.svg';
import rouletteWheelThumbnail from './roulette-wheel/thumbnail.svg';

/**
 * 방송 도구 등록부 — 메인 화면 "방송 도구" 섹션과 /tools/:toolId 라우트가 이 목록으로 자동 생성된다.
 * 방송 도구는 점수·랭킹이 없는 공통 도구(추첨 등)다. 게임 카드 번호(owner)도 없다.
 * 새 도구는 apps/web/src/tools/<도구id>/ 폴더를 만들고 TOOLS 맨 뒤에 추가한다. (README "방송 도구" 참고)
 */
export interface ToolMeta {
  /** URL 에서 쓰는 고유 ID — 도구 폴더명과 같아야 한다 (소문자, 숫자, 하이픈) */
  id: string;
  name: string;
  description: string;
  /** 썸네일 이미지 URL (도구 폴더 안의 이미지를 import 해서 사용) */
  thumbnail: string;
  /** 도구 컴포넌트 — React.lazy 로 도구별 코드를 분리 로딩한다. 점수를 넘기지 않으므로 props 가 없다 */
  component: LazyExoticComponent<ComponentType>;
}

/** 메인 화면·시작 메뉴에 이 순서대로 나온다. 비어 있으면 "방송 도구" 섹션이 숨겨진다 */
export const TOOLS: readonly ToolMeta[] = [
  {
    id: 'marble-race',
    name: '구슬 레이스',
    description:
      '시청자 이름 구슬들의 서킷 레이스! 부스터·구멍·역전 중계로 1등 뽑기·꼴등 뽑기 추첨',
    thumbnail: marbleRaceThumbnail,
    component: lazy(() => import('./marble-race')),
  },
  {
    id: 'pinball-ladder',
    name: '핀볼 사다리',
    description:
      '사다리타기 대신! 이름 공이 핀에 튕기며 결과 칸에 쏙 — 한 칸에 한 명씩 1:1 짝짓기 추첨',
    thumbnail: pinballLadderThumbnail,
    component: lazy(() => import('./pinball-ladder')),
  },
  {
    id: 'roulette-wheel',
    name: '돌림판 룰렛',
    description:
      '벌칙·미션·후원 룰렛! 항목별 확률 조절, 뽑힌 항목 빼기, 아슬아슬하게 멈추는 돌림판',
    thumbnail: rouletteWheelThumbnail,
    component: lazy(() => import('./roulette-wheel')),
  },
];

export const TOOL_LABEL = '방송 도구';

export function findTool(toolId: string | undefined): ToolMeta | undefined {
  return TOOLS.find((tool) => tool.id === toolId);
}
