import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { NICKNAME_MAX_LENGTH, type GameProps, type SubmitScoreResponse } from '@simsim/shared';
import { api, getErrorMessage } from '../../lib/api';
import { useFetch } from '../../lib/useFetch';
import {
  BLADES,
  CHAMPION_BLADE_ID,
  CHAMPION_RANK,
  GAME_ID,
  HOW_TO_PLAY,
  QUESTS,
  RANKING_SIZE,
  THEMES,
  THEME_QUESTS,
  TIER_LABEL,
  type BladeId,
  type BladeTier,
  type QuestDef,
  type ThemeDef,
  type ThemeId,
} from './config';
import { FruitSlicerEngine } from './engine';
import { QuestManager, type QuestSnapshot, type Unlock } from './QuestManager';
import { SoundManager } from './SoundManager';
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  loadSettings,
  saveSettings,
  type GameSettings,
} from './settings';
import { drawThemeSnapshot } from './themes';
import styles from './FruitSlicer.module.css';

type MenuView = 'main' | 'blades' | 'themes' | 'quests' | 'howto';

type Screen =
  | { name: 'menu'; view: MenuView }
  | { name: 'playing' }
  | { name: 'nameEntry'; score: number }
  | { name: 'ranking'; score: number | null; submitted: SubmitScoreResponse | null };

interface Toast {
  id: number;
  unlock: Unlock;
}

/**
 * 과일 슬라이서 — Canvas 로 그리는 Fruit Ninja 스타일 게임.
 * 게임 오버 시 게임 안에서 이름을 받아 서버 랭킹(공통 점수 API)에 등록하고 TOP 5 를 보여준다.
 * 그래서 공통 결과창과 중복되지 않도록 onFinish 는 호출하지 않는다.
 */
