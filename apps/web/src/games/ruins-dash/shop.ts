import { ITEMS, type ItemKind } from './config';
import type { Look, LookSlot } from './looks';

/**
 * 동전 상점 — 판마다 모은 동전으로 아이템을 강화하고 모자·옷·등 소품·달리기 효과를 산다.
 * 한 판(1~1.5분)에 동전이 대략 40~70개 모인다. 강화 한 줄을 다 채우려면 스무 판 남짓.
 */

/** 아이템 강화 단계별 가격 (0 → 1 단계가 첫 값) */
export const UPGRADE_COSTS = [60, 120, 200, 300, 450] as const;
export const UPGRADE_MAX = UPGRADE_COSTS.length;

/** 강화 1단계마다 늘어나는 지속 시간(초) */
export const UPGRADE_STEP_SEC: Record<ItemKind, number> = {
  magnet: 1.5,
  shield: 2,
  boost: 0.6,
  double: 2,
};

export function itemDuration(kind: ItemKind, level: number): number {
  return ITEMS[kind].duration + UPGRADE_STEP_SEC[kind] * level;
}

/** 꾸미기 품목 하나 */
export interface ShopItem<S extends LookSlot = LookSlot> {
  slot: S;
  id: Look[S];
  label: string;
  /** 한 줄 설명 */
  desc: string;
  /** 동전 가격 (0 = 처음부터 있음) */
  price: number;
  /** 미션 보상 전용 — 이 미션 레벨(끝낸 세트 수)에 닿으면 저절로 생긴다 */
  unlockLevel?: number;
}

export const SLOT_LABEL: Record<LookSlot, string> = {
  hat: '모자',
  suit: '옷',
  pack: '등 소품',
  trail: '달리기 효과',
};

export const SLOTS: readonly LookSlot[] = ['hat', 'suit', 'pack', 'trail'];

export const SHOP_ITEMS: { [S in LookSlot]: readonly ShopItem<S>[] } = {
  hat: [
    { slot: 'hat', id: 'explorer', label: '탐험가 모자', desc: '챙 넓은 가죽 모자', price: 0 },
    { slot: 'hat', id: 'bandana', label: '두건', desc: '뒤로 끈이 휘날린다', price: 80 },
    { slot: 'hat', id: 'safari', label: '사파리 헬멧', desc: '둥근 챙의 하얀 헬멧', price: 120 },
    {
      slot: 'hat',
      id: 'propeller',
      label: '프로펠러 모자',
      desc: '빨리 달릴수록 세게 돈다',
      price: 180,
    },
    { slot: 'hat', id: 'miner', label: '광부 헬멧', desc: '이마에 불빛이 켜진다', price: 200 },
    { slot: 'hat', id: 'viking', label: '바이킹 뿔 투구', desc: '양옆으로 솟은 큰 뿔', price: 280 },
    {
      slot: 'hat',
      id: 'torch',
      label: '횃불 투구',
      desc: '배율이 오를수록 불꽃이 커지고, 최고 배율이면 파랗게',
      price: 400,
    },
    {
      slot: 'hat',
      id: 'crown',
      label: '황금 왕관',
      desc: '보석이 반짝이는 유적의 왕관',
      price: 0,
      unlockLevel: 4,
    },
  ],
  suit: [
    { slot: 'suit', id: 'explorer', label: '탐험가', desc: '베이지 셔츠와 갈색 바지', price: 0 },
    { slot: 'suit', id: 'ranger', label: '정글 레인저', desc: '조끼와 반바지', price: 250 },
    {
      slot: 'suit',
      id: 'nomad',
      label: '사막 유목민',
      desc: '긴 스카프가 뒤로 휘날린다',
      price: 350,
    },
    {
      slot: 'suit',
      id: 'golden',
      label: '황금 전사',
      desc: '어깨 갑옷을 두른 황금 옷',
      price: 0,
      unlockLevel: 8,
    },
  ],
  pack: [
    { slot: 'pack', id: 'backpack', label: '배낭', desc: '담요를 얹은 가죽 배낭', price: 0 },
    { slot: 'pack', id: 'scroll', label: '두루마리 통', desc: '비스듬히 멘 지도 통', price: 120 },
    { slot: 'pack', id: 'treasure', label: '보물 자루', desc: '동전이 삐져나온 자루', price: 200 },
    { slot: 'pack', id: 'shield', label: '방패 등짐', desc: '등에 멘 둥근 방패', price: 300 },
  ],
  trail: [
    { slot: 'trail', id: 'dust', label: '먼지', desc: '딛을 때마다 흙먼지가 인다', price: 0 },
    { slot: 'trail', id: 'leaf', label: '나뭇잎', desc: '밟을 때마다 잎이 날린다', price: 100 },
    {
      slot: 'trail',
      id: 'ember',
      label: '불꽃 발자국',
      desc: '딛은 자리에 불타는 발자국이 남는다',
      price: 150,
    },
    { slot: 'trail', id: 'gold', label: '황금 가루', desc: '반짝이는 가루가 흩날린다', price: 250 },
    { slot: 'trail', id: 'lightning', label: '번개', desc: '발밑에서 전기가 튄다', price: 300 },
    {
      slot: 'trail',
      id: 'rainbow',
      label: '무지개 리본',
      desc: '발 뒤로 무지개 띠가 길게 이어진다',
      price: 350,
    },
  ],
};

/** 저장할 때 쓰는 품목 키 (예: "hat:miner") */
export function itemKey(slot: LookSlot, id: string): string {
  return `${slot}:${id}`;
}

export function findItem<S extends LookSlot>(slot: S, id: string): ShopItem<S> | undefined {
  return (SHOP_ITEMS[slot] as readonly ShopItem<S>[]).find((it) => it.id === id);
}

/** 미션 레벨이 딱 이 값이 될 때 받는 보상 품목 */
export function rewardsAt(level: number): ShopItem[] {
  return SLOTS.flatMap((slot) =>
    (SHOP_ITEMS[slot] as readonly ShopItem[]).filter((it) => it.unlockLevel === level),
  );
}

/** 가진 품목인지 — 기본 품목과 미션 레벨에 닿은 보상은 저절로 가진 것으로 친다 */
export function ownsItem(owned: readonly string[], missionLevel: number, item: ShopItem): boolean {
  if (item.unlockLevel !== undefined) return missionLevel >= item.unlockLevel;
  return item.price === 0 || owned.includes(itemKey(item.slot, item.id));
}
