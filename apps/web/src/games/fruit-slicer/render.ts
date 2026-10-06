import type { FruitKind, FruitType } from './config';

/**
 * 그리기 함수 모음 — 이미지 파일 없이 Canvas API(arc, path, gradient)로만 그린다.
 * 모든 함수는 (0, 0) 을 중심으로 그리므로, 호출 전에 translate/rotate 해 둔다.
 */

export const TAU = Math.PI * 2;

/** 매 판 같은 무늬가 나오도록 고정 시드 난수 */
export function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** 껍질 무늬(점·섬유) — 과일 종류별로 한 번만 만들어 둔다. 좌표는 반지름 1 기준 */
const TEXTURE: Record<FruitKind, { x: number; y: number; a: number }[]> = (() => {
  const make = (seed: number, n: number) => {
    const rnd = seeded(seed);
    return Array.from({ length: n }, () => {
      const ang = rnd() * TAU;
      const dist = Math.sqrt(rnd()) * 0.82;
      return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, a: rnd() * TAU };
    });
  };
  return {
    apple: make(11, 0),
    banana: make(12, 0),
    watermelon: make(13, 0),
    orange: make(14, 22),
    coconut: make(15, 26),
    kiwi: make(16, 30),
    strawberry: make(17, 0),
  };
})();

function highlight(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.6, 0, TAU);
  ctx.fill();
}

function skinGradient(ctx: CanvasRenderingContext2D, r: number, type: FruitType) {
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
  g.addColorStop(0, type.skinLight);
  g.addColorStop(1, type.skinDark);
  return g;
}

