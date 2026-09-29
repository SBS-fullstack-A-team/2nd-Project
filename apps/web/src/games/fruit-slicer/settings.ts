import { DEFAULT_SOUND, type SoundSettings } from './SoundManager';

/** 게임 설정 (localStorage 에 저장) */
export interface GameSettings extends SoundSettings {
  /** 화면 밝기 배율 (1 = 기본) */
  brightness: number;
}

export const BRIGHTNESS_MIN = 0.5;
export const BRIGHTNESS_MAX = 1.5;

export const DEFAULT_SETTINGS: GameSettings = { ...DEFAULT_SOUND, brightness: 1 };

const STORAGE_KEY = 'simsim:fruit-slicer:settings:v1';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;
}

/** 저장값이 깨져 있거나 범위를 벗어나도 안전한 값으로 복구한다 */
export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<Record<keyof GameSettings, unknown>>;
    return {
      muted: typeof p.muted === 'boolean' ? p.muted : DEFAULT_SETTINGS.muted,
      sfxVolume: num(p.sfxVolume, DEFAULT_SETTINGS.sfxVolume, 0, 1),
      bgmVolume: num(p.bgmVolume, DEFAULT_SETTINGS.bgmVolume, 0, 1),
      brightness: num(p.brightness, DEFAULT_SETTINGS.brightness, BRIGHTNESS_MIN, BRIGHTNESS_MAX),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 저장 실패는 무시 (시크릿 모드 등)
  }
}
