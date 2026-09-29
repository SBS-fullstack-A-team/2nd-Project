import { useEffect, useRef } from 'react';
import { drawIntroScene } from './intro-scene';
import styles from './Imjin50.module.css';

/** 인트로 글 뒤에 고정으로 깔리는 전장 풍경. 움직임을 줄이는 설정이면 한 장면만 그린다. */
export function IntroBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const started = performance.now();
    let frame = 0;
    let w = 0;
    let h = 0;

    const draw = (now: number) => drawIntroScene(ctx, w, h, reduced ? 0 : (now - started) / 1000);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const paint = (now: number) => {
      draw(now);
      frame = requestAnimationFrame(paint);
    };
    if (!reduced) frame = requestAnimationFrame(paint);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={styles.introBackdrop} aria-hidden />;
}
