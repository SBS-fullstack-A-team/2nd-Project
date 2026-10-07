import { Fragment, useId } from 'react';
import {
  GLOSS_ALPHA,
  ICONS,
  OUTLINE,
  OUTLINE_WIDTH,
  isIconId,
  isShaded,
  shadeStops,
  type IconDef,
  type IconId,
} from './icons';
import styles from './WormArena.module.css';

/** 직접 그린 아이콘 (icons.ts) — 크기는 글자 크기를 따른다 */
export function Icon({
  id,
  size = '1.25em',
  label,
}: {
  id: IconId;
  size?: string;
  label?: string;
}) {
  const def: IconDef = ICONS[id];
  // 같은 화면에 아이콘이 여러 개라 그라데이션 id 가 겹치지 않게
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        {/* 광택 — 면 위쪽 가운데가 가장 밝다 (면 크기에 맞춰 늘어난다) */}
        <radialGradient id={`${uid}-gloss`} cx="0.5" cy="0.12" r="0.55">
          <stop offset="0" stopColor="#fff" stopOpacity={GLOSS_ALPHA} />
          <stop offset="0.7" stopColor="#fff" stopOpacity={GLOSS_ALPHA * 0.35} />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {def.layers.map((l, i) => {
          if (!l.fill || !isShaded(l.fill)) return null;
          const [top, mid, bottom] = shadeStops(l.fill);
          return (
            <linearGradient key={i} id={`${uid}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={top} />
              <stop offset="0.55" stopColor={mid} />
              <stop offset="1" stopColor={bottom} />
            </linearGradient>
          );
        })}
      </defs>
      {def.layers.map((l, i) => {
        const shaded = !!l.fill && isShaded(l.fill);
        return (
          <Fragment key={i}>
            {l.fill && (
              <path
                d={l.d}
                fill={shaded ? `url(#${uid}-${i})` : l.fill}
                stroke={def.outline ? OUTLINE : undefined}
                strokeWidth={def.outline ? OUTLINE_WIDTH : undefined}
                paintOrder="stroke"
              />
            )}
            {shaded && <path d={l.d} fill={`url(#${uid}-gloss)`} />}
            {l.stroke && <path d={l.d} fill="none" stroke={l.stroke} strokeWidth={l.sw ?? 2} />}
          </Fragment>
        );
      })}
    </svg>
  );
}

/** 문구 속 `:아이콘id:` 를 아이콘으로 바꿔 보여 준다 (모르는 id 는 글자 그대로) */
export function IconText({ text }: { text: string }) {
  const parts = text.split(/:([a-zA-Z]+):/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 && isIconId(part) ? (
          <Icon key={i} id={part} />
        ) : (
          <Fragment key={i}>{i % 2 === 1 ? `:${part}:` : part}</Fragment>
        ),
      )}
    </>
  );
}
