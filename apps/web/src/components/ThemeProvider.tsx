import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, loadTheme, saveTheme, type Theme } from '../lib/theme';

/** 현재 테마를 <html data-theme> 에 반영하고, 바꾸면 브라우저에 저장한다 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(loadTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    saveTheme(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