export default function FruitSlicer(_props: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FruitSlicerEngine | null>(null);
  const [quests] = useState(() => new QuestManager());
  const [sound] = useState(() => new SoundManager());
  const [snapshot, setSnapshot] = useState<QuestSnapshot>(() => quests.snapshot());
  const [screen, setScreen] = useState<Screen>({ name: 'menu', view: 'main' });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 값이 바뀔 때마다 랭커 전용 검 자격을 서버 랭킹으로 다시 확인한다 */
  const [championCheck, setChampionCheck] = useState(0);
  const toastSeq = useRef(0);
  const toastTimers = useRef(new Set<number>());

  /** 설정 창이 게임 도중에 열렸는지 (= 일시정지 상태) */
  const pausedInGame = settingsOpen && screen.name === 'playing';

  // 설정이 바뀌면 사운드에 반영하고 저장한다
  useEffect(() => {
    sound.apply(settings);
    saveSettings(settings);
  }, [sound, settings]);

  useEffect(() => () => sound.destroy(), [sound]);

  useEffect(() => {
    const timers = toastTimers.current;
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);

  /** 검·테마 해금 알림 — 효과음 + 3초 동안 토스트 */
  const showUnlocks = useCallback(
    (unlocks: Unlock[]) => {
      sound.play('unlock');
      const added = unlocks.map((unlock) => ({ id: ++toastSeq.current, unlock }));
      setToasts((prev) => [...prev, ...added]);
      const timer = window.setTimeout(() => {
        toastTimers.current.delete(timer);
        setToasts((prev) => prev.filter((t) => !added.includes(t)));
      }, 3000);
      toastTimers.current.add(timer);
    },
    [sound],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: FruitSlicerEngine;
    try {
      engine = new FruitSlicerEngine(canvas, quests, sound, {
        onUnlock: (unlocks) => {
          setSnapshot(quests.snapshot());
          showUnlocks(unlocks);
        },
        onGameOver: (score) => {
          setSnapshot(quests.snapshot());
          setScreen({ name: 'nameEntry', score });
        },
      });
    } catch (err) {
      // 이펙트 안에서 바로 setState 하지 않도록 다음 틱으로 미룬다
      queueMicrotask(() => setEngineError(getErrorMessage(err)));
      return;
    }
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
      sound.stopBgm();
      quests.save();
    };
  }, [quests, sound, showUnlocks]);

  // 랭커 전용 검 — 서버 랭킹 TOP 3 안에 내 닉네임(마지막으로 등록한 이름)이 있으면 쓸 수 있다
  useEffect(() => {
    let cancelled = false;
    const nickname = loadNickname().trim();
    const check = nickname
      ? api
          .getRanking(GAME_ID, CHAMPION_RANK)
          .then((res) => res.items.some((entry) => entry.nickname === nickname))
      : Promise.resolve(false);
    check
      .then((eligible) => {
        if (cancelled) return;
        const gained = quests.setChampion(eligible);
        engineRef.current?.setBlade(quests.selected);
        setSnapshot(quests.snapshot());
        const blade = BLADES.find((b) => b.id === CHAMPION_BLADE_ID);
        if (gained && blade) showUnlocks([{ kind: 'blade', def: blade }]);
      })
      .catch(() => {
        // 랭킹을 못 불러오면 이전 상태를 그대로 둔다
      });
    return () => {
      cancelled = true;
    };
  }, [quests, showUnlocks, championCheck]);

  function startGame() {
    sound.unlock(); // 브라우저 자동재생 정책 — 클릭 안에서 오디오를 깨운다
    sound.resume();
    setSettingsOpen(false);
    engineRef.current?.start();
    setScreen({ name: 'playing' });
  }

  function goMenu(view: MenuView = 'main') {
    engineRef.current?.idle();
    sound.resume();
    setSettingsOpen(false);
    setSnapshot(quests.snapshot());
    setScreen({ name: 'menu', view });
  }

  /** 설정 열기 — 게임 중이면 일시정지 */
  function openSettings() {
    sound.unlock();
    if (screen.name === 'playing') {
      engineRef.current?.pause();
      sound.pause();
    }
    setSettingsOpen(true);
  }

  /** 설정 닫기 — 게임 중이었으면 이어서 진행 */
  function closeSettings() {
    setSettingsOpen(false);
    if (screen.name === 'playing') {
      engineRef.current?.resume();
      sound.resume();
    }
  }

  function updateSettings(patch: Partial<GameSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  // Esc 로 일시정지/계속하기 (메뉴에서는 설정 창 열고 닫기)
  useEffect(() => {
    if (screen.name !== 'playing' && screen.name !== 'menu') return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.repeat) return;
      e.preventDefault();
      if (settingsOpen) closeSettings();
      else openSettings();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 다른 탭·창으로 전환하면 자동 일시정지 (돌아왔을 때 과일을 놓쳐 있지 않도록)
  useEffect(() => {
    if (screen.name !== 'playing' || settingsOpen) return;
    function onVisibility() {
      if (document.visibilityState === 'hidden') openSettings();
    }
    function onBlur() {
      openSettings();
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    };
  });

  function selectBlade(id: BladeId) {
    if (!quests.select(id)) return;
    engineRef.current?.setBlade(id);
    setSnapshot(quests.snapshot());
  }

  function selectTheme(id: ThemeId) {
    if (!quests.selectTheme(id)) return;
    sound.play('click');
    engineRef.current?.setTheme(id);
    setSnapshot(quests.snapshot());
  }

  return (
    <div className={styles.root}>
      <div className={styles.stage}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          aria-label="과일 슬라이서 게임 화면"
          style={
            settings.brightness !== 1 ? { filter: `brightness(${settings.brightness})` } : undefined
          }
        />

        {engineError && (
          <div className={styles.overlay}>
            <p className={styles.panelText}>게임 화면을 만들 수 없어요. ({engineError})</p>
          </div>
        )}

        {screen.name === 'menu' && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              {screen.view === 'main' && (
                <MainMenu
                  snapshot={snapshot}
                  onStart={startGame}
                  onNavigate={goMenu}
                  onRanking={() => setScreen({ name: 'ranking', score: null, submitted: null })}
                />
              )}
              {screen.view === 'blades' && (
                <BladeInventory snapshot={snapshot} onSelect={selectBlade} />
              )}
              {screen.view === 'themes' && (
                <ThemeGallery snapshot={snapshot} onSelect={selectTheme} />
              )}
              {screen.view === 'quests' && <QuestList snapshot={snapshot} />}
              {screen.view === 'howto' && <HowToPlay />}
              {screen.view !== 'main' && (
                <button
                  type="button"
                  className={`btn ${styles.backButton}`}
                  onClick={() => goMenu()}
                >
                  ← 메뉴로
                </button>
              )}
            </div>
          </div>
        )}

        {screen.name === 'nameEntry' && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <NameEntry
                score={screen.score}
                isBest={screen.score > 0 && screen.score >= snapshot.stats.highScore}
                onDone={(submitted) => {
                  setScreen({ name: 'ranking', score: screen.score, submitted });
                  // 등록했으면 순위가 바뀌었을 수 있으니 랭커 전용 검 자격을 다시 확인
                  if (submitted) setChampionCheck((n) => n + 1);
                }}
              />
            </div>
          </div>
        )}

        {screen.name === 'ranking' && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <RankingBoard score={screen.score} submitted={screen.submitted} />
              <div className={styles.actions}>
                {screen.score !== null && (
                  <button type="button" className="btn btn-primary" onClick={startGame}>
                    다시 하기
                  </button>
                )}
                <button type="button" className="btn" onClick={() => goMenu()}>
                  메뉴로
                </button>
              </div>
            </div>
          </div>
        )}

        {settingsOpen && (
          <div className={`${styles.overlay} ${styles.settingsOverlay}`}>
            <div
              className={styles.panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby="fruit-slicer-settings-title"
            >
              <SettingsPanel
                settings={settings}
                inGame={pausedInGame}
                onChange={updateSettings}
                onPreviewSfx={() => sound.play('click')}
                onClose={closeSettings}
                onRestart={startGame}
                onHome={() => goMenu()}
              />
            </div>
          </div>
        )}

        {/* 오른쪽 위 설정(일시정지) 버튼 — 메뉴·게임 중에만 */}
        {!settingsOpen && !engineError && (screen.name === 'menu' || screen.name === 'playing') && (
          <button
            type="button"
            className={styles.settingsButton}
            onClick={openSettings}
            aria-label={screen.name === 'playing' ? '일시정지 및 설정' : '설정'}
            title={screen.name === 'playing' ? '일시정지 (Esc)' : '설정 (Esc)'}
          >
            {/* 톱니바퀴: 가운데가 뚫린 고리 + 톱니 8개 */}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="5.6" fill="none" stroke="currentColor" strokeWidth="3.6" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <rect
                  key={deg}
                  x="10.4"
                  y="1.6"
                  width="3.2"
                  height="5"
                  rx="1"
                  fill="currentColor"
                  transform={`rotate(${deg} 12 12)`}
                />
              ))}
            </svg>
          </button>
        )}

        <div className={styles.toasts} aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={styles.toast}>
              <span className={styles.toastSwatch} style={{ background: t.unlock.def.preview }} />
              <span>
                {t.unlock.kind === 'theme' ? '🎨 새 테마 해금!' : '🔓 새 검 해금!'}{' '}
                <strong>{t.unlock.def.name}</strong>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 메뉴 화면들 ---------------- */

