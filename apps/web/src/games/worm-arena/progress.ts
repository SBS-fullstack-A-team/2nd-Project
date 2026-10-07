/**
 * 지렁이 아레나 성장 기록 — 레벨·경험치, 업적(스킨 해금), 모자, 오늘의 미션, 누적 기록.
 * 브라우저(localStorage)에만 저장한다. 랭킹 점수(최고 길이)에는 영향이 없다.
 */
import { SKINS } from './config';
import type { Summary } from './engine';

const STORE_KEY = 'worm-arena:profile:v1';

/* ---------- 누적 기록 ---------- */

export interface Lifetime {
  games: number;
  kills: number;
  food: number;
  golden: number;
  powerups: number;
  bestLength: number;
  bestSeconds: number;
  bestKills: number;
  bestStreak: number;
  /** 오늘의 미션 3개를 모두 깬 날 수 */
  missionDays: number;
  /** 1위를 찍어 본 판 수 */
  firstPlaces: number;
  /** 잡은 현상금 지렁이 수 */
  bounties: number;
}

/** 한 판 기록 — 업적·미션 조건이 보는 값 */
interface Run {
  length: number;
  kills: number;
  seconds: number;
  food: number;
  golden: number;
  powerups: number;
  dashKills: number;
  maxStreak: number;
  rank1: boolean;
  bounties: number;
}

function toRun(s: Summary): Run {
  return {
    length: s.length,
    kills: s.kills,
    seconds: s.seconds,
    food: s.run.food,
    golden: s.run.golden,
    powerups: s.run.powerups,
    dashKills: s.run.dashKills,
    maxStreak: s.run.maxStreak,
    rank1: s.bestRank === 1,
    bounties: s.run.bounties,
  };
}

/* ---------- 업적 — 깨면 스킨이나 모자가 열린다 ---------- */

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  /** 해금 조건 설명 */
  goal: string;
  /** 보상 — 스킨 id 또는 모자 id */
  reward: { skin?: string; hat?: string };
  /** 진행도 (현재, 목표) — 누적 기록과 이번 판으로 계산 */
  progress: (life: Lifetime) => [number, number];
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'len300',
    icon: '📏',
    title: '쑥쑥 자람',
    goal: '한 판에 길이 300',
    reward: { skin: 'sky' },
    progress: (l) => [l.bestLength, 300],
  },
  {
    id: 'kill3',
    icon: '💥',
    title: '사냥꾼',
    goal: '한 판에 3마리 쓰러뜨리기',
    reward: { skin: 'sunset' },
    progress: (l) => [l.bestKills, 3],
  },
  {
    id: 'power20',
    icon: '🧲',
    title: '아이템 수집가',
    goal: '파워업 누적 20개',
    reward: { skin: 'grape' },
    progress: (l) => [l.powerups, 20],
  },
  {
    id: 'survive120',
    icon: '⏱️',
    title: '끈질긴 지렁이',
    goal: '한 판에 2분 버티기',
    reward: { skin: 'zebra' },
    progress: (l) => [l.bestSeconds, 120],
  },
  {
    id: 'triple',
    icon: '🔥',
    title: '트리플 킬',
    goal: '연속 킬 3번',
    reward: { skin: 'rainbow' },
    progress: (l) => [l.bestStreak, 3],
  },
  {
    id: 'golden100',
    icon: '✨',
    title: '황금 미식가',
    goal: '황금 먹이 누적 100개',
    reward: { skin: 'gold' },
    progress: (l) => [l.golden, 100],
  },
  {
    id: 'first',
    icon: '🏆',
    title: '아레나의 왕',
    goal: '길이 순위 1위 찍기',
    reward: { hat: 'crown' },
    progress: (l) => [l.firstPlaces, 1],
  },
  {
    id: 'len1000',
    icon: '🐉',
    title: '전설의 지렁이',
    goal: '한 판에 길이 1000',
    reward: { hat: 'dragon' },
    progress: (l) => [l.bestLength, 1000],
  },
  {
    id: 'kills100',
    icon: '⚔️',
    title: '백전노장',
    goal: '누적 100마리 쓰러뜨리기',
    reward: { hat: 'helmet' },
    progress: (l) => [l.kills, 100],
  },
  {
    id: 'bounty5',
    icon: '👑',
    title: '현상금 사냥꾼',
    goal: '현상금 지렁이 누적 5마리',
    reward: { hat: 'cowboy' },
    progress: (l) => [l.bounties, 5],
  },
  {
    id: 'days3',
    icon: '📅',
    title: '성실한 지렁이',
    goal: '오늘의 미션 3일 완료',
    reward: { hat: 'halo' },
    progress: (l) => [l.missionDays, 3],
  },
];

