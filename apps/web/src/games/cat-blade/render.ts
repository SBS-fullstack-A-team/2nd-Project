/**
 * 캣 블레이드 — 공용 그리기 도우미 (글로우 스프라이트, 스테이지 배경, 발판)
 * 외부 이미지 없이 Canvas 도형·그라디언트만 사용한다.
 */
import { GROUND_Y, PLATFORMS, VIEW_H, VIEW_W } from './config';
import { TAU, rand } from './util';

/* ---------------- 글로우 스프라이트 ---------------- */

const glowCache = new Map<string, HTMLCanvasElement>();

/** 빛 번짐 원 — 매 프레임 그라디언트를 만들지 않도록 색마다 한 번만 그려 둔다 */
export function glowSprite(color: string): HTMLCanvasElement {
  const cached = glowCache.get(color);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.22, color);
    grad.addColorStop(0.55, withAlpha(color, 0.35));
    grad.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  glowCache.set(color, c);
  return c;
}

/** '#rrggbb' → 'rgba(r,g,b,a)' */
export function withAlpha(hex: string, a: number) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** 빛 번짐 원 하나 (합성 모드는 호출하는 쪽에서 정한다) */
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha = 1,
) {
  if (r <= 0 || alpha <= 0) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.min(1, alpha);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = prev;
}

/** 둥근 사각형 경로 */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 고양이 발자국 모양 (중심 x,y, 크기 s) */
export function pawPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.25, s * 0.5, s * 0.42, 0, 0, TAU);
  const toes: [number, number][] = [
    [-0.55, -0.3],
    [-0.2, -0.62],
    [0.2, -0.62],
    [0.55, -0.3],
  ];
  for (const [tx, ty] of toes) {
    ctx.moveTo(x + tx * s + s * 0.2, y + ty * s);
    ctx.ellipse(x + tx * s, y + ty * s, s * 0.2, s * 0.25, 0, 0, TAU);
  }
}

/* ---------------- 스테이지 배경 ---------------- */

/** 스테이지 배경을 오프스크린 캔버스에 한 번만 그려 둔다 (매 프레임 drawImage 한 번) */
export function createBackground(stage: number, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(VIEW_W * scale);
  c.height = Math.round(VIEW_H * scale);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (stage === 1) drawKennelYard(ctx);
  else if (stage === 2) drawLab(ctx);
  else drawShadowPalace(ctx);
  drawPlatforms(ctx, stage);
  return c;
}