/** 과일 본체 */
export function drawFruitBody(ctx: CanvasRenderingContext2D, type: FruitType, r: number) {
  switch (type.kind) {
    case 'apple': {
      ctx.fillStyle = skinGradient(ctx, r, type);
      // 원 3개를 겹쳐 윗부분이 살짝 파인 사과 모양
      ctx.beginPath();
      ctx.arc(-r * 0.28, -r * 0.08, r * 0.78, 0, TAU);
      ctx.arc(r * 0.28, -r * 0.08, r * 0.78, 0, TAU);
      ctx.moveTo(r * 0.85, r * 0.1);
      ctx.arc(0, r * 0.1, r * 0.85, 0, TAU);
      ctx.fill();
      // 꼭지
      ctx.strokeStyle = '#5a3a1a';
      ctx.lineWidth = r * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.7);
      ctx.quadraticCurveTo(r * 0.02, -r * 0.95, r * 0.14, -r * 1.08);
      ctx.stroke();
      // 잎
      ctx.fillStyle = '#3fae3a';
      ctx.beginPath();
      ctx.ellipse(r * 0.38, -r * 0.95, r * 0.3, r * 0.12, -0.45, 0, TAU);
      ctx.fill();
      highlight(ctx, -r * 0.42, -r * 0.3, r * 0.16, r * 0.28);
      break;
    }
    case 'banana': {
      // 굵은 호(arc)를 둥근 끝으로 그려 초승달 모양 바나나
      const cy = -r * 0.95;
      const R = r * 1.2;
      const g = ctx.createLinearGradient(0, -r * 0.4, 0, r * 0.55);
      g.addColorStop(0, type.skinLight);
      g.addColorStop(1, type.skinDark);
      ctx.strokeStyle = g;
      ctx.lineWidth = r * 0.56;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, cy, R, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.arc(0, cy, R - r * 0.12, Math.PI * 0.3, Math.PI * 0.68);
      ctx.stroke();
      // 양 끝 꼭지
      ctx.fillStyle = '#5a3d10';
      for (const a of [Math.PI * 0.2, Math.PI * 0.8]) {
        ctx.beginPath();
        ctx.arc(Math.cos(a) * R, cy + Math.sin(a) * R, r * 0.12, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'watermelon': {
      ctx.fillStyle = skinGradient(ctx, r, type);
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.82, 0, 0, TAU);
      ctx.fill();
      // 줄무늬
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(15,70,25,0.75)';
      ctx.lineWidth = r * 0.13;
      for (let i = -2; i <= 2; i++) {
        const x = i * r * 0.4;
        ctx.beginPath();
        ctx.moveTo(x, -r);
        ctx.bezierCurveTo(x + r * 0.18, -r * 0.4, x - r * 0.18, r * 0.4, x, r);
        ctx.stroke();
      }
      ctx.restore();
      highlight(ctx, -r * 0.45, -r * 0.35, r * 0.2, r * 0.3);
      break;
    }
    case 'orange': {
      ctx.fillStyle = skinGradient(ctx, r, type);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(170,70,0,0.3)';
      for (const d of TEXTURE.orange) {
        ctx.beginPath();
        ctx.arc(d.x * r, d.y * r, r * 0.04, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#3c8d2f';
      ctx.beginPath();
      ctx.ellipse(r * 0.12, -r * 0.92, r * 0.2, r * 0.09, -0.3, 0, TAU);
      ctx.fill();
      highlight(ctx, -r * 0.4, -r * 0.38, r * 0.16, r * 0.26);
      break;
    }
    case 'coconut': {
      ctx.fillStyle = skinGradient(ctx, r, type);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      // 섬유 결
      ctx.strokeStyle = 'rgba(35,18,6,0.55)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (const d of TEXTURE.coconut) {
        ctx.beginPath();
        ctx.moveTo(d.x * r, d.y * r);
        ctx.lineTo(d.x * r + Math.cos(d.a) * r * 0.16, d.y * r + Math.sin(d.a) * r * 0.16);
        ctx.stroke();
      }
      // 코코넛의 눈 3개
      ctx.fillStyle = '#24140a';
      for (const [x, y] of [
        [-0.22, -0.42],
        [0.22, -0.42],
        [0, -0.2],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x * r, y * r, r * 0.09, 0, TAU);
        ctx.fill();
      }
      highlight(ctx, -r * 0.45, -r * 0.3, r * 0.12, r * 0.22);
      break;
    }
    case 'kiwi': {
      ctx.fillStyle = skinGradient(ctx, r, type);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.1, r * 0.88, 0, 0, TAU);
      ctx.fill();
      // 보송보송한 털
      ctx.fillStyle = 'rgba(230,200,150,0.35)';
      for (const d of TEXTURE.kiwi) {
        ctx.beginPath();
        ctx.arc(d.x * r * 1.1, d.y * r * 0.9, r * 0.035, 0, TAU);
        ctx.fill();
      }
      highlight(ctx, -r * 0.45, -r * 0.32, r * 0.14, r * 0.22);
      break;
    }
    case 'strawberry': {
      // 위는 둥글고 아래로 뾰족한 딸기 모양
      ctx.fillStyle = skinGradient(ctx, r, type);
      ctx.beginPath();
      ctx.moveTo(0, r * 1.05);
      ctx.bezierCurveTo(-r * 0.55, r * 0.75, -r * 1.05, r * 0.1, -r * 0.95, -r * 0.35);
      ctx.bezierCurveTo(-r * 0.9, -r * 0.85, -r * 0.3, -r * 0.85, 0, -r * 0.7);
      ctx.bezierCurveTo(r * 0.3, -r * 0.85, r * 0.9, -r * 0.85, r * 0.95, -r * 0.35);
      ctx.bezierCurveTo(r * 1.05, r * 0.1, r * 0.55, r * 0.75, 0, r * 1.05);
      ctx.fill();
      // 씨
      ctx.fillStyle = '#ffe98a';
      for (const s of STRAWBERRY_SEEDS) {
        ctx.beginPath();
        ctx.ellipse(s.x * r, s.y * r, r * 0.045, r * 0.07, s.x * 0.6, 0, TAU);
        ctx.fill();
      }
      // 꼭지 잎 5장
      ctx.fillStyle = '#2f9e3a';
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + ((i - 2) / 2) * 1.25;
        ctx.save();
        ctx.translate(0, -r * 0.68);
        ctx.rotate(a + Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, r * 0.22, r * 0.12, r * 0.3, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = '#2f7a2a';
      ctx.lineWidth = r * 0.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.7);
      ctx.lineTo(r * 0.05, -r * 1.02);
      ctx.stroke();
      highlight(ctx, -r * 0.45, -r * 0.2, r * 0.12, r * 0.24);
      break;
    }
  }
}

/** 딸기 씨 위치 (반지름 1 기준) — 아래로 갈수록 폭이 좁아지는 줄에 엇갈리게 배치 */
const STRAWBERRY_SEEDS: { x: number; y: number }[] = (() => {
  const seeds: { x: number; y: number }[] = [];
  let row = 0;
  for (let y = -0.4; y <= 0.8; y += 0.24, row++) {
    const halfWidth = y < -0.1 ? 0.8 : 0.8 * (1 - (y + 0.1) / 1.05);
    const offset = row % 2 === 0 ? 0 : 0.15;
    for (let x = -halfWidth + offset; x <= halfWidth; x += 0.3) seeds.push({ x, y });
  }
  return seeds;
})();

/**
 * 잘린 단면 — 절단선이 x 축이 되도록 회전된 좌표계에서 호출한다.
 * 타원으로 그려 단면이 살짝 기울어져 보이게 한다.
 */
export function drawCutFace(ctx: CanvasRenderingContext2D, type: FruitType, r: number) {
  const rx = r * 0.9;
  const ry = r * 0.3;
  ctx.fillStyle = type.flesh;
  ctx.strokeStyle = type.kind === 'coconut' ? '#5a3a1f' : type.skinDark;
  ctx.lineWidth = type.kind === 'coconut' ? r * 0.16 : r * 0.09;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  switch (type.kind) {
    case 'watermelon': {
      ctx.fillStyle = '#2a1a1a';
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(i * rx * 0.24, (i % 2) * ry * 0.35, r * 0.05, r * 0.03, 0, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'kiwi': {
      ctx.fillStyle = '#fbfde8';
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.3, ry * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1b1b12';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rx * 0.5, Math.sin(a) * ry * 0.5, r * 0.03, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'orange': {
      ctx.strokeStyle = 'rgba(255,240,200,0.8)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * rx * 0.85, Math.sin(a) * ry * 0.85);
        ctx.stroke();
      }
      break;
    }
    case 'apple': {
      ctx.fillStyle = '#4a2a12';
      for (const x of [-0.12, 0.12]) {
        ctx.beginPath();
        ctx.ellipse(x * r, 0, r * 0.05, r * 0.03, 0, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'strawberry': {
      // 하얀 속심 + 가장자리 씨
      ctx.fillStyle = '#fff0f2';
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.45, ry * 0.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffe98a';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rx * 0.82, Math.sin(a) * ry * 0.75, r * 0.03, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'banana':
    case 'coconut':
      break;
  }
}

/** 폭탄 — 붉게 맥동하는 경고 광채 + 심지 불꽃 */
export function drawBomb(ctx: CanvasRenderingContext2D, r: number, time: number) {
  const pulse = 0.55 + 0.45 * Math.sin(time * 10);
  const glow = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 1.6);
  glow.addColorStop(0, `rgba(255,40,40,${0.45 * pulse})`);
  glow.addColorStop(1, 'rgba(255,40,40,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.6, 0, TAU);
  ctx.fill();

  const body = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  body.addColorStop(0, '#6f7080');
  body.addColorStop(1, '#0c0c12');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  // 뚜껑
  ctx.fillStyle = '#8b909a';
  ctx.fillRect(-r * 0.28, -r * 1.12, r * 0.56, r * 0.26);
  // 심지
  ctx.strokeStyle = '#c9a36b';
  ctx.lineWidth = r * 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.1);
  ctx.quadraticCurveTo(r * 0.2, -r * 1.5, r * 0.45, -r * 1.42);
  ctx.stroke();
  // 심지 끝 불꽃
  const spark = r * (0.16 + 0.08 * Math.sin(time * 40));
  const sg = ctx.createRadialGradient(r * 0.45, -r * 1.42, 0, r * 0.45, -r * 1.42, spark * 1.8);
  sg.addColorStop(0, '#ffffff');
  sg.addColorStop(0.4, '#ffe066');
  sg.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(r * 0.45, -r * 1.42, spark * 1.8, 0, TAU);
  ctx.fill();

  // 경고 표시 (X)
  ctx.strokeStyle = 'rgba(255,70,70,0.9)';
  ctx.lineWidth = r * 0.14;
  const m = r * 0.3;
  ctx.beginPath();
  ctx.moveTo(-m, -m + r * 0.1);
  ctx.lineTo(m, m + r * 0.1);
  ctx.moveTo(m, -m + r * 0.1);
  ctx.lineTo(-m, m + r * 0.1);
  ctx.stroke();

  highlight(ctx, -r * 0.42, -r * 0.4, r * 0.12, r * 0.22);
}

/** 심지 끝의 로컬 좌표 (파티클 방출 위치 계산용) */
export function bombFuseTip(r: number) {
  return { x: r * 0.45, y: -r * 1.42 };
}

/** 나무 도마 배경 — 크기가 바뀔 때만 오프스크린 캔버스에 한 번 그린다 */
export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#4a2d18');
  g.addColorStop(1, '#23140a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const rnd = seeded(7);
  const plank = 110;
  // 나뭇결
  ctx.lineWidth = 1.5;
  for (let x = 0; x < w; x += plank) {
    for (let i = 0; i < 5; i++) {
      const gx = x + 12 + rnd() * (plank - 24);
      ctx.strokeStyle = `rgba(${rnd() > 0.5 ? '255,210,160' : '0,0,0'},${0.05 + rnd() * 0.07})`;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      const wobble = 6 + rnd() * 10;
      for (let y = 0; y <= h; y += 25) {
        ctx.lineTo(gx + Math.sin(y / 60 + i) * wobble * 0.4, y);
      }
      ctx.stroke();
    }
    // 판자 사이 틈
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, 0, 3, h);
    ctx.fillStyle = 'rgba(255,220,180,0.06)';
    ctx.fillRect(x + 3, 0, 2, h);
  }

  // 비네트
  const v = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}
