// 1フレームぶんの描画: 地面(キャッシュ済み) → キャラクター → 昼夜の色 → 雨 → 吹き出し。

import type { CharId, World } from '../../sim/types';
import { CHAR_IDS } from '../../sim/types';
import { PLACES, SPOTS } from '../../sim/map';
import { PROFILES } from '../../sim/profiles';
import { minuteOfDay } from '../../sim/clock';
import { ACTIVITY_ICON } from '../../sim/activity';
import { TILE, WORLD_H, WORLD_W } from './static';
import { drawCharacter, drawSleeper, type SpriteState } from './sprites';

export interface FrameInput {
  world: World;
  /** 次のtickまでの進み具合 0〜1(キャラの動きをなめらかにする) */
  alpha: number;
  /** 実時間の秒(アニメーション用) */
  time: number;
  selected: CharId | null;
  /** 一時停止中 */
  paused: boolean;
}

type Rgba = [number, number, number, number];

const SKY_KEYS: [number, Rgba][] = [
  [0, [10, 16, 52, 0.44]],
  [300, [14, 22, 64, 0.4]],
  [370, [255, 160, 110, 0.2]],
  [440, [255, 205, 160, 0.08]],
  [500, [255, 255, 255, 0]],
  [990, [255, 255, 255, 0]],
  [1050, [255, 170, 90, 0.14]],
  [1110, [255, 120, 90, 0.2]],
  [1170, [50, 40, 110, 0.32]],
  [1260, [12, 18, 54, 0.4]],
  [1440, [10, 16, 52, 0.44]],
];

export function skyTint(minute: number): Rgba {
  for (let i = 1; i < SKY_KEYS.length; i++) {
    const [m1, c1] = SKY_KEYS[i];
    if (minute <= m1) {
      const [m0, c0] = SKY_KEYS[i - 1];
      const t = (minute - m0) / (m1 - m0);
      return [0, 1, 2, 3].map((k) => c0[k] + (c1[k] - c0[k]) * t) as Rgba;
    }
  }
  return SKY_KEYS[SKY_KEYS.length - 1][1];
}

interface Drop {
  x: number;
  y: number;
  v: number;
  len: number;
}
// 雨粒は見た目だけの飾り(ゲームの状態には影響しない)
const drops: Drop[] = Array.from({ length: 140 }, () => ({
  x: Math.random() * WORLD_W,
  y: Math.random() * WORLD_H,
  v: 420 + Math.random() * 260,
  len: 9 + Math.random() * 8,
}));
let lastTime = 0;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

const SEED: Record<CharId, number> = { aoi: 0.3, mina: 1.7, ren: 2.9 };
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const TEXT_FONT = '"Hiragino Maru Gothic ProN","Yu Gothic UI","Meiryo",system-ui,sans-serif';

interface Placed {
  id: CharId;
  x: number;
  y: number;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxW && cur) {
      lines.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawBubble(ctx: CanvasRenderingContext2D, text: string, cx: number, tipY: number, color: string) {
  ctx.font = `12px ${TEXT_FONT}`;
  const lines = wrapText(ctx, text, 150).slice(0, 4);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
  const lh = 15;
  const h = lines.length * lh + 10;
  let x = cx - w / 2;
  x = Math.max(4, Math.min(WORLD_W - w - 4, x));
  const y = Math.max(4, tipY - h - 8);
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 5, y + h - 0.5);
  ctx.lineTo(cx, y + h + 7);
  ctx.lineTo(cx + 5, y + h - 0.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.fillRect(cx - 4, y + h - 2, 8, 3);
  ctx.fillStyle = '#4a3f35';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, x + 8, y + 5 + lh / 2 + i * lh));
}