function drawKennelYard(ctx: CanvasRenderingContext2D) {
  // 노을 하늘
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#231739');
  sky.addColorStop(0.45, '#6b2f4f');
  sky.addColorStop(0.8, '#d0603d');
  sky.addColorStop(1, '#f2a25a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y);
  // 지는 해
  const sun = ctx.createRadialGradient(700, 330, 10, 700, 330, 170);
  sun.addColorStop(0, 'rgba(255,235,170,1)');
  sun.addColorStop(0.25, 'rgba(255,180,90,0.85)');
  sun.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(500, 150, 400, 330);
  // 별
  ctx.fillStyle = 'rgba(255,240,220,0.7)';
  for (let i = 0; i < 40; i++) {
    ctx.fillRect(rand(0, VIEW_W), rand(0, 160), 1.5, 1.5);
  }
  // 먼 도시 실루엣
  ctx.fillStyle = '#3c1f3c';
  let x = 0;
  while (x < VIEW_W) {
    const w = rand(30, 70);
    const h = rand(60, 150);
    ctx.fillRect(x, GROUND_Y - 60 - h, w, h + 60);
    x += w + rand(2, 10);
  }
  // 철조망 울타리
  ctx.fillStyle = '#2a1528';
  ctx.fillRect(0, GROUND_Y - 120, VIEW_W, 4);
  for (let px = 10; px < VIEW_W; px += 90) ctx.fillRect(px, GROUND_Y - 135, 6, 135);
  ctx.strokeStyle = 'rgba(42,21,40,0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = -20; i < VIEW_W / 14 + 20; i++) {
    ctx.moveTo(i * 14, GROUND_Y - 116);
    ctx.lineTo(i * 14 + 116, GROUND_Y);
    ctx.moveTo(i * 14, GROUND_Y - 116);
    ctx.lineTo(i * 14 - 116, GROUND_Y);
  }
  ctx.stroke();
  // 가시철사 고리
  ctx.strokeStyle = '#2a1528';
  ctx.lineWidth = 1.5;
  for (let px = 0; px < VIEW_W; px += 16) {
    ctx.beginPath();
    ctx.arc(px, GROUND_Y - 128, 6, 0, TAU);
    ctx.stroke();
  }
  // 낡은 개집들 (지붕이 부서진 실루엣)
  const houses = [
    [60, 1],
    [420, 0.8],
    [880, 1.1],
  ] as const;
  for (const [hx, s] of houses) {
    ctx.save();
    ctx.translate(hx, GROUND_Y);
    ctx.scale(s, s);
    ctx.fillStyle = '#4a2a22';
    ctx.fillRect(-46, -62, 92, 62);
    ctx.fillStyle = '#331a17';
    ctx.beginPath();
    ctx.moveTo(-56, -60);
    ctx.lineTo(0, -104);
    ctx.lineTo(20, -88);
    ctx.lineTo(14, -80);
    ctx.lineTo(56, -60);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#140a0a';
    ctx.beginPath();
    ctx.arc(0, -24, 20, Math.PI, 0);
    ctx.lineTo(20, 0);
    ctx.lineTo(-20, 0);
    ctx.closePath();
    ctx.fill();
    // 판자 틈
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    for (let i = -30; i <= 30; i += 15) {
      ctx.beginPath();
      ctx.moveTo(i, -60);
      ctx.lineTo(i, -44);
      ctx.stroke();
    }
    ctx.restore();
  }
  // 땅
  const ground = ctx.createLinearGradient(0, GROUND_Y, 0, VIEW_H);
  ground.addColorStop(0, '#5a3524');
  ground.addColorStop(1, '#2b170f');
  ctx.fillStyle = ground;
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
  ctx.fillStyle = '#7a4a2c';
  ctx.fillRect(0, GROUND_Y, VIEW_W, 4);
  // 풀 · 뼈다귀 · 돌
  ctx.strokeStyle = '#4c5a2a';
  ctx.lineWidth = 2;
  for (let i = 0; i < 70; i++) {
    const gx = rand(0, VIEW_W);
    ctx.beginPath();
    ctx.moveTo(gx, GROUND_Y + 2);
    ctx.lineTo(gx + rand(-4, 4), GROUND_Y - rand(5, 12));
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++)
    drawBone(ctx, rand(40, VIEW_W - 40), rand(GROUND_Y + 18, VIEW_H - 14));
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 30; i++) {
    ctx.beginPath();
    ctx.ellipse(rand(0, VIEW_W), rand(GROUND_Y + 10, VIEW_H), rand(3, 8), rand(2, 4), 0, 0, TAU);
    ctx.fill();
  }
}

function drawBone(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rand(-0.6, 0.6));
  ctx.fillStyle = '#e8dcc4';
  ctx.fillRect(-10, -2, 20, 4);
  for (const sx of [-10, 10]) {
    ctx.beginPath();
    ctx.arc(sx, -2.5, 3, 0, TAU);
    ctx.arc(sx, 2.5, 3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawLab(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  bg.addColorStop(0, '#05091a');
  bg.addColorStop(1, '#0e1f3d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y);
  // 벽 패널 격자
  ctx.strokeStyle = 'rgba(60,140,255,0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= VIEW_W; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, GROUND_Y);
    ctx.stroke();
  }
  for (let y = 0; y <= GROUND_Y; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
  }
  // 파이프
  const pipes = [70, 110, 410];
  for (const py of pipes) {
    const pg = ctx.createLinearGradient(0, py - 8, 0, py + 8);
    pg.addColorStop(0, '#3a4a66');
    pg.addColorStop(0.5, '#8aa0c8');
    pg.addColorStop(1, '#26324a');
    ctx.fillStyle = pg;
    ctx.fillRect(0, py - 7, VIEW_W, 14);
    ctx.fillStyle = '#1a2236';
    for (let x = 40; x < VIEW_W; x += 160) ctx.fillRect(x, py - 10, 10, 20);
  }
  // 서버 랙
  for (const rx of [30, 250, 560, 780]) {
    ctx.fillStyle = '#0b1428';
    ctx.fillRect(rx, GROUND_Y - 250, 130, 250);
    ctx.strokeStyle = '#2a4a80';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx + 1, GROUND_Y - 249, 128, 248);
    for (let y = GROUND_Y - 236; y < GROUND_Y - 10; y += 22) {
      ctx.fillStyle = '#13213e';
      ctx.fillRect(rx + 8, y, 114, 16);
    }
  }
  // 큰 유리 실험관 (가운데)
  ctx.save();
  ctx.translate(480, GROUND_Y);
  const tube = ctx.createLinearGradient(-50, 0, 50, 0);
  tube.addColorStop(0, 'rgba(40,240,200,0.06)');
  tube.addColorStop(0.5, 'rgba(40,240,200,0.22)');
  tube.addColorStop(1, 'rgba(40,240,200,0.06)');
  ctx.fillStyle = tube;
  ctx.fillRect(-50, -300, 100, 300);
  ctx.strokeStyle = 'rgba(140,255,230,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-50, -300, 100, 300);
  ctx.fillStyle = '#1a2a44';
  ctx.fillRect(-60, -314, 120, 16);
  ctx.fillRect(-60, -16, 120, 16);
  ctx.restore();
  // 바닥 철판 + 경고 줄무늬
  const floor = ctx.createLinearGradient(0, GROUND_Y, 0, VIEW_H);
  floor.addColorStop(0, '#29344c');
  floor.addColorStop(1, '#0e1424');
  ctx.fillStyle = floor;
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, GROUND_Y, VIEW_W, 10);
  ctx.clip();
  ctx.fillStyle = '#f2c230';
  ctx.fillRect(0, GROUND_Y, VIEW_W, 10);
  ctx.fillStyle = '#151515';
  for (let x = -20; x < VIEW_W + 20; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x + 14, GROUND_Y);
    ctx.lineTo(x + 4, GROUND_Y + 10);
    ctx.lineTo(x - 10, GROUND_Y + 10);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  for (let x = 0; x < VIEW_W; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 10);
    ctx.lineTo(x, VIEW_H);
    ctx.stroke();
  }
}

