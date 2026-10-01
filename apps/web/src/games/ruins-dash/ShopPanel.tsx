import { useEffect, useRef, useState } from 'react';
import { ITEM_KINDS, ITEMS } from './config';
import type { Look, LookSlot } from './looks';
import { LookPreview } from './preview';
import {
  findItem,
  itemDuration,
  itemKey,
  ownsItem,
  SHOP_ITEMS,
  SLOT_LABEL,
  SLOTS,
  UPGRADE_COSTS,
  UPGRADE_MAX,
  type ShopItem,
} from './shop';
import type { Progress } from './storage';
import styles from './RuinsDash.module.css';

interface ShopPanelProps {
  progress: Progress;
  onChange: (next: Progress) => void;
  onClose: () => void;
}

type Tab = LookSlot | 'upgrade';

const TABS: readonly { id: Tab; label: string }[] = [
  ...SLOTS.map((slot) => ({ id: slot, label: SLOT_LABEL[slot] })),
  { id: 'upgrade', label: '아이템 강화' },
];

/** 미리보기 캔버스 크기 (CSS 픽셀) */
const PREVIEW_W = 220;
const PREVIEW_H = 180;

/** 동전 상점 — 꾸미기(모자·옷·등 소품·달리기 효과)와 아이템 강화 */
export function ShopPanel({ progress, onChange, onClose }: ShopPanelProps) {
  const [tab, setTab] = useState<Tab>('hat');
  /** 미리보기에 입혀 보는 모습 — 가진 것을 고르면 바로 입고, 안 가진 것은 입어 보기만 한다 */
  const [preview, setPreview] = useState<Look>(progress.look);
  const previewRef = useRef(preview);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  // 미리보기 그리기 루프
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(PREVIEW_W * dpr);
    canvas.height = Math.floor(PREVIEW_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pv = new LookPreview();
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      pv.draw(ctx, PREVIEW_W, PREVIEW_H, previewRef.current, now / 1000);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const owns = (item: ShopItem) => ownsItem(progress.owned, progress.missionLevel, item);

  function pick(item: ShopItem) {
    setPreview((cur) => ({ ...cur, [item.slot]: item.id }));
    if (owns(item) && progress.look[item.slot] !== item.id) {
      onChange({ ...progress, look: { ...progress.look, [item.slot]: item.id } });
    }
  }

  function buy(item: ShopItem) {
    if (owns(item) || item.unlockLevel !== undefined || progress.coins < item.price) return;
    onChange({
      ...progress,
      coins: progress.coins - item.price,
      owned: [...progress.owned, itemKey(item.slot, item.id)],
      look: { ...progress.look, [item.slot]: item.id },
    });
  }

  function buyUpgrade(kind: (typeof ITEM_KINDS)[number]) {
    const level = progress.upgrades[kind];
    const cost = UPGRADE_COSTS[level];
    if (cost === undefined || progress.coins < cost) return;
    onChange({
      ...progress,
      coins: progress.coins - cost,
      upgrades: { ...progress.upgrades, [kind]: level + 1 },
    });
  }

  // 지금 탭에서 입어 보는 중인 (아직 없는) 품목 — 미리보기 아래에 사기 버튼을 띄운다
  const trying = tab === 'upgrade' ? undefined : findItem(tab, preview[tab]);
  const tryingLocked = trying && !owns(trying) ? trying : undefined;

  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>상점</h2>
      <p className={styles.wallet}>🪙 {progress.coins.toLocaleString()}</p>

      <canvas
        ref={canvasRef}
        className={styles.preview}
        style={{ width: PREVIEW_W, height: PREVIEW_H }}
        aria-label="캐릭터 미리보기"
      />
      <div className={styles.tryBar}>
        {tryingLocked ? (
          tryingLocked.unlockLevel !== undefined ? (
            <span className={styles.tryNote}>
              🔒 미션 세트 {tryingLocked.unlockLevel}개를 끝내면 받아요
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => buy(tryingLocked)}
              disabled={progress.coins < tryingLocked.price}
            >
              {tryingLocked.label} 사기 · 🪙 {tryingLocked.price}
            </button>
          )
        ) : (
          <span className={styles.tryNote}>품목을 누르면 입어 볼 수 있어요</span>
        )}
      </div>

      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'upgrade' ? (
        <ul className={styles.upgrades}>
          {ITEM_KINDS.map((kind) => {
            const level = progress.upgrades[kind];
            const cost = UPGRADE_COSTS[level];
            const now = itemDuration(kind, level);
            return (
              <li key={kind} className={styles.upgrade}>
                <span className={styles.effectIcon} style={{ background: ITEMS[kind].color }}>
                  {ITEMS[kind].icon}
                </span>
                <span className={styles.upgradeInfo}>
                  <strong>{ITEMS[kind].label}</strong>
                  <span className={styles.upgradeSub}>
                    {now.toFixed(1)}초
                    {cost !== undefined && ` → ${itemDuration(kind, level + 1).toFixed(1)}초`}
                  </span>
                  <span className={styles.pips} aria-label={`강화 ${level}/${UPGRADE_MAX}단계`}>
                    {Array.from({ length: UPGRADE_MAX }, (_, i) => (
                      <span key={i} className={i < level ? styles.pipOn : styles.pip} />
                    ))}
                  </span>
                </span>
                <button
                  type="button"
                  className={`btn ${styles.buyButton}`}
                  onClick={() => buyUpgrade(kind)}
                  disabled={cost === undefined || progress.coins < cost}
                >
                  {cost === undefined ? '최고' : `🪙 ${cost}`}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className={styles.goods}>
          {(SHOP_ITEMS[tab] as readonly ShopItem[]).map((item) => {
            const owned = owns(item);
            const wearing = progress.look[item.slot] === item.id;
            const trying = preview[item.slot] === item.id;
            const status = wearing
              ? '입는 중'
              : owned
                ? '입기'
                : item.unlockLevel !== undefined
                  ? `🔒 미션 ${item.unlockLevel}세트`
                  : `🪙 ${item.price}`;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`${styles.good} ${trying ? styles.goodOn : ''} ${
                    owned ? '' : styles.goodLocked
                  }`}
                  onClick={() => pick(item)}
                  aria-pressed={trying}
                >
                  <span className={styles.goodLabel}>{item.label}</span>
                  <span className={styles.goodDesc}>{item.desc}</span>
                  <span className={wearing ? styles.goodWearing : styles.goodPrice}>{status}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className={`btn btn-primary ${styles.startButton}`} onClick={onClose}>
        돌아가기
      </button>
      <p className={styles.note}>동전은 판이 끝날 때 모인 만큼 쌓여요 · Esc 로 돌아가기</p>
    </div>
  );
}