/** 처음부터 열려 있는 스킨 */
const FREE_SKINS = ['pink', 'lime'];

/* ---------- 모자 — 레벨이나 업적으로 연다 ---------- */

export interface Hat {
  id: string;
  label: string;
  /** 머리 위에 그릴 이모지 (없음은 빈 문자열) */
  icon: string;
  /** 이 레벨이 되면 열린다 (업적 보상 모자는 없음) */
  level?: number;
}

export const HATS: readonly Hat[] = [
  { id: 'none', label: '없음', icon: '', level: 1 },
  { id: 'ribbon', label: '리본', icon: '🎀', level: 2 },
  { id: 'cap', label: '야구모자', icon: '🧢', level: 4 },
  { id: 'flower', label: '꽃', icon: '🌸', level: 6 },
  { id: 'tophat', label: '신사 모자', icon: '🎩', level: 8 },
  { id: 'party', label: '고깔', icon: '🥳', level: 10 },
  { id: 'crown', label: '왕관', icon: '👑' },
  { id: 'dragon', label: '용', icon: '🐲' },
  { id: 'helmet', label: '투구', icon: '⛑️' },
  { id: 'halo', label: '천사 고리', icon: '😇' },
  { id: 'cowboy', label: '카우보이 모자', icon: '🤠' },
];

/* ---------- 레벨 ---------- */

/** 레벨 n → n+1 에 필요한 경험치 */
function xpForLevel(level: number): number {
  return 100 + (level - 1) * 60;
}

export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = xp;
  while (left >= xpForLevel(level)) {
    left -= xpForLevel(level);
    level += 1;
  }
  return { level, into: left, need: xpForLevel(level) };
}

/** 한 판 경험치 — 길이 · 킬 · 버틴 시간 */
function runXp(r: Run): number {
  return Math.floor(r.length / 5) + r.kills * 15 + r.bounties * 40 + Math.floor(r.seconds / 3);
}

/* ---------- 오늘의 미션 ---------- */

interface MissionTemplate {
  id: string;
  /** {n} 자리에 목표 수 */
  text: string;
  target: number;
  /** 'sum' 은 여러 판 누적, 'best' 는 한 판 최고 */
  mode: 'sum' | 'best';
  value: (r: Run) => number;
}

const MISSION_POOL: readonly MissionTemplate[] = [
  { id: 'food', text: '먹이 {n}개 먹기', target: 300, mode: 'sum', value: (r) => r.food },
  { id: 'kills', text: '지렁이 {n}마리 쓰러뜨리기', target: 5, mode: 'sum', value: (r) => r.kills },
  { id: 'len', text: '한 판에 길이 {n} 달성', target: 400, mode: 'best', value: (r) => r.length },
  { id: 'time', text: '한 판에 {n}초 버티기', target: 90, mode: 'best', value: (r) => r.seconds },
  { id: 'golden', text: '황금 먹이 {n}개 먹기', target: 20, mode: 'sum', value: (r) => r.golden },
  { id: 'power', text: '파워업 {n}개 먹기', target: 5, mode: 'sum', value: (r) => r.powerups },
  {
    id: 'dash',
    text: '대시 중에 {n}마리 쓰러뜨리기',
    target: 2,
    mode: 'sum',
    value: (r) => r.dashKills,
  },
  {
    id: 'streak',
    text: '더블 킬 이상 {n}번 (한 판)',
    target: 1,
    mode: 'best',
    value: (r) => (r.maxStreak >= 2 ? 1 : 0),
  },
  {
    id: 'bounty',
    text: '현상금 지렁이 {n}마리 잡기',
    target: 1,
    mode: 'sum',
    value: (r) => r.bounties,
  },
  { id: 'games', text: '{n}판 하기', target: 3, mode: 'sum', value: () => 1 },
  {
    id: 'rank1',
    text: '길이 순위 1위 {n}번 찍기',
    target: 1,
    mode: 'sum',
    value: (r) => (r.rank1 ? 1 : 0),
  },
];