function drawShadowPalace(ctx: CanvasRenderingContext2D) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#07020f');
  sky.addColorStop(0.6, '#24093a');
  sky.addColorStop(1, '#4a0f3a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y);
  // 붉은 달
  const moon = ctx.createRadialGradient(480, 170, 20, 480, 170, 230);
  moon.addColorStop(0, 'rgba(255,90,90,0.5)');
  moon.addColorStop(1, 'rgba(255,40,80,0)');
  ctx.fillStyle = moon;
  ctx.fillRect(240, 0, 480, 400);
  ctx.fillStyle = '#ff5a6a';
  ctx.beginPath();
  ctx.arc(480, 170, 92, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,20,50,0.45)';
  for (const [cx, cy, r] of [
    [450, 140, 18],
    [510, 200, 24],
    [470, 220, 10],
    [530, 140, 9],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }
  // 성 실루엣 (첨탑)
  ctx.fillStyle = '#12051c';
  const spires = [
    [40, 260, 50],
    [140, 330, 40],
    [250, 220, 60],
    [700, 240, 60],
    [810, 320, 44],
    [910, 270, 50],
  ] as const;
  for (const [sx, h, w] of spires) {
    ctx.fillRect(sx - w / 2, GROUND_Y - h, w, h);
    ctx.beginPath();
    ctx.moveTo(sx - w / 2 - 6, GROUND_Y - h);
    ctx.lineTo(sx, GROUND_Y - h - w * 1.3);
    ctx.lineTo(sx + w / 2 + 6, GROUND_Y - h);
    ctx.closePath();
    ctx.fill();
    // 창문 불빛
    ctx.fillStyle = 'rgba(255,90,140,0.55)';
    ctx.fillRect(sx - 4, GROUND_Y - h + 30, 8, 14);
    ctx.fillStyle = '#12051c';
  }
  ctx.fillRect(0, GROUND_Y - 150, VIEW_W, 150);
  // 성벽 톱니
  for (let x = 0; x < VIEW_W; x += 40) ctx.fillRect(x, GROUND_Y - 168, 22, 20);
  // 깃발
  for (const bx of [330, 630]) {
    ctx.fillStyle = '#6a0a2a';
    ctx.beginPath();
    ctx.moveTo(bx - 22, GROUND_Y - 140);
    ctx.lineTo(bx + 22, GROUND_Y - 140);
    ctx.lineTo(bx + 22, GROUND_Y - 40);
    ctx.lineTo(bx, GROUND_Y - 56);
    ctx.lineTo(bx - 22, GROUND_Y - 40);
    ctx.closePath();
    ctx.fill();
    // 고양이 왕 문장
    ctx.fillStyle = '#d4a63a';
    ctx.beginPath();
    ctx.arc(bx, GROUND_Y - 100, 10, 0, TAU);
    ctx.moveTo(bx - 10, GROUND_Y - 104);
    ctx.lineTo(bx - 8, GROUND_Y - 118);
    ctx.lineTo(bx - 2, GROUND_Y - 108);
    ctx.moveTo(bx + 10, GROUND_Y - 104);
    ctx.lineTo(bx + 8, GROUND_Y - 118);
    ctx.lineTo(bx + 2, GROUND_Y - 108);
    ctx.fill();
  }
  // 돌 바닥
  const floor = ctx.createLinearGradient(0, GROUND_Y, 0, VIEW_H);
  floor.addColorStop(0, '#3a2a4a');
  floor.addColorStop(1, '#120a1a');
  ctx.fillStyle = floor;
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
  ctx.fillStyle = '#6a4a8a';
  ctx.fillRect(0, GROUND_Y, VIEW_W, 3);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 2;
  for (let row = 0; row < 3; row++) {
    const y = GROUND_Y + 3 + row * 24;
    ctx.beginPath();
    ctx.moveTo(0, y + 24);
    ctx.lineTo(VIEW_W, y + 24);
    ctx.stroke();
    for (let x = (row % 2) * 40; x < VIEW_W; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 24);
      ctx.stroke();
    }
  }
}

