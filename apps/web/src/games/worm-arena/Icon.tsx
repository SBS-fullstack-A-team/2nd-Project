import { Fragment } from 'react';
import { ICONS, OUTLINE, OUTLINE_WIDTH, isIconId, type IconDef, type IconId } from './icons';
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
      {def.layers.map((l, i) => (
        <Fragment key={i}>
          {l.fill && (
            <path
              d={l.d}
              fill={l.fill}
              stroke={def.outline ? OUTLINE : undefined}
              strokeWidth={def.outline ? OUTLINE_WIDTH : undefined}
              paintOrder="stroke"
            />
          )}
          {l.stroke && <path d={l.d} fill="none" stroke={l.stroke} strokeWidth={l.sw ?? 2} />}
        </Fragment>
      ))}
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
