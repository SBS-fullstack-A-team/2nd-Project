import {
  BLADES,
  CHAMPION_BLADE_ID,
  QUESTS,
  type BladeDef,
  type BladeId,
  type PlayerStats,
} from './config';

const STORAGE_KEY = 'simsim:fruit-slicer:v1';

interface SaveData {
  stats: PlayerStats;
  unlocked: BladeId[];
  selected: BladeId;
}

/** 메뉴 화면이 그리는 데이터 (읽기 전용 복사본) */
export interface QuestSnapshot {
  stats: PlayerStats;
  unlocked: ReadonlySet<BladeId>;
  selected: BladeId;
}

const BLADE_IDS = new Set<string>(BLADES.map((b) => b.id));

function isBladeId(v: unknown): v is BladeId {
  return typeof v === 'string' && BLADE_IDS.has(v);
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
    },
    unlocked: ['basic'],
    selected: 'basic',
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
  } catch {
    // 저장소 접근 불가(시크릿 모드 등)나 JSON 오류면 기본값으로 시작
  }
  return data;
}

/* =========================================================
 * QuestManager — 누적 기록, 퀘스트 달성 판정, 검 해금/선택 저장
 * ========================================================= */
export class QuestManager {
  private data: SaveData = load();
  /** 서버 랭킹 TOP 3 안에 내 닉네임이 있는지 (저장하지 않음 — 매번 확인) */
  private champion = false;

  /** 실제로 장착되는 검 — 고른 검이 잠겨 있으면 마지막으로 해금한 검을 대신 쓴다 */
  get selected(): BladeId {
    if (this.isUnlocked(this.data.selected)) return this.data.selected;
    return this.data.unlocked[this.data.unlocked.length - 1] ?? 'basic';
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
    };
  }

  isUnlocked(id: BladeId): boolean {
    if (id === CHAMPION_BLADE_ID) return this.champion;
    return this.data.unlocked.includes(id);
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

  /** 과일을 벨 때마다 호출 */
  recordSlice(): BladeDef[] {
    this.data.stats.totalSliced += 1;
    return this.checkUnlocks();
  }

  /** 현재 콤보 — 최고 기록을 넘을 때만 갱신한다 */
  recordCombo(combo: number): BladeDef[] {
    if (combo <= this.data.stats.maxCombo) return [];
    this.data.stats.maxCombo = combo;
    return this.checkUnlocks();
  }

  /** 피버 타임이 발동할 때마다 호출 */
  recordFever(): BladeDef[] {
    this.data.stats.totalFevers += 1;
    return this.checkUnlocks();
  }

  /** 한 번의 스와이프에서 벤 과일 수 */
  recordSwipe(count: number): BladeDef[] {
    if (count <= this.data.stats.bestSwipe) return [];
    this.data.stats.bestSwipe = count;
    return this.checkUnlocks();
  }

  recordScore(score: number): BladeDef[] {
    if (score <= this.data.stats.highScore) return [];
    this.data.stats.highScore = score;
    return this.checkUnlocks();
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // 저장 실패는 무시 (다음 저장 때 다시 시도)
    }
  }

  /** 새로 달성한 퀘스트의 보상 검을 해금하고 목록을 돌려준다 */
  private checkUnlocks(): BladeDef[] {
    const newly: BladeDef[] = [];
    for (const quest of QUESTS) {
      if (this.isUnlocked(quest.reward)) continue;
      if (quest.progress(this.data.stats) < quest.goal) continue;
      this.data.unlocked.push(quest.reward);
      const blade = BLADES.find((b) => b.id === quest.reward);
      if (blade) newly.push(blade);
    }
    if (newly.length > 0) this.save();
    return newly;
  }
}