/** 미션 하나 깰 때 · 세 개 다 깰 때 경험치 */
export const MISSION_XP = 80;
export const MISSION_ALL_XP = 200;

export interface Mission {
  id: string;
  text: string;
  target: number;
  progress: number;
  done: boolean;
}

/** 오늘 날짜 (사용자 시간대 기준 YYYY-MM-DD) */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 날짜로 정해지는 미션 3개 — 같은 날에는 누구나 같은 미션 */
function missionsFor(date: string): Mission[] {
  let seed = 0;
  for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = [...MISSION_POOL];
  const picked: MissionTemplate[] = [];
  while (picked.length < 3) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    picked.push(pool.splice(seed % pool.length, 1)[0]!);
  }
  return picked.map((m) => ({
    id: m.id,
    text: m.text.replace('{n}', String(m.target)),
    target: m.target,
    progress: 0,
    done: false,
  }));
}

/* ---------- 프로필 ---------- */

export interface Profile {
  xp: number;
  life: Lifetime;
  /** 깬 업적 id */
  achievements: string[];
  daily: { date: string; missions: Mission[]; allDone: boolean };
  skin: string;
  hat: string;
}

function emptyProfile(): Profile {
  return {
    xp: 0,
    life: {
      games: 0,
      kills: 0,
      food: 0,
      golden: 0,
      powerups: 0,
      bestLength: 0,
      bestSeconds: 0,
      bestKills: 0,
      bestStreak: 0,
      missionDays: 0,
      firstPlaces: 0,
      bounties: 0,
    },
    achievements: [],
    daily: { date: today(), missions: missionsFor(today()), allDone: false },
    skin: 'pink',
    hat: 'none',
  };
}

/** 저장된 기록 불러오기 — 날짜가 바뀌었으면 새 미션 */
export function loadProfile(): Profile {
  const base = emptyProfile();
  let p = base;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Profile>;
      p = {
        ...base,
        ...saved,
        life: { ...base.life, ...saved.life },
        achievements: saved.achievements ?? [],
        daily: saved.daily ?? base.daily,
      };
    }
  } catch {
    // 못 읽으면 처음부터
  }
  if (p.daily.date !== today()) {
    p.daily = { date: today(), missions: missionsFor(today()), allDone: false };
  }
  return p;
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    // 저장 못 해도 이번에는 화면에 반영된다
  }
}

export function unlockedSkins(p: Profile): Set<string> {
  const set = new Set(FREE_SKINS);
  for (const a of ACHIEVEMENTS)
    if (p.achievements.includes(a.id) && a.reward.skin) set.add(a.reward.skin);
  return set;
}

export function unlockedHats(p: Profile): Set<string> {
  const { level } = levelOf(p.xp);
  const set = new Set<string>();
  for (const h of HATS) if (h.level !== undefined && level >= h.level) set.add(h.id);
  for (const a of ACHIEVEMENTS)
    if (p.achievements.includes(a.id) && a.reward.hat) set.add(a.reward.hat);
  return set;
}

/** 잠긴 스킨의 해금 조건 */
export function skinGoal(skinId: string): string | null {
  return ACHIEVEMENTS.find((a) => a.reward.skin === skinId)?.goal ?? null;
}

