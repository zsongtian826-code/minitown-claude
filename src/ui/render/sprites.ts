// キャラクターのドット絵風イラスト(キャンバスで描く)。足元を原点(0,0)にして、頭が上に伸びる。
// 3人は髪型・髪色・服・小物ではっきり見分けられるようにしてある。

import type { Activity, CharId } from '../../sim/types';
import { PROFILES } from '../../sim/profiles';

const SKIN = '#ffe2c8';
const SKIN_SHADE = '#f2c9a8';
const OUTLINE = 'rgba(70,45,35,0.55)';

export interface SpriteState {
  id: CharId;
  facing: 1 | -1;
  activity: Activity;
  mood: number;
  /** アニメーション用の時間(秒) */
  time: number;
  /** 歩いているときの位相のずらし(キャラごと) */
  seed: number;
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function face(ctx: CanvasRenderingContext2D, s: SpriteState, cy: number, sleeping: boolean) {
  const blink = !sleeping && (s.time + s.seed) % 4.3 < 0.13;
  ctx.strokeStyle = '#3b2b25';
  ctx.fillStyle = '#3b2b25';
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  if (sleeping || blink) {
    for (const ex of [-3.5, 3.5]) {
      ctx.beginPath();
      ctx.arc(ex, cy, 1.6, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  } else {
    for (const ex of [-3.5, 3.5]) {
      ellipse(ctx, ex, cy, 1.25, 1.6);
      ctx.fill();
    }
  }
  if (s.mood >= 72 && !sleeping) {
    ctx.fillStyle = 'rgba(255,130,150,0.45)';
    for (const ex of [-5.6, 5.6]) {
      ellipse(ctx, ex, cy + 2.6, 2, 1.2);
      ctx.fill();
    }
  }
  // 口
  const my = cy + 4.2;
  ctx.strokeStyle = '#7a3b30';
  ctx.fillStyle = '#c4574a';
  ctx.lineWidth = 1.2;
  if (s.activity === 'chatting' && Math.floor((s.time + s.seed) / 0.2) % 2 === 0) {
    ellipse(ctx, 0, my, 1.7, 1.9);
    ctx.fill();
  } else if (s.activity === 'eating' && Math.floor((s.time + s.seed) / 0.35) % 2 === 0) {
    ellipse(ctx, 0, my, 1.4, 1.4);
    ctx.fill();
  } else if (sleeping) {
    ellipse(ctx, 0, my, 1, 0.8);
    ctx.fill();
  } else if (s.mood >= 62) {
    ctx.beginPath();
    ctx.arc(0, my - 1.5, 2.6, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  } else if (s.mood >= 36) {
    ctx.beginPath();
    ctx.moveTo(-1.8, my);
    ctx.lineTo(1.8, my);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, my + 2.4, 2.4, 1.2 * Math.PI, 1.8 * Math.PI);
    ctx.stroke();
  }
}

function hairBack(ctx: CanvasRenderingContext2D, id: CharId, cy: number, sway: number) {
  const look = PROFILES[id].look;
  ctx.fillStyle = look.hairDark;
  if (id === 'aoi') {
    ellipse(ctx, 0, cy + 1.5, 10.2, 11);
    ctx.fill();
  } else if (id === 'mina') {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * 9.5, cy - 1);
      ctx.rotate(side * (0.25 + sway * 0.25));
      ctx.fillStyle = look.hair;
      ellipse(ctx, 0, 5, 3.6, 8);
      ctx.fill();
      ctx.restore();
    }
  } else {
    ellipse(ctx, 0, cy + 3, 10, 9);
    ctx.fill();
  }
}

function hairFront(ctx: CanvasRenderingContext2D, id: CharId, cy: number) {
  const look = PROFILES[id].look;
  ctx.fillStyle = look.hair;
  if (id === 'aoi') {
    ctx.beginPath();
    ctx.arc(0, cy, 9.4, Math.PI, Math.PI * 2);
    ctx.lineTo(9.4, cy + 1);
    ctx.quadraticCurveTo(0, cy - 5.5, -9.4, cy + 1);
    ctx.closePath();
    ctx.fill();
    // 前髪の流れ
    ctx.fillStyle = look.hairDark;
    ctx.beginPath();
    ctx.moveTo(-9, cy - 1);
    ctx.quadraticCurveTo(-4, cy - 6, 2, cy - 3.5);
    ctx.quadraticCurveTo(-3, cy - 2, -9, cy - 1);
    ctx.fill();
    // ヘアピン
    ctx.fillStyle = '#ffd25a';
    ctx.fillRect(4.5, cy - 7.2, 4.4, 1.9);
    // めがね
    ctx.strokeStyle = '#2f3550';
    ctx.lineWidth = 1;
    for (const ex of [-3.6, 3.6]) {
      ctx.beginPath();
      ctx.arc(ex, cy + 1.4, 3.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-0.5, cy + 1.2);
    ctx.lineTo(0.5, cy + 1.2);
    ctx.stroke();
  } else if (id === 'mina') {
    ctx.beginPath();
    ctx.arc(0, cy, 9.4, Math.PI, Math.PI * 2);
    ctx.lineTo(9.4, cy + 2);
    ctx.quadraticCurveTo(5, cy - 3, 0, cy - 1);
    ctx.quadraticCurveTo(-5, cy - 4, -9.4, cy + 2);
    ctx.closePath();
    ctx.fill();
    // 髪ゴム
    ctx.fillStyle = '#e24b5a';
    for (const side of [-1, 1]) {
      ellipse(ctx, side * 9, cy - 2, 2, 2);
      ctx.fill();
    }
  } else {
    // ツンツンした髪
    ctx.beginPath();
    ctx.arc(0, cy, 9.4, Math.PI, Math.PI * 2);
    ctx.lineTo(9.4, cy + 1);
    ctx.lineTo(7, cy - 2);
    ctx.lineTo(4, cy + 0.5);
    ctx.lineTo(1.5, cy - 3);
    ctx.lineTo(-1.5, cy + 0.5);
    ctx.lineTo(-4.5, cy - 2.5);
    ctx.lineTo(-7, cy + 0.5);
    ctx.lineTo(-9.4, cy + 1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    for (const [dx, dy] of [
      [-6, -8.5],
      [-1, -10.5],
      [5, -9],
    ]) {
      ctx.moveTo(dx - 2.6, cy + dy + 3);
      ctx.lineTo(dx, cy + dy - 3);
      ctx.lineTo(dx + 2.6, cy + dy + 3);
    }
    ctx.fill();
    // ヘッドホン
    ctx.strokeStyle = '#3a4150';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, cy + 1, 10.4, Math.PI * 1.02, Math.PI * 1.98);
    ctx.stroke();
    ctx.fillStyle = '#f4c542';
    for (const side of [-1, 1]) {
      ellipse(ctx, side * 10.2, cy + 2, 2.6, 3.6);
      ctx.fill();
      ctx.strokeStyle = '#c99a1f';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
}

function body(ctx: CanvasRenderingContext2D, id: CharId, walkSwing: number) {
  const look = PROFILES[id].look;
  // 脚
  ctx.fillStyle = id === 'ren' ? look.bottom : SKIN;
  for (const side of [-1, 1]) {
    const lift = walkSwing * side;
    ctx.fillRect(side * 3.2 - 1.6, -7 - Math.max(0, lift) * 1.5, 3.2, 7 + Math.min(0, lift) * 0.5);
  }
  // 靴
  ctx.fillStyle = id === 'aoi' ? '#3a3f55' : id === 'mina' ? '#b0453f' : '#f1efe8';
  for (const side of [-1, 1]) {
    const lift = walkSwing * side;
    ctx.fillRect(side * 3.2 - 2.2, -2 - Math.max(0, lift) * 1.5, 4.4, 2.6);
  }
  // 胴
  ctx.fillStyle = look.top;
  ctx.beginPath();
  ctx.roundRect(-7, -18, 14, 12, 4);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // 下半身の服
  ctx.fillStyle = look.bottom;
  if (id === 'ren') {
    ctx.fillStyle = look.topDark;
    ctx.beginPath();
    ctx.roundRect(-4.5, -11.5, 9, 4.5, 2);
    ctx.fill(); // パーカーのポケット
  } else {
    ctx.beginPath();
    ctx.moveTo(-7.5, -10);
    ctx.lineTo(7.5, -10);
    ctx.lineTo(9, -5.5);
    ctx.lineTo(-9, -5.5);
    ctx.closePath();
    ctx.fill();
  }
  // 服の個性
  if (id === 'aoi') {
    ctx.fillStyle = look.bottom; // ベスト
    ctx.fillRect(-7, -18, 3.6, 8);
    ctx.fillRect(3.4, -18, 3.6, 8);
    ctx.fillStyle = '#c94c4c'; // ネクタイ
    ctx.fillRect(-0.9, -17.5, 1.8, 6);
  } else if (id === 'mina') {
    ctx.fillStyle = look.topDark;
    ctx.fillRect(-0.5, -18, 1, 8);
    ctx.fillStyle = '#fff6d6';
    ellipse(ctx, 0, -17.5, 3, 1.4);
    ctx.fill();
  } else {
    ctx.strokeStyle = look.topDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1.8, -17.5);
    ctx.lineTo(-1.8, -13);
    ctx.moveTo(1.8, -17.5);
    ctx.lineTo(1.8, -13);
    ctx.stroke();
  }
  // 腕
  ctx.fillStyle = look.top;
  for (const side of [-1, 1]) {
    const swing = walkSwing * -side * 2.2;
    ctx.beginPath();
    ctx.roundRect(side * 8.2 - 1.8, -17 + swing * 0.3, 3.6, 8, 1.8);
    ctx.fill();
    ctx.fillStyle = SKIN;
    ellipse(ctx, side * 8.2, -8.6 + swing * 0.3, 1.9, 1.9);
    ctx.fill();
    ctx.fillStyle = look.top;
  }
}

/** 立っている・歩いている・座っているキャラクターを描く(足元が原点) */
export function drawCharacter(ctx: CanvasRenderingContext2D, s: SpriteState): void {
  const walking = s.activity === 'walking';
  const t = s.time + s.seed;
  const swing = walking ? Math.sin(t * 11) : 0;
  const bob = walking ? Math.abs(Math.sin(t * 11)) * 2.2 : Math.sin(t * 2.2) * 0.5;
  const sway = walking ? Math.sin(t * 11) : Math.sin(t * 1.7) * 0.4;
  ctx.save();
  ctx.translate(0, -bob);
  body(ctx, s.id, swing);
  const cy = -26;
  hairBack(ctx, s.id, cy, sway);
  // 頭
  ctx.fillStyle = SKIN;
  ellipse(ctx, 0, cy, 8.8, 8.4);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = SKIN_SHADE;
  ellipse(ctx, 0, cy + 8.2, 4, 1.4);
  ctx.fill();
  face(ctx, s, cy + 2, false);
  hairFront(ctx, s.id, cy - 1);
  ctx.restore();
}

/** ベッドで眠っている姿(ベッドのタイルの左上が原点、1タイル=32) */
export function drawSleeper(ctx: CanvasRenderingContext2D, s: SpriteState): void {
  const look = PROFILES[s.id].look;
  const breathe = Math.sin(s.time * 1.6 + s.seed) * 0.6;
  ctx.save();
  ctx.translate(16, 9);
  hairBack(ctx, s.id, 0, 0);
  ctx.fillStyle = SKIN;
  ellipse(ctx, 0, 0, 8, 7.4);
  ctx.fill();
  face(ctx, { ...s, activity: 'sleeping' }, 1, true);
  hairFront(ctx, s.id, -1);
  ctx.restore();
  // 掛け布団のふくらみ
  ctx.fillStyle = look.ui;
  ctx.beginPath();
  ctx.roundRect(3, 16 - breathe, 26, 13, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(5, 18 - breathe, 22, 2);
}
