import type { ReactNode } from 'react';
import styles from './Window.module.css';

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

/** XP 스타일 창 틀 — 파란 제목 표시줄 + 최소화/최대화/닫기 버튼 */
export function Window({
  title,
  icon,
  onClose,
  titleId,
  className = '',
  bodyClassName = '',
  children,
}: WindowProps) {
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