export function hatGoal(hat: Hat): string {
  if (hat.level !== undefined) return `레벨 ${hat.level}`;
  return ACHIEVEMENTS.find((a) => a.reward.hat === hat.id)?.goal ?? '';
}

/* ---------- 판이 끝났을 때 ---------- */

export interface RunReport {
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  /** 이번 판으로 새로 깬 업적 */
  newAchievements: Achievement[];
  /** 이번 판으로 새로 깬 미션 */
  missionsDone: Mission[];
  allMissionsDone: boolean;
  newBestLength: boolean;
  /** 이전 최고 길이 (이번 판 전) */
  prevBestLength: number;
  /** 가장 가까운 다음 업적 (진행도 큰 순) */
  nextGoal: { achievement: Achievement; current: number; target: number } | null;
}

/** 한 판 결과를 기록에 반영한다 — 새 프로필과 결과 보고를 돌려준다 */
export function applyRun(prev: Profile, summary: Summary): { profile: Profile; report: RunReport } {
  const run = toRun(summary);
  const p: Profile = structuredClone(prev);
  if (p.daily.date !== today()) {
    p.daily = { date: today(), missions: missionsFor(today()), allDone: false };
  }
  const levelBefore = levelOf(p.xp).level;
  const prevBestLength = p.life.bestLength;

  // 누적 기록
  const l = p.life;
  l.games += 1;
  l.kills += run.kills;
  l.food += run.food;
  l.golden += run.golden;
  l.powerups += run.powerups;
  l.bestLength = Math.max(l.bestLength, run.length);
  l.bestSeconds = Math.max(l.bestSeconds, run.seconds);
  l.bestKills = Math.max(l.bestKills, run.kills);
  l.bestStreak = Math.max(l.bestStreak, run.maxStreak);
  if (run.rank1) l.firstPlaces += 1;
  l.bounties += run.bounties;

  // 오늘의 미션
  let xp = runXp(run);
  const missionsDone: Mission[] = [];
  for (const m of p.daily.missions) {
    if (m.done) continue;
    const tpl = MISSION_POOL.find((t) => t.id === m.id);
    if (!tpl) continue;
    const v = tpl.value(run);
    m.progress = tpl.mode === 'sum' ? m.progress + v : Math.max(m.progress, v);
    if (m.progress >= m.target) {
      m.progress = m.target;
      m.done = true;
      missionsDone.push({ ...m });
      xp += MISSION_XP;
    }
  }
  let allMissionsDone = false;
  if (!p.daily.allDone && p.daily.missions.every((m) => m.done)) {
    p.daily.allDone = true;
    allMissionsDone = true;
    l.missionDays += 1;
    xp += MISSION_ALL_XP;
  }
  p.xp += xp;

  // 업적
  const newAchievements: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements.includes(a.id)) continue;
    const [cur, target] = a.progress(l);
    if (cur >= target) {
      p.achievements.push(a.id);
      newAchievements.push(a);
    }
  }

  // 다음 목표 — 아직 못 깬 업적 중 가장 가까운 것
  let nextGoal: RunReport['nextGoal'] = null;
  let bestRatio = -1;
  for (const a of ACHIEVEMENTS) {
    if (p.achievements.includes(a.id)) continue;
    const [cur, target] = a.progress(l);
    const ratio = cur / target;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      nextGoal = { achievement: a, current: cur, target };
    }
  }

  return {
    profile: p,
    report: {
      xpGained: xp,
      levelBefore,
      levelAfter: levelOf(p.xp).level,
      newAchievements,
      missionsDone,
      allMissionsDone,
      newBestLength: run.length > prevBestLength && prevBestLength > 0,
      prevBestLength,
      nextGoal,
    },
  };
}

/** 스킨 · 모자 이름 찾기 */
export function skinLabel(id: string): string {
  return SKINS.find((s) => s.id === id)?.label ?? id;
}

export function hatOf(id: string): Hat {
  return HATS.find((h) => h.id === id) ?? HATS[0]!;
}