export function drawFrame(ctx: CanvasRenderingContext2D, ground: CanvasImageSource, input: FrameInput): void {
  const { world, alpha, time, selected } = input;
  const dt = lastTime === 0 ? 0 : Math.min(0.1, Math.max(0, time - lastTime));
  lastTime = time;
  ctx.drawImage(ground, 0, 0, WORLD_W, WORLD_H);

  // ---- キャラクターの位置(補間) ----
  const placed: Placed[] = CHAR_IDS.map((id) => {
    const c = world.chars[id];
    const a = Math.min(1, Math.max(0, alpha));
    const x = lerp(c.prev.x, c.pos.x, a);
    const y = lerp(c.prev.y, c.pos.y, a);
    return { id, x: (x + 0.5) * TILE, y: (y + 0.88) * TILE };
  });
  // 同じマスに重なったら、少しずらす
  for (let i = 0; i < placed.length; i++) {
    for (let j = 0; j < i; j++) {
      if (Math.abs(placed[i].x - placed[j].x) < 14 && Math.abs(placed[i].y - placed[j].y) < 10) {
        placed[i].x += i % 2 === 0 ? 9 : -9;
      }
    }
  }
  placed.sort((a, b) => a.y - b.y);

  // ---- キャラクター ----
  for (const p of placed) {
    const c = world.chars[p.id];
    const look = PROFILES[p.id].look;
    const sprite: SpriteState = {
      id: p.id,
      facing: c.facing,
      activity: c.activity,
      mood: c.mood,
      time,
      seed: SEED[p.id],
    };
    if (c.activity === 'sleeping') {
      const bed = SPOTS.find((s) => s.kind === 'bed' && s.owner === p.id)!;
      ctx.save();
      ctx.translate(bed.pos.x * TILE, bed.pos.y * TILE);
      drawSleeper(ctx, sprite);
      ctx.restore();
      continue;
    }
    // 影
    ctx.fillStyle = 'rgba(40,30,20,0.2)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1, 10, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (selected === p.id) {
      ctx.strokeStyle = look.ui;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, 15, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    drawCharacter(ctx, sprite);
    ctx.restore();
  }

  // ---- 選択中のキャラの道すじ(行き先が見える) ----
  if (selected) {
    const c = world.chars[selected];
    if (c.plan?.stage === 'travel' && c.path.length > 0) {
      const col = PROFILES[selected].look.ui;
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 3;
      ctx.setLineDash([2, 7]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo((c.pos.x + 0.5) * TILE, (c.pos.y + 0.5) * TILE);
      for (const p of c.path) ctx.lineTo((p.x + 0.5) * TILE, (p.y + 0.5) * TILE);
      ctx.stroke();
      ctx.setLineDash([]);
      const end = c.path[c.path.length - 1];
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc((end.x + 0.5) * TILE, (end.y + 0.5) * TILE, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- 昼夜・天候の色 ----
  const minute = minuteOfDay(world.tick);
  const tint = skyTint(minute);
  if (tint[3] > 0.005) {
    ctx.fillStyle = `rgba(${tint[0] | 0},${tint[1] | 0},${tint[2] | 0},${tint[3].toFixed(3)})`;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }
  // 夜は建物の中があたたかく光る
  if (tint[3] > 0.18) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const pl of PLACES) {
      if (!pl.indoor) continue;
      const cx = (pl.rect.x + pl.rect.w / 2) * TILE;
      const cy = (pl.rect.y + pl.rect.h / 2) * TILE;
      const r = Math.max(pl.rect.w, pl.rect.h) * TILE * 0.62;
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
      g.addColorStop(0, `rgba(255,214,140,${Math.min(0.55, tint[3]).toFixed(2)})`);
      g.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
  }
  const wx = world.weather.current;
  if (wx !== 'sunny') {
    ctx.fillStyle = wx === 'rainy' ? 'rgba(70,85,110,0.2)' : 'rgba(110,120,140,0.07)';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // ゆっくり流れる雲の影(ふちをぼかして、汚れに見えないように)
    for (let i = 0; i < 3; i++) {
      const cx = ((time * 5 + i * 330) % (WORLD_W + 400)) - 200;
      const cy = 110 + i * 190;
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 150);
      g.addColorStop(0, 'rgba(60,70,90,0.07)');
      g.addColorStop(1, 'rgba(60,70,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 160, cy - 160, 320, 320);
    }
  }
  if (wx === 'rainy') {
    ctx.strokeStyle = 'rgba(190,215,245,0.65)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (const d of drops) {
      if (!input.paused) {
        d.y += d.v * dt;
        d.x -= d.v * dt * 0.18;
      }
      if (d.y > WORLD_H) {
        d.y = -20;
        d.x = Math.random() * (WORLD_W + 100);
      }
      if (d.x < -10) d.x = WORLD_W;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * 0.18, d.y - d.len);
    }
    ctx.stroke();
  }

  // ---- 名札・行動アイコン・吹き出し(色の影響を受けないよう最後に) ----
  for (const p of placed) {
    const c = world.chars[p.id];
    const look = PROFILES[p.id].look;
    const sleeping = c.activity === 'sleeping';
    const bed = sleeping ? SPOTS.find((s) => s.kind === 'bed' && s.owner === p.id)!.pos : null;
    const px = bed ? bed.x * TILE + 16 : p.x;
    const footY = bed ? bed.y * TILE + 34 : p.y;
    // 名札
    ctx.font = `700 10px ${TEXT_FONT}`;
    const name = PROFILES[p.id].name;
    const nw = ctx.measureText(name).width + 10;
    ctx.fillStyle = look.ui;
    ctx.beginPath();
    ctx.roundRect(px - nw / 2, footY + 4, nw, 13, 6.5);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, px, footY + 10.8);
    const headY = bed ? bed.y * TILE - 4 : p.y - 46;
    if (c.bubble && c.bubble.untilTick > world.tick) {
      drawBubble(ctx, c.bubble.text, px, headY, look.ui);
    } else {
      // 行動アイコン
      const icon = sleeping ? '💤' : ACTIVITY_ICON[c.activity];
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(px, headY - 3, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = look.ui;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.font = `11px ${EMOJI_FONT}`;
      ctx.fillStyle = '#000';
      ctx.fillText(icon, px, headY - 2.5);
    }
  }
}
