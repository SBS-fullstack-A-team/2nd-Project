import type { BuildKind } from './engine/config';

export function BuildGlyph({ kind, size = 20 }: { kind: BuildKind; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor' } as const;

  if (kind === 'wall') {
    // 목책: lashed timber stakes
    return (
      <svg {...common} aria-hidden="true">
        <path d="M4 7l2-3 2 3v14H4zM11 7l2-3 2 3v14h-4zM18 7l2-3 2 3v14h-4z" />
        <rect x="2" y="10" width="21" height="1.8" />
        <rect x="2" y="16" width="21" height="1.8" />
      </svg>
    );
  }
  if (kind === 'arrow') {
    // 궁수대: drawn bow
    return (
      <svg {...common} aria-hidden="true">
        <path
          d="M7 2a13 13 0 0 1 0 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path d="M7 3v18" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M7 12h13M16 8.5l4 3.5-4 3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === 'cannon') {
    // 천자총통: banded barrel on a block
    return (
      <svg {...common} aria-hidden="true">
        <path d="M3 9h15l3 1.6v2.8L18 15H3z" />
        <rect x="6" y="7.6" width="1.8" height="8.8" />
        <rect x="11" y="7.6" width="1.8" height="8.8" />
        <path d="M2 17h9v3H2z" />
      </svg>
    );
  }
  if (kind === 'caltrop') {
    // 마름쇠: four-pointed iron spike
    return (
      <svg {...common} aria-hidden="true">
        <path
          d="M12 12L12 3M12 12L4 17M12 12l8 5M12 12l0 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="2.4" />
      </svg>
    );
  }
  // 화차: rocket-arrow launcher on a cart
  return (
    <svg {...common} aria-hidden="true">
      <rect x="3" y="4" width="14" height="2.2" rx="1" />
      <rect x="3" y="8" width="14" height="2.2" rx="1" />
      <rect x="3" y="12" width="14" height="2.2" rx="1" />
      <path
        d="M17 5.1h4M17 9.1h4M17 13.1h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="7" cy="19" r="2.6" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="19" r="2.6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
