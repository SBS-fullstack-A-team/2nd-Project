import { createContext, useContext } from 'react';

/**
 * 사이트 디자인 테마.
 * - classic: 처음 디자인 (밝은 크림색 + 두꺼운 테두리 카드)
 * - xp: 추억의 윈도우 XP 느낌 (바탕화면 + 창 + 작업 표시줄)
 * - win98: 추억의 윈도우 98 느낌 (XP 와 화면 구조는 같고 스타일만 다르다)
 * - win7: 윈도우 7 느낌 (Aero 유리 창 + 둥근 시작 버튼)
 * - win11: 윈도우 11 느낌 (둥근 모서리 + 가운데 정렬 작업 표시줄·시작 버튼)
 *
 * 테마는 <html data-theme="..."> 로 적용되고, 색·모서리 토큰은 styles/global.css 에서 테마별로 정의한다.
 * 게임 폴더는 토큰만 쓰면 모든 테마를 자동으로 따라간다.
 */
export type Theme = 'classic' | 'xp' | 'win98' | 'win7' | 'win11';

export const THEMES: readonly Theme[] = ['xp', 'win98', 'win7', 'win11', 'classic'];
export const DEFAULT_THEME: Theme = 'xp';
export const THEME_LABEL: Record<Theme, string> = {
  classic: '클래식',
  xp: 'XP',
  win98: '98',
  win7: '7',
  win11: '11',
};
export const THEME_ICON: Record<Theme, string> = {
  classic: '📄',
  xp: '🪟',
  win98: '🖥️',
  win7: '🔷',
  win11: '✨',
};

/** 바탕화면·창·작업 표시줄 구조를 쓰는 테마 (XP·98·7·11). 클래식은 헤더·푸터 구조 */
export function isDesktopTheme(theme: Theme): boolean {
  return theme !== 'classic';
}

/** index.html 의 초기 적용 스크립트와 같은 키를 써야 한다 */
export const THEME_STORAGE_KEY = 'simsim:theme';

export function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 저장 실패는 무시 (시크릿 모드 등) — 이번 방문 동안만 적용된다
  }
}

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme 은 ThemeProvider 안에서만 사용할 수 있습니다.');
  return value;
}

/** 테마별 CSS 모듈 중 현재 테마의 것을 고른다 */
export function useThemeStyles<T>(styles: Record<Theme, T>): T {
  return styles[useTheme().theme];
}