function drawPlatforms(ctx: CanvasRenderingContext2D, stage: number) {
  for (const p of PLATFORMS) {
    const w = p.x2 - p.x1;
    ctx.save();
    ctx.translate(p.x1, p.y);
    if (stage === 1) {
      // 나무 판자
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(4, 14, w - 8, 8);
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(0, 0, w, 14);
      ctx.fillStyle = '#a8703f';
      ctx.fillRect(0, 0, w, 4);
      ctx.strokeStyle = '#5a3820';
      ctx.lineWidth = 2;
      for (let x = 36; x < w; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 14);
        ctx.stroke();
      }
      ctx.fillStyle = '#3a2414';
      for (const x of [6, w - 10]) {
        ctx.beginPath();
        ctx.arc(x + 2, 7, 2, 0, TAU);
        ctx.fill();
      }
    } else if (stage === 2) {
      // 철제 캣워크
      ctx.fillStyle = '#3a4a6a';
      ctx.fillRect(0, 0, w, 10);
      ctx.fillStyle = '#7ab4ff';
      ctx.fillRect(0, 0, w, 2);
      ctx.strokeStyle = '#2a3650';
      ctx.lineWidth = 2;
      for (let x = 0; x < w; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, 10);
        ctx.lineTo(x + 7, 20);
        ctx.lineTo(x + 14, 10);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40,240,255,0.5)';
      ctx.fillRect(8, 4, w - 16, 2);
    } else {
      // 떠 있는 돌 난간
      ctx.fillStyle = '#4a3560';
      ctx.fillRect(0, 0, w, 16);
      ctx.fillStyle = '#7a5aa0';
      ctx.fillRect(0, 0, w, 3);
      ctx.fillStyle = '#2a1a3a';
      ctx.beginPath();
      ctx.moveTo(10, 16);
      ctx.lineTo(w - 10, 16);
      ctx.lineTo(w / 2 + 20, 40);
      ctx.lineTo(w / 2 - 20, 40);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      for (let x = 30; x < w; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 16);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/** 배경 위에서 움직이는 요소 (불티, 깜빡이는 랩 조명, 그림자 안개) */
export function drawBackgroundFx(ctx: CanvasRenderingContext2D, stage: number, t: number) {
  ctx.save();
  if (stage === 1) {
    // 날리는 먼지·민들레 씨
    ctx.fillStyle = 'rgba(255,220,180,0.5)';
    for (let i = 0; i < 24; i++) {
      const x = ((i * 97 + t * (12 + (i % 5) * 6)) % (VIEW_W + 40)) - 20;
      const y = 120 + ((i * 53) % 300) + Math.sin(t * 1.3 + i) * 10;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + (i % 3) * 0.5, 0, TAU);
      ctx.fill();
    }
  } else if (stage === 2) {
    ctx.globalCompositeOperation = 'lighter';
    // 서버 랙 LED
    for (const rx of [30, 250, 560, 780]) {
      for (let k = 0; k < 10; k++) {
        const on = Math.sin(t * (2 + k * 0.7) + rx) > 0.2;
        if (!on) continue;
        const color = k % 3 === 0 ? '#ff4a6a' : k % 3 === 1 ? '#3affb0' : '#3ab0ff';
        drawGlow(ctx, rx + 20 + (k % 4) * 26, GROUND_Y - 228 + k * 22, 6, color, 0.9);
      }
    }
    // 실험관 거품
    for (let i = 0; i < 10; i++) {
      const y = GROUND_Y - 20 - ((t * 40 + i * 31) % 270);
      const x = 480 + Math.sin(t * 2 + i * 1.7) * 30;
      drawGlow(ctx, x, y, 7, '#3affd0', 0.5);
    }
  } else {
    // 붉은 불티 상승
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 30; i++) {
      const x = (i * 67 + Math.sin(t * 0.7 + i) * 30 + VIEW_W) % VIEW_W;
      const y = VIEW_H - ((t * (20 + (i % 6) * 8) + i * 41) % (VIEW_H + 20));
      drawGlow(ctx, x, y, 4 + (i % 3), i % 2 ? '#ff4a7a' : '#b44aff', 0.7);
    }
  }
  ctx.restore();
}