function MainMenu({
  snapshot,
  onStart,
  onNavigate,
  onRanking,
}: {
  snapshot: QuestSnapshot;
  onStart: () => void;
  onNavigate: (view: MenuView) => void;
  onRanking: () => void;
}) {
  const blade = BLADES.find((b) => b.id === snapshot.selected) ?? BLADES[0]!;
  const theme = THEMES.find((t) => t.id === snapshot.selectedTheme) ?? THEMES[0]!;
  return (
    <>
      <p className={styles.logo}>
        <span>FRUIT</span> SLICER
      </p>
      <p className={styles.panelText}>날아오는 과일을 베고, 폭탄은 피하세요!</p>
      <dl className={styles.statRow}>
        <div>
          <dt>내 최고 점수</dt>
          <dd>{snapshot.stats.highScore}</dd>
        </div>
        <div>
          <dt>장착한 검</dt>
          <dd>
            <span className={styles.inlineSwatch} style={{ background: blade.preview }} />
            {blade.name}
          </dd>
        </div>
        <div>
          <dt>배경 테마</dt>
          <dd>
            <span className={styles.inlineSwatch} style={{ background: theme.preview }} />
            {theme.name}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        className={`btn btn-primary ${styles.startButton}`}
        onClick={onStart}
        autoFocus
      >
        게임 시작
      </button>
      <div className={styles.menuGrid}>
        <button type="button" className="btn" onClick={() => onNavigate('blades')}>
          🗡️ 검 선택{' '}
          <small className={styles.menuCount}>
            {snapshot.unlocked.size}/{BLADES.length}
          </small>
        </button>
        <button type="button" className="btn" onClick={() => onNavigate('themes')}>
          🎨 배경 테마{' '}
          <small className={styles.menuCount}>
            {snapshot.unlockedThemes.size}/{THEMES.length}
          </small>
        </button>
        <button type="button" className="btn" onClick={() => onNavigate('quests')}>
          📜 퀘스트
        </button>
        <button type="button" className="btn" onClick={() => onNavigate('howto')}>
          ❓ 게임 방법
        </button>
        <button type="button" className={`btn ${styles.menuWide}`} onClick={onRanking}>
          🏆 랭킹 TOP {RANKING_SIZE}
        </button>
      </div>
    </>
  );
}

