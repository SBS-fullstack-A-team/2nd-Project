import { THEMES, THEME_ICON, THEME_LABEL, isTheme, useTheme } from '../lib/theme';

/** 테마 선택 목록 — 클래식 헤더에서 쓴다 (XP·98 은 시작 메뉴에서 고른다) */
export function ThemeSelect({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <select
      className={className}
      value={theme}
      onChange={(e) => {
        if (isTheme(e.target.value)) setTheme(e.target.value);
      }}
      aria-label="테마 선택"
    >
      {THEMES.map((t) => (
        <option key={t} value={t}>
          {THEME_ICON[t]} {THEME_LABEL[t]} 테마
        </option>
      ))}
    </select>
  );
}
