import {
  BLADES,
  CHAMPION_BLADE_ID,
  DEFAULT_THEME,
  QUESTS,
  THEMES,
  THEME_QUESTS,
  type BladeDef,
  type BladeId,
  type PlayerStats,
  type ThemeDef,
  type ThemeId,
} from './config';

const STORAGE_KEY = 'simsim:fruit-slicer:v1';

interface SaveData {
  stats: PlayerStats;
  unlocked: BladeId[];
  selected: BladeId;
  unlockedThemes: ThemeId[];
  selectedTheme: ThemeId;
}

/** 메뉴 화면이 그리는 데이터 (읽기 전용 복사본) */
export interface QuestSnapshot {
  stats: PlayerStats;
  unlocked: ReadonlySet<BladeId>;
  selected: BladeId;
  unlockedThemes: ReadonlySet<ThemeId>;
  selectedTheme: ThemeId;
}

/** 퀘스트를 달성해 새로 열린 것 — 해금 알림에 쓴다 */
export type Unlock = { kind: 'blade'; def: BladeDef } | { kind: 'theme'; def: ThemeDef };

const BLADE_IDS = new Set<string>(BLADES.map((b) => b.id));
const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

function isBladeId(v: unknown): v is BladeId {
  return typeof v === 'string' && BLADE_IDS.has(v);
}

function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && THEME_IDS.has(v);
}

function toCount(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function defaultSave(): SaveData {
  return {
    stats: {
      totalSliced: 0,
      bestSwipe: 0,
      highScore: 0,
      maxCombo: 0,
      totalFevers: 0,
      gamesPlayed: 0,
      totalScore: 0,
      bombsDefused: 0,
    },
    unlocked: ['basic'],
    selected: 'basic',
    unlockedThemes: [DEFAULT_THEME],
    selectedTheme: DEFAULT_THEME,
  };
}

/** localStorage 값이 깨져 있어도 안전하게 복구한다 */
function load(): SaveData {
  const data = defaultSave();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return data;
    const parsed = JSON.parse(raw) as Partial<Record<keyof SaveData, unknown>>;
    const stats = (parsed.stats ?? {}) as Partial<Record<keyof PlayerStats, unknown>>;
    data.stats = {
      totalSliced: toCount(stats.totalSliced),
      bestSwipe: toCount(stats.bestSwipe),
      highScore: toCount(stats.highScore),
      // 콤보 기준이 바뀌어 예전 콤보 기록(totalCombos, bestCombo)은 쓰지 않고 새 키로 0 부터 시작
      maxCombo: toCount(stats.maxCombo),
      totalFevers: toCount(stats.totalFevers),
      // 테마 퀘스트용 기록 — 예전 저장 데이터에는 없으므로 0 부터 시작
      gamesPlayed: toCount(stats.gamesPlayed),
      totalScore: toCount(stats.totalScore),
      bombsDefused: toCount(stats.bombsDefused),
    };
    if (Array.isArray(parsed.unlocked)) {
      data.unlocked = [
        'basic',
        // 랭커 전용 검은 저장하지 않는다 — 매번 서버 랭킹으로 확인한다
        ...parsed.unlocked
          .filter(isBladeId)
          .filter((id) => id !== 'basic' && id !== CHAMPION_BLADE_ID),
      ];
    }
    // 랭커 전용 검은 선택 기록만 남겨 두고, 랭킹 확인이 끝나면 다시 장착된다
    if (
      isBladeId(parsed.selected) &&
      (data.unlocked.includes(parsed.selected) || parsed.selected === CHAMPION_BLADE_ID)
    ) {
      data.selected = parsed.selected;
    }
    if (Array.isArray(parsed.unlockedThemes)) {
      data.unlockedThemes = [
        DEFAULT_THEME,
        ...new Set(parsed.unlockedThemes.filter(isThemeId).filter((id) => id !== DEFAULT_THEME)),
      ];
    }
    if (isThemeId(parsed.selectedTheme) && data.unlockedThemes.includes(parsed.selectedTheme)) {
      data.selectedTheme = parsed.selectedTheme;
    }
  } catch {
    // 저장소 접근 불가(시크릿 모드 등)나 JSON 오류면 기본값으로 시작
  }
  return data;
}

/* =========================================================
 * QuestManager — 누적 기록, 퀘스트 달성 판정, 검·테마 해금/선택 저장
 * ========================================================= */
export class QuestManager {
  private data: SaveData = load();
  /** 서버 랭킹 TOP 3 안에 내 닉네임이 있는지 (저장하지 않음 — 매번 확인) */
  private champion = false;