const TIER_CLASS: Record<BladeTier, string> = {
  normal: '',
  epic: styles.bladeEpic ?? '',
  legend: styles.bladeLegend ?? '',
  champion: styles.bladeChampion ?? '',
};

const TIER_BADGE_CLASS: Record<BladeTier, string | undefined> = {
  normal: undefined,
  epic: styles.epicBadge,
  legend: styles.legendBadge,
  champion: styles.championBadge,
};

function BladeInventory({
  snapshot,
  onSelect,
}: {
  snapshot: QuestSnapshot;
  onSelect: (id: BladeId) => void;
}) {
  return (
    <>
      <h2 className={styles.panelTitle}>검 선택</h2>
      <ul className={styles.bladeList}>
        {BLADES.map((blade) => {
          const unlocked = snapshot.unlocked.has(blade.id);
          const selected = snapshot.selected === blade.id;
          const quest = QUESTS.find((q) => q.reward === blade.id);
          const condition =
            blade.tier === 'champion'
              ? `전체 랭킹 TOP ${CHAMPION_RANK} 안에 이름 올리기 (마지막으로 등록한 이름 기준)`
              : (quest?.title ?? '-');
          const tierClass = TIER_CLASS[blade.tier];
          return (
            <li key={blade.id}>
              <button
                type="button"
                className={`${styles.bladeItem} ${tierClass} ${selected ? styles.bladeSelected : ''}`}
                disabled={!unlocked}
                aria-pressed={selected}
                onClick={() => onSelect(blade.id)}
              >
                <span
                  className={`${styles.bladeSwatch} ${blade.tier !== 'normal' ? styles.swatchShine : ''} ${blade.tier === 'champion' ? styles.swatchChampion : ''}`}
                  style={{ background: blade.preview }}
                />
                <span className={styles.bladeInfo}>
                  <strong>
                    {unlocked ? '' : '🔒 '}
                    {blade.name}
                    {blade.tier !== 'normal' && (
                      <span className={TIER_BADGE_CLASS[blade.tier]}>{TIER_LABEL[blade.tier]}</span>
                    )}
                  </strong>
                  <small>{unlocked ? blade.description : `해금 조건: ${condition}`}</small>
                </span>
                {selected && <span className={styles.equipped}>장착중</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

type QuestTab = 'blade' | 'theme';

function QuestList({ snapshot }: { snapshot: QuestSnapshot }) {
  const [tab, setTab] = useState<QuestTab>('blade');
  const bladeDone = QUESTS.filter((q) => snapshot.unlocked.has(q.reward)).length;
  const themeDone = THEME_QUESTS.filter((q) => snapshot.unlockedThemes.has(q.reward)).length;
  return (
    <>
      <h2 className={styles.panelTitle}>퀘스트</h2>
      <div className={styles.tabs} role="tablist" aria-label="퀘스트 종류">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'blade'}
          className={`${styles.tab} ${tab === 'blade' ? styles.tabOn : ''}`}
          onClick={() => setTab('blade')}
        >
          🗡️ 검 퀘스트{' '}
          <small>
            {bladeDone}/{QUESTS.length}
          </small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'theme'}
          className={`${styles.tab} ${tab === 'theme' ? styles.tabOn : ''}`}
          onClick={() => setTab('theme')}
        >
          🎨 테마 퀘스트{' '}
          <small>
            {themeDone}/{THEME_QUESTS.length}
          </small>
        </button>
      </div>
      <ul className={styles.questList} role="tabpanel">
        {tab === 'blade'
          ? QUESTS.map((quest) => {
              const reward = BLADES.find((b) => b.id === quest.reward);
              return (
                <QuestRow
                  key={quest.id}
                  quest={quest}
                  snapshot={snapshot}
                  done={snapshot.unlocked.has(quest.reward)}
                  rewardName={reward?.name ?? ''}
                  rewardPreview={reward?.preview ?? ''}
                  rewardTier={reward && reward.tier !== 'normal' ? TIER_LABEL[reward.tier] : ''}
                />
              );
            })
          : THEME_QUESTS.map((quest) => {
              const reward = THEMES.find((t) => t.id === quest.reward);
              return (
                <QuestRow
                  key={quest.id}
                  quest={quest}
                  snapshot={snapshot}
                  done={snapshot.unlockedThemes.has(quest.reward)}
                  rewardName={reward ? `${reward.name} 테마` : ''}
                  rewardPreview={reward?.preview ?? ''}
                  rewardTier={reward && reward.tier !== 'normal' ? TIER_LABEL[reward.tier] : ''}
                />
              );
            })}
      </ul>
    </>
  );
}

function QuestRow({
  quest,
  snapshot,
  done,
  rewardName,
  rewardPreview,
  rewardTier,
}: {
  quest: QuestDef<string>;
  snapshot: QuestSnapshot;
  done: boolean;
  rewardName: string;
  rewardPreview: string;
  rewardTier: string;
}) {
  const value = Math.min(quest.progress(snapshot.stats), quest.goal);
  const shown = done ? quest.goal : value;
  return (
    <li className={done ? styles.questDone : ''}>
      <div className={styles.questHead}>
        <strong>{quest.title}</strong>
        <span>
          {done ? '✅ 완료' : `${value.toLocaleString()} / ${quest.goal.toLocaleString()}`}
        </span>
      </div>
      <div
        className={styles.progress}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={quest.goal}
        aria-valuenow={shown}
      >
        <div style={{ width: `${(shown / quest.goal) * 100}%` }} />
      </div>
      <small className={styles.questReward}>
        <span className={styles.inlineSwatch} style={{ background: rewardPreview }} />
        보상: {rewardName}
        {rewardTier && ` (${rewardTier})`}
      </small>
    </li>
  );
}

/* ---------------- 배경 테마 선택 ---------------- */

function ThemeGallery({
  snapshot,
  onSelect,
}: {
  snapshot: QuestSnapshot;
  onSelect: (id: ThemeId) => void;
}) {
  return (
    <>
      <h2 className={styles.panelTitle}>배경 테마</h2>
      <p className={styles.panelText}>
        테마 퀘스트를 달성하면 새 배경이 열려요 ({snapshot.unlockedThemes.size}/{THEMES.length})
      </p>
      <ul className={styles.themeGrid}>
        {THEMES.map((theme) => (
          <li key={theme.id}>
            <ThemeCard
              theme={theme}
              snapshot={snapshot}
              selected={snapshot.selectedTheme === theme.id}
              unlocked={snapshot.unlockedThemes.has(theme.id)}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

const THEME_TIER_CLASS: Record<ThemeDef['tier'], string> = {
  normal: '',
  epic: styles.themeEpic ?? '',
  legend: styles.themeLegend ?? '',
};

function ThemeCard({
  theme,
  snapshot,
  selected,
  unlocked,
  onSelect,
}: {
  theme: ThemeDef;
  snapshot: QuestSnapshot;
  selected: boolean;
  unlocked: boolean;
  onSelect: (id: ThemeId) => void;
}) {
  const quest = THEME_QUESTS.find((q) => q.reward === theme.id);
  const value = quest ? Math.min(quest.progress(snapshot.stats), quest.goal) : 0;
  return (
    <button
      type="button"
      className={`${styles.themeCard} ${THEME_TIER_CLASS[theme.tier]} ${selected ? styles.themeSelected : ''}`}
      disabled={!unlocked}
      aria-pressed={selected}
      onClick={() => onSelect(theme.id)}
    >
      <span className={styles.themePreviewWrap}>
        <ThemePreview id={theme.id} />
        {!unlocked && <span className={styles.themeLock}>🔒</span>}
        {selected && <span className={styles.themeEquipped}>사용중</span>}
      </span>
      <span className={styles.themeInfo}>
        <strong>
          {theme.name}
          {theme.tier !== 'normal' && (
            <span className={TIER_BADGE_CLASS[theme.tier]}>{TIER_LABEL[theme.tier]}</span>
          )}
        </strong>
        {unlocked ? (
          <small>{theme.description}</small>
        ) : (
          <>
            <small>해금 조건: {quest?.title ?? '-'}</small>
            {quest && (
              <span className={styles.themeProgress} aria-hidden="true">
                <span style={{ width: `${(value / quest.goal) * 100}%` }} />
              </span>
            )}
          </>
        )}
      </span>
    </button>
  );
}

/** 테마 카드의 미리보기 — 실제 게임 배경과 같은 그리기 함수로 한 번만 그린다 */
function ThemePreview({ id }: { id: ThemeId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    // 게임과 같은 논리 높이(500)로 그리고 캔버스 크기에 맞춰 줄인다
    const scale = canvas.height / 500;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawThemeSnapshot(ctx, id, canvas.width / scale, 500);
  }, [id]);
  return <canvas ref={ref} width={320} height={200} className={styles.themePreview} aria-hidden />;
}

function HowToPlay() {
  return (
    <>
      <h2 className={styles.panelTitle}>게임 방법</h2>
      <ul className={styles.howto}>
        {HOW_TO_PLAY.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}

/* ---------------- 설정 / 일시정지 ---------------- */

type PendingAction = 'restart' | 'home' | null;

function SettingsPanel({
  settings,
  inGame,
  onChange,
  onPreviewSfx,
  onClose,
  onRestart,
  onHome,
}: {
  settings: GameSettings;
  /** 게임 도중 열었으면 true (일시정지 화면) */
  inGame: boolean;
  onChange: (patch: Partial<GameSettings>) => void;
  onPreviewSfx: () => void;
  onClose: () => void;
  onRestart: () => void;
  onHome: () => void;
}) {
  // 다시 시작·홈으로는 진행 중인 판이 사라지므로 한 번 더 확인한다
  const [pending, setPending] = useState<PendingAction>(null);
  const soundOff = settings.muted;

  return (
    <>
      <h2 id="fruit-slicer-settings-title" className={styles.panelTitle}>
        {inGame ? '⏸ 일시정지' : '⚙️ 설정'}
      </h2>

      <div className={styles.settingsBody}>
        <section className={styles.settingsSound} aria-label="사운드 설정">
          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>사운드</span>
            <button
              type="button"
              className={`${styles.toggle} ${soundOff ? '' : styles.toggleOn}`}
              aria-pressed={!soundOff}
              onClick={() => onChange({ muted: !soundOff })}
            >
              {soundOff ? '🔇 꺼짐' : '🔊 켜짐'}
            </button>
          </div>

          <label className={styles.settingRow}>
            <span className={styles.settingLabel}>효과음</span>
            <input
              type="range"
              className={styles.range}
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.sfxVolume * 100)}
              disabled={soundOff}
              onChange={(e) => onChange({ sfxVolume: Number(e.target.value) / 100 })}
              onPointerUp={onPreviewSfx}
              onKeyUp={onPreviewSfx}
            />
            <span className={styles.settingValue}>{Math.round(settings.sfxVolume * 100)}</span>
          </label>

          <label className={styles.settingRow}>
            <span className={styles.settingLabel}>배경음악</span>
            <input
              type="range"
              className={styles.range}
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.bgmVolume * 100)}
              disabled={soundOff}
              onChange={(e) => onChange({ bgmVolume: Number(e.target.value) / 100 })}
            />
            <span className={styles.settingValue}>{Math.round(settings.bgmVolume * 100)}</span>
          </label>
        </section>

        <section className={styles.settingsBrightness} aria-label="밝기 설정">
          <span className={styles.settingLabel}>밝기</span>
          <span aria-hidden="true">☀️</span>
          <VerticalSlider
            label="화면 밝기"
            value={settings.brightness}
            min={BRIGHTNESS_MIN}
            max={BRIGHTNESS_MAX}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(brightness) => onChange({ brightness })}
          />
          <span aria-hidden="true">🌙</span>
          <span className={styles.settingValue}>{Math.round(settings.brightness * 100)}%</span>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => onChange({ brightness: 1 })}
            disabled={settings.brightness === 1}
          >
            기본값
          </button>
        </section>
      </div>

      {pending ? (
        <div className={styles.confirm} role="alertdialog" aria-live="assertive">
          <p className={styles.panelText}>
            진행 중인 게임은 기록되지 않아요.{' '}
            {pending === 'home' ? '과일 슬라이서 홈으로 갈까요?' : '처음부터 다시 할까요?'}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-primary"
              autoFocus
              onClick={pending === 'home' ? onHome : onRestart}
            >
              {pending === 'home' ? '홈으로 이동' : '다시 시작'}
            </button>
            <button type="button" className="btn" onClick={() => setPending(null)}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" className="btn btn-primary" autoFocus onClick={onClose}>
            {inGame ? '▶ 계속하기' : '닫기'}
          </button>
          {inGame && (
            <>
              <button type="button" className="btn" onClick={() => setPending('restart')}>
                ↻ 다시 시작
              </button>
              <button type="button" className="btn" onClick={() => setPending('home')}>
                🏠 홈으로
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

/**
 * 세로 슬라이더 — 위로 올리면 값이 커지고 내리면 작아진다.
 * 브라우저마다 다른 세로 input[type=range] 대신 직접 만들어 마우스·터치·키보드 모두 같게 동작한다.
 */
function VerticalSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const ratio = (value - min) / (max - min);

  const snap = (v: number) => {
    const stepped = Math.round((v - min) / step) * step + min;
    // 부동소수 오차 정리 (예: 1.0000000002)
    return Math.min(max, Math.max(min, Number(stepped.toFixed(4))));
  };

  function valueAt(clientY: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return value;
    const r = 1 - (clientY - rect.top) / rect.height; // 위쪽일수록 1
    return snap(min + Math.min(1, Math.max(0, r)) * (max - min));
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    setDragging(true);
    onChange(valueAt(e.clientY));
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    onChange(valueAt(e.clientY));
  }

  function handlePointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const big = step * 5;
    const next: Record<string, number> = {
      ArrowUp: value + step,
      ArrowRight: value + step,
      ArrowDown: value - step,
      ArrowLeft: value - step,
      PageUp: value + big,
      PageDown: value - big,
      Home: min,
      End: max,
    };
    const target = next[e.key];
    if (target === undefined) return;
    e.preventDefault();
    onChange(snap(target));
  }

  return (
    <div
      ref={trackRef}
      className={`${styles.vSlider} ${dragging ? styles.vSliderActive : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.vSliderFill} style={{ height: `${ratio * 100}%` }} />
      <div className={styles.vSliderThumb} style={{ bottom: `${ratio * 100}%` }} />
    </div>
  );
}

/* ---------------- 게임 오버: 이름 입력 → 서버 랭킹 등록 ---------------- */

/** 공통 결과창과 같은 키를 써서 한 번 입력한 닉네임을 다른 게임에서도 채워 준다 */
const NICKNAME_STORAGE_KEY = 'simsim:nickname';

function loadNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveNickname(nickname: string) {
  try {
    localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
  } catch {
    // 저장 실패는 무시
  }
}

function NameEntry({
  score,
  isBest,
  onDone,
}: {
  score: number;
  isBest: boolean;
  onDone: (submitted: SubmitScoreResponse | null) => void;
}) {
  const [nickname, setNickname] = useState(loadNickname);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError('이름을 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.submitScore(GAME_ID, { nickname: trimmed, score });
      saveNickname(trimmed);
      onDone(result);
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <>
      <p className={styles.gameOver}>GAME OVER</p>
      <p className={styles.finalScore}>
        <strong>{score}</strong>점
      </p>
      {isBest && <p className={styles.newBest}>🎉 내 최고 기록 달성!</p>}
      <form className={styles.nameForm} onSubmit={handleSubmit}>
        <label htmlFor="fruit-slicer-name" className={styles.panelText}>
          랭킹에 올릴 이름을 입력하세요
        </label>
        <div className={styles.nameRow}>
          <input
            id="fruit-slicer-name"
            className={styles.input}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder={`이름 (최대 ${NICKNAME_MAX_LENGTH}자)`}
            autoComplete="nickname"
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '등록 중…' : '등록'}
          </button>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>
      <button type="button" className={styles.linkButton} onClick={() => onDone(null)}>
        등록하지 않고 랭킹 보기
      </button>
    </>
  );
}

/* ---------------- TOP 5 랭킹 (서버 — 모든 기기에서 같은 순위) ---------------- */

const MEDALS = ['🥇', '🥈', '🥉'];

/** 서버의 UTC 'YYYY-MM-DD HH:MM:SS' → 보는 사람 기준 날짜 */
function formatDate(createdAt: string): string {
  const date = new Date(`${createdAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return createdAt.slice(0, 10);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function RankingBoard({
  score,
  submitted,
}: {
  score: number | null;
  submitted: SubmitScoreResponse | null;
}) {
  const ranking = useFetch(`${GAME_ID}-top-${submitted?.id ?? 'view'}`, () =>
    api.getRanking(GAME_ID, RANKING_SIZE),
  );

  return (
    <>
      <h2 className={styles.panelTitle}>🏆 랭킹 TOP {RANKING_SIZE}</h2>
      {score !== null && (
        <p className={styles.panelText}>
          이번 점수 <strong>{score}점</strong>
          {submitted && ` · 전체 ${submitted.rank}위`}
        </p>
      )}
      <p className={styles.championHint}>
        👑 TOP {CHAMPION_RANK} 안에 들면 랭커 전용 검 「여명의 검」을 쓸 수 있어요
      </p>
      {ranking.status === 'loading' && <p className={styles.panelText}>랭킹을 불러오는 중…</p>}
      {ranking.status === 'error' && (
        <p className={styles.error}>랭킹을 불러오지 못했어요. ({ranking.error})</p>
      )}
      {ranking.status === 'success' &&
        (ranking.data.items.length === 0 ? (
          <p className={styles.panelText}>아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</p>
        ) : (
          <table className={styles.rankTable}>
            <thead>
              <tr>
                <th scope="col">순위</th>
                <th scope="col">이름</th>
                <th scope="col">점수</th>
                <th scope="col">날짜</th>
              </tr>
            </thead>
            <tbody>
              {ranking.data.items.map((entry) => (
                <tr key={entry.id} className={entry.id === submitted?.id ? styles.mine : ''}>
                  <td>{MEDALS[entry.rank - 1] ?? entry.rank}</td>
                  <td className={styles.rankName}>{entry.nickname}</td>
                  <td>{entry.score}</td>
                  <td>{formatDate(entry.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </>
  );
}
