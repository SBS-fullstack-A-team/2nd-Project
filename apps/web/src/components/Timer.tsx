import { useEffect, useRef, useState } from 'react';
import { useThemeStyles } from '../lib/theme';
import classicStyles from './Timer.classic.module.css';
import xpStyles from './Timer.xp.module.css';
import win98Styles from './Timer.win98.module.css';
import win7Styles from './Timer.win7.module.css';
import win11Styles from './Timer.win11.module.css';

interface TimerProps {
  /** 제한시간(초) */
  seconds: number;
  /** false 면 일시정지 */
  running?: boolean;
  /** 시간이 다 되면 한 번 호출된다 */
  onExpire: () => void;
}

/**
 * 공통 카운트다운 타이머.
 * 처음부터 다시 시작하려면 부모에서 key 를 바꿔 새로 마운트한다.
 */
export function Timer({ seconds, running = true, onExpire }: TimerProps) {
  const styles = useThemeStyles({
    classic: classicStyles,
    xp: xpStyles,
    win98: win98Styles,
    win7: win7Styles,
    win11: win11Styles,
  });
  const totalMs = seconds * 1000;
  const [remainingMs, setRemainingMs] = useState(totalMs);
  const remainingRef = useRef(totalMs);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    if (!running || remainingRef.current <= 0) return;
    // 실제 경과 시간 기준으로 계산해서 탭 전환 등으로 interval 이 밀려도 오차가 쌓이지 않게 한다
    const deadline = Date.now() + remainingRef.current;
    const id = setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      remainingRef.current = left;
      setRemainingMs(left);
      if (left === 0) {
        clearInterval(id);
        onExpireRef.current();
      }
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  const secondsLeft = Math.ceil(remainingMs / 1000);
  const ratio = totalMs > 0 ? remainingMs / totalMs : 0;
  const urgent = secondsLeft <= 10;

  return (
    <div
      className={`${styles.timer} ${urgent ? styles.urgent : ''}`}
      role="timer"
      aria-label={`남은 시간 ${secondsLeft}초`}
    >
      <div className={styles.track}>
        <div className={styles.bar} style={{ transform: `scaleX(${ratio})` }} />
      </div>
      <span className={styles.label}>{secondsLeft}초</span>
    </div>
  );
}