  constructor() {
    // 퀘스트 목록이 늘어나기 전에 이미 조건을 채운 기록이 있으면 바로 열어 준다 (알림 없이)
    this.checkUnlocks();
  }

  /** 실제로 장착되는 검 — 고른 검이 잠겨 있으면 마지막으로 해금한 검을 대신 쓴다 */
  get selected(): BladeId {
    if (this.isUnlocked(this.data.selected)) return this.data.selected;
    return this.data.unlocked[this.data.unlocked.length - 1] ?? 'basic';
  }

  get selectedTheme(): ThemeId {
    return this.data.selectedTheme;
  }

  get highScore(): number {
    return this.data.stats.highScore;
  }

  snapshot(): QuestSnapshot {
    return {
      stats: { ...this.data.stats },
      unlocked: new Set(
        this.champion ? [...this.data.unlocked, CHAMPION_BLADE_ID] : this.data.unlocked,
      ),
      selected: this.selected,
      unlockedThemes: new Set(this.data.unlockedThemes),
      selectedTheme: this.data.selectedTheme,
    };
  }

  isUnlocked(id: BladeId): boolean {
    if (id === CHAMPION_BLADE_ID) return this.champion;
    return this.data.unlocked.includes(id);
  }

  isThemeUnlocked(id: ThemeId): boolean {
    return this.data.unlockedThemes.includes(id);
  }

  /** 랭킹 확인 결과를 반영한다. 이번에 새로 자격을 얻었으면 true */
  setChampion(eligible: boolean): boolean {
    const gained = eligible && !this.champion;
    this.champion = eligible;
    return gained;
  }

  /** 해금된 검만 선택할 수 있다. 선택하면 바로 저장한다. */
  select(id: BladeId): boolean {
    if (!this.isUnlocked(id)) return false;
    this.data.selected = id;
    this.save();
    return true;
  }

  /** 해금된 테마만 고를 수 있다. 고르면 바로 저장한다. */
  selectTheme(id: ThemeId): boolean {
    if (!this.isThemeUnlocked(id)) return false;
    this.data.selectedTheme = id;
    this.save();
    return true;
  }

  /** 과일을 벨 때마다 호출 */
  recordSlice(): Unlock[] {
    this.data.stats.totalSliced += 1;
    return this.checkUnlocks();
  }

  /** 현재 콤보 — 최고 기록을 넘을 때만 갱신한다 */
  recordCombo(combo: number): Unlock[] {
    if (combo <= this.data.stats.maxCombo) return [];
    this.data.stats.maxCombo = combo;
    return this.checkUnlocks();
  }

  /** 피버 타임이 발동할 때마다 호출 */
  recordFever(): Unlock[] {
    this.data.stats.totalFevers += 1;
    return this.checkUnlocks();
  }

  /** 피버 타임 중 폭탄을 벨 때마다 호출 */
  recordDefuse(): Unlock[] {
    this.data.stats.bombsDefused += 1;
    return this.checkUnlocks();
  }

  /** 한 번의 스와이프에서 벤 과일 수 */
  recordSwipe(count: number): Unlock[] {
    if (count <= this.data.stats.bestSwipe) return [];
    this.data.stats.bestSwipe = count;
    return this.checkUnlocks();
  }

  recordScore(score: number): Unlock[] {
    if (score <= this.data.stats.highScore) return [];
    this.data.stats.highScore = score;
    return this.checkUnlocks();
  }

  /** 한 판을 끝까지 마쳤을 때 (판 수 · 누적 점수) */
  recordGameEnd(score: number): Unlock[] {
    this.data.stats.gamesPlayed += 1;
    this.data.stats.totalScore += score;
    return [...this.recordScore(score), ...this.checkUnlocks()];
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // 저장 실패는 무시 (다음 저장 때 다시 시도)
    }
  }

  /** 새로 달성한 퀘스트의 보상(검·테마)을 해금하고 목록을 돌려준다 */
  private checkUnlocks(): Unlock[] {
    const newly: Unlock[] = [];
    const stats = this.data.stats;
    for (const quest of QUESTS) {
      if (this.isUnlocked(quest.reward)) continue;
      if (quest.progress(stats) < quest.goal) continue;
      this.data.unlocked.push(quest.reward);
      const def = BLADES.find((b) => b.id === quest.reward);
      if (def) newly.push({ kind: 'blade', def });
    }
    for (const quest of THEME_QUESTS) {
      if (this.isThemeUnlocked(quest.reward)) continue;
      if (quest.progress(stats) < quest.goal) continue;
      this.data.unlockedThemes.push(quest.reward);
      const def = THEMES.find((t) => t.id === quest.reward);
      if (def) newly.push({ kind: 'theme', def });
    }
    if (newly.length > 0) this.save();
    return newly;
  }
}
