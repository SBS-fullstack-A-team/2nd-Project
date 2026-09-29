import { THEME_LABEL, useTheme } from '../lib/theme';

/** 테마 전환 버튼 — 누르면 다른 테마로 바뀐다 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'xp' ? 'classic' : 'xp';

  return (
    <button
      type="button"
      className={className}
      onClick={toggleTheme}
      title={`${THEME_LABEL[next]} 테마로 바꾸기`}
    >
      🎨 {THEME_LABEL[next]}
    </button>
  );
}
