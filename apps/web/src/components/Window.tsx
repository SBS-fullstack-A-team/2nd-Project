import type { ReactNode } from 'react';
import { useThemeStyles } from '../lib/theme';
import xpStyles from './Window.xp.module.css';
import win98Styles from './Window.win98.module.css';
import win7Styles from './Window.win7.module.css';
import win11Styles from './Window.win11.module.css';

interface WindowProps {
  title: ReactNode;
  /** 제목 앞 작은 아이콘 (이모지 등) */
  icon?: ReactNode;
  /** 주면 닫기(X) 버튼이 실제로 동작한다. 없으면 제목 표시줄 버튼은 장식이다. */
  onClose?: () => void;
  /** 제목 요소 id — 대화상자의 aria-labelledby 연결용 */
  titleId?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/** 바탕화면 테마(XP·98·7·11)의 창 틀 — 제목 표시줄 + 최소화/최대화/닫기 버튼 */
export function Window({
  title,
  icon,
  onClose,
  titleId,
  className = '',
  bodyClassName = '',
  children,
}: WindowProps) {
  // 클래식 테마에서는 창을 쓰지 않지만 타입상 값이 필요해 XP 스타일을 둔다
  const styles = useThemeStyles({
    classic: xpStyles,
    xp: xpStyles,
    win98: win98Styles,
    win7: win7Styles,
    win11: win11Styles,
  });
  return (
    <div className={`${styles.window} ${className}`}>
      <div className={styles.titleBar}>
        <span id={titleId} className={styles.title}>
          {icon && (
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          )}
          {title}
        </span>
        <span className={styles.controls}>
          <span className={`${styles.control} ${styles.minimize}`} aria-hidden="true" />
          <span className={`${styles.control} ${styles.maximize}`} aria-hidden="true" />
          {onClose ? (
            <button
              type="button"
              className={`${styles.control} ${styles.close}`}
              onClick={onClose}
              aria-label="닫기"
            />
          ) : (
            <span className={`${styles.control} ${styles.close}`} aria-hidden="true" />
          )}
        </span>
      </div>
      <div className={`${styles.body} ${bodyClassName}`}>{children}</div>
    </div>
  );
}
