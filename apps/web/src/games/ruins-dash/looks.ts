/**
 * 캐릭터 꾸미기 — 모자 · 옷 · 등 소품 · 달리기 효과 네 칸을 따로 골라 조합한다.
 * 색만 바꾸는 대신 모양(실루엣)이 바뀌게 해서, 뒤에서 따라가는 카메라에도 차이가 잘 보인다.
 */

export type HatId =
  'explorer' | 'bandana' | 'safari' | 'propeller' | 'miner' | 'viking' | 'torch' | 'crown';
export type SuitId = 'explorer' | 'ranger' | 'nomad' | 'golden';
export type PackId = 'backpack' | 'scroll' | 'treasure' | 'shield';
export type TrailId = 'dust' | 'leaf' | 'ember' | 'gold' | 'lightning' | 'rainbow';

export interface Look {
  hat: HatId;
  suit: SuitId;
  pack: PackId;
  trail: TrailId;
}

export type LookSlot = keyof Look;

export const DEFAULT_LOOK: Look = {
  hat: 'explorer',
  suit: 'explorer',
  pack: 'backpack',
  trail: 'dust',
};
