// マップの「動かない部分」(地面・道・建物・家具・木)を描く。サイズが変わったときだけ描き直す。
// 単位は論理ピクセル(1タイル = TILE)。呼び出し側が拡大率をかける。

import { FURNITURE, MAP_H, MAP_W, PLACES, SPOTS, TILES, placeAt, type Place } from '../../sim/map';
import { PROFILES } from '../../sim/profiles';
import type { CharId } from '../../sim/types';

export const TILE = 32;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

/** 座標から決まる疑似乱数(0〜1)。見た目のばらつき用で、シミュレーションとは無関係 */
export function hash2(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const WALL_COLOR: Record<string, string> = {
  home_aoi: '#8aa6d8',
  home_mina: '#f2b07a',
  home_ren: '#86cfb0',
  office: '#9aa5bb',
  cafe: '#e79c8c',
};
const FLOOR_COLOR: Record<string, [string, string]> = {
  home: ['#ecd0a6', '#e3c498'],
  office: ['#e3e9f1', '#d8e0ea'],
  cafe: ['#f3dcb8', '#ead0a8'],
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function isRoad(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && TILES[y][x] === 'road';
}

function drawGrass(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#cfe9b3';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const h = hash2(x, y);
      if (h < 0.28) {
        ctx.fillStyle = 'rgba(120,180,110,0.13)';
        rr(ctx, x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6, 9);
        ctx.fill();
      }
      if (h > 0.9) {
        const fx = x * TILE + 6 + hash2(x, y, 1) * 20;
        const fy = y * TILE + 6 + hash2(x, y, 2) * 20;
        ctx.fillStyle = ['#ffffff', '#ffd6e0', '#fff1a8'][Math.floor(hash2(x, y, 3) * 3)];
        ctx.beginPath();
        ctx.arc(fx, fy, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (h > 0.45 && h < 0.55) {
        ctx.strokeStyle = 'rgba(90,150,90,0.35)';
        ctx.lineWidth = 1.2;
        const gx = x * TILE + 10 + hash2(x, y, 4) * 12;
        const gy = y * TILE + 18 + hash2(x, y, 5) * 8;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx - 1.5, gy - 4);
        ctx.moveTo(gx + 2, gy);
        ctx.lineTo(gx + 3, gy - 5);
        ctx.stroke();
      }
    }
  }
}

function drawRoads(ctx: CanvasRenderingContext2D) {
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (!isRoad(x, y)) continue;
      ctx.fillStyle = '#c6c9d3';
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      // ふち取り
      ctx.fillStyle = '#d8dae2';
      if (!isRoad(x, y - 1)) ctx.fillRect(x * TILE, y * TILE, TILE, 3);
      if (!isRoad(x, y + 1)) ctx.fillRect(x * TILE, y * TILE + TILE - 3, TILE, 3);
      if (!isRoad(x - 1, y)) ctx.fillRect(x * TILE, y * TILE, 3, TILE);
      if (!isRoad(x + 1, y)) ctx.fillRect(x * TILE + TILE - 3, y * TILE, 3, TILE);
    }
  }
  ctx.fillStyle = '#f6f2e6';
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (!isRoad(x, y)) continue;
      const h = isRoad(x - 1, y) && isRoad(x + 1, y);
      const v = isRoad(x, y - 1) && isRoad(x, y + 1);
      if (h && !v && x % 2 === 0) ctx.fillRect(x * TILE + 6, y * TILE + TILE / 2 - 1.2, TILE - 12, 2.4);
      if (v && !h && y % 2 === 0) ctx.fillRect(x * TILE + TILE / 2 - 1.2, y * TILE + 6, 2.4, TILE - 12);
    }
  }
}

function drawPlaza(ctx: CanvasRenderingContext2D, plaza: Place) {
  for (let y = plaza.rect.y; y < plaza.rect.y + plaza.rect.h; y++) {
    for (let x = plaza.rect.x; x < plaza.rect.x + plaza.rect.w; x++) {
      if (TILES[y][x] !== 'pave' && TILES[y][x] !== 'furniture' && TILES[y][x] !== 'tree') continue;
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f0ddbf' : '#ead4b1';
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }
  // 噴水
  const cx = 14 * TILE;
  const cy = 12 * TILE;
  ctx.fillStyle = '#d9d2c3';
  ctx.beginPath();
  ctx.arc(cx, cy, 31, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a9dcf0';
  ctx.beginPath();
  ctx.arc(cx, cy, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.6;
  for (const r of [10, 17]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#d9d2c3';
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8f7ff';
  ctx.beginPath();
  ctx.arc(cx, cy - 2, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawPark(ctx: CanvasRenderingContext2D, park: Place) {
  ctx.fillStyle = '#c0e3a0';
  ctx.fillRect(park.rect.x * TILE, park.rect.y * TILE, park.rect.w * TILE, park.rect.h * TILE);
  // 砂の小道
  ctx.fillStyle = '#ecdcb0';
  for (const [x, y] of [
    [4, 8],
    [4, 9],
    [4, 10],
    [4, 11],
    [4, 12],
    [4, 13],
    [3, 12],
    [3, 11],
    [5, 9],
    [6, 9],
    [3, 13],
    [2, 10],
  ]) {
    if (TILES[y][x] === 'tree' || TILES[y][x] === 'water') continue;
    rr(ctx, x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6, 10);
    ctx.fill();
  }
  // 池
  ctx.fillStyle = '#a4d6ea';
  rr(ctx, 5 * TILE + 1, 11 * TILE + 1, 2 * TILE - 2, 2 * TILE - 2, 22);
  ctx.fill();
  ctx.strokeStyle = '#8dc3d9';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(5 * TILE + 22, 11 * TILE + 24, 9, 0.2, 2.4);
  ctx.stroke();
  ctx.fillStyle = '#7cc07c';
  ctx.beginPath();
  ctx.ellipse(6 * TILE + 10, 12 * TILE + 8, 6, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffb3c6';
  ctx.beginPath();
  ctx.arc(6 * TILE + 10, 12 * TILE + 6, 2.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const cx = x * TILE + TILE / 2;
  const by = y * TILE + TILE - 4;
  const s = 0.9 + hash2(x, y, 7) * 0.2;
  ctx.fillStyle = 'rgba(40,80,50,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx, by, 13 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8b6b4a';
  ctx.fillRect(cx - 3, by - 14 * s, 6, 14 * s);
  const crown = hash2(x, y, 8) > 0.5 ? ['#62b36a', '#7ccc82'] : ['#58a867', '#74c17a'];
  ctx.fillStyle = crown[0];
  ctx.beginPath();
  ctx.arc(cx, by - 22 * s, 14 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = crown[1];
  ctx.beginPath();
  ctx.arc(cx - 4 * s, by - 26 * s, 8 * s, 0, Math.PI * 2);
  ctx.fill();
  if (hash2(x, y, 9) > 0.7) {
    ctx.fillStyle = '#ff8a8a';
    for (const [dx, dy] of [
      [6, -20],
      [-7, -16],
      [2, -30],
    ]) {
      ctx.beginPath();
      ctx.arc(cx + dx * s, by + dy * s, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBuilding(ctx: CanvasRenderingContext2D, p: Place) {
  const { x, y, w, h } = p.rect;
  const kind = p.kind === 'home' ? 'home' : p.kind;
  const [f1, f2] = FLOOR_COLOR[kind];
  const wall = WALL_COLOR[p.id];
  // 床
  for (let ty = y + 1; ty < y + h - 1; ty++) {
    for (let tx = x + 1; tx < x + w - 1; tx++) {
      if (kind === 'cafe') ctx.fillStyle = (tx + ty) % 2 === 0 ? f1 : f2;
      else if (kind === 'office') ctx.fillStyle = (tx + ty) % 2 === 0 ? f1 : f2;
      else ctx.fillStyle = ty % 2 === 0 ? f1 : f2;
      ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
  }
  // 壁(外周のタイル)
  ctx.fillStyle = wall;
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (TILES[ty][tx] === 'wall') ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
  }
  // 屋根のふち・影
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x * TILE, y * TILE, w * TILE, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.fillRect(x * TILE, (y + h) * TILE - 6, w * TILE, 6);
  ctx.fillRect(x * TILE, y * TILE + 5, 4, h * TILE - 11);
  ctx.fillRect((x + w) * TILE - 4, y * TILE + 5, 4, h * TILE - 11);
  // 内側の影(壁の下に落ちる影)
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.fillRect((x + 1) * TILE, (y + 1) * TILE, (w - 2) * TILE, 6);
  // ドア
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (TILES[ty][tx] !== 'door') continue;
      ctx.fillStyle = f1;
      ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      ctx.fillStyle = '#b07a52';
      rr(ctx, tx * TILE + 4, ty * TILE + 2, TILE - 8, TILE - 4, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      rr(ctx, tx * TILE + 8, ty * TILE + 6, TILE - 16, TILE - 12, 4);
      ctx.fill();
      ctx.fillStyle = '#f5d98a';
      ctx.beginPath();
      ctx.arc(tx * TILE + TILE - 10, ty * TILE + TILE / 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 窓(上の壁)
  ctx.fillStyle = 'rgba(235,248,255,0.85)';
  for (let tx = x + 1; tx < x + w - 1; tx += 2) {
    if (TILES[y][tx] !== 'wall') continue;
    rr(ctx, tx * TILE + 6, y * TILE + 9, TILE - 12, 13, 3);
    ctx.fill();
  }
}

function drawFurniture(ctx: CanvasRenderingContext2D) {
  // スポット(ベッド・椅子など)
  for (const s of SPOTS) {
    const px = s.pos.x * TILE;
    const py = s.pos.y * TILE;
    const owner = s.owner ? (s.owner as CharId) : null;
    const col = owner ? PROFILES[owner].look.ui : '#b88a5e';
    switch (s.kind) {
      case 'bed': {
        ctx.fillStyle = '#fffaf0';
        rr(ctx, px + 2, py + 2, TILE - 4, TILE - 4, 6);
        ctx.fill();
        ctx.fillStyle = col;
        rr(ctx, px + 2, py + 13, TILE - 4, TILE - 15, 6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        rr(ctx, px + 6, py + 4, TILE - 12, 8, 4);
        ctx.fill();
        break;
      }
      case 'sofa': {
        ctx.fillStyle = '#d9a7a0';
        rr(ctx, px + 2, py + 6, TILE - 4, TILE - 10, 7);
        ctx.fill();
        ctx.fillStyle = '#e8bdb6';
        rr(ctx, px + 5, py + 10, TILE - 10, TILE - 16, 5);
        ctx.fill();
        break;
      }
      case 'chair':
      case 'seat': {
        ctx.fillStyle = '#c99a6a';
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + TILE / 2 + 2, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e1b887';
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + TILE / 2 + 1, 6, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'desk': {
        // 自分の机の前の椅子と、持ち主の色のマット
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.28;
        rr(ctx, px + 1, py + 1, TILE - 2, TILE - 2, 8);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#7d8aa3';
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + TILE / 2 + 3, 8, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'break': {
        ctx.fillStyle = '#9fc7a8';
        rr(ctx, px + 2, py + 6, TILE - 4, TILE - 10, 7);
        ctx.fill();
        ctx.fillStyle = '#b7dcc0';
        rr(ctx, px + 5, py + 10, TILE - 10, TILE - 16, 5);
        ctx.fill();
        break;
      }
      case 'bench': {
        ctx.fillStyle = '#9b7350';
        ctx.fillRect(px + 3, py + 12, TILE - 6, 5);
        ctx.fillStyle = '#b98d62';
        ctx.fillRect(px + 3, py + 17, TILE - 6, 5);
        ctx.fillStyle = '#7a5a3d';
        ctx.fillRect(px + 5, py + 22, 3, 5);
        ctx.fillRect(px + TILE - 8, py + 22, 3, 5);
        break;
      }
      default:
        break;
    }
  }
  for (const f of FURNITURE) {
    const px = f.x * TILE;
    const py = f.y * TILE;
    const place = placeAt({ x: f.x, y: f.y });
    switch (f.kind) {
      case 'desk': {
        ctx.fillStyle = '#b98d62';
        rr(ctx, px + 1, py + 6, TILE - 2, TILE - 8, 4);
        ctx.fill();
        ctx.fillStyle = '#2f3a4d';
        rr(ctx, px + 8, py + 8, 16, 11, 2);
        ctx.fill();
        ctx.fillStyle = '#9ad4f0';
        ctx.fillRect(px + 10, py + 10, 12, 7);
        ctx.fillStyle = '#e8eef5';
        ctx.fillRect(px + 8, py + 22, 16, 3);
        break;
      }
      case 'shelf': {
        ctx.fillStyle = '#a97c52';
        rr(ctx, px + 2, py + 4, TILE - 4, TILE - 6, 3);
        ctx.fill();
        const colors = ['#e76f6f', '#f4c542', '#6fa8dc', '#8bc58b', '#c490d1'];
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = colors[i];
          ctx.fillRect(px + 5 + i * 4.6, py + 7, 3.4, 8);
          ctx.fillStyle = colors[(i + 2) % 5];
          ctx.fillRect(px + 5 + i * 4.6, py + 18, 3.4, 7);
        }
        break;
      }
      case 'table': {
        if (place?.kind === 'cafe') {
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.beginPath();
          ctx.ellipse(px + 16, py + 24, 13, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fffaf0';
          ctx.beginPath();
          ctx.arc(px + 16, py + 16, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#e9a58f';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = '#7a5440';
          ctx.beginPath();
          ctx.arc(px + 13, py + 15, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(px + 20, py + 18, 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#b98d62';
          rr(ctx, px + 3, py + 5, TILE - 6, TILE - 9, 5);
          ctx.fill();
          ctx.fillStyle = '#fff4e0';
          ctx.beginPath();
          ctx.arc(px + 16, py + 15, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'counter': {
        ctx.fillStyle = '#9b6f4e';
        rr(ctx, px, py + 4, TILE, TILE - 6, 3);
        ctx.fill();
        ctx.fillStyle = '#e8c9a0';
        ctx.fillRect(px, py + 4, TILE, 6);
        if (f.x === 25) {
          ctx.fillStyle = '#d96a5f';
          rr(ctx, px + 8, py - 2, 16, 12, 3);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillRect(px + 12, py + 1, 8, 2);
        }
        break;
      }
      case 'coffee': {
        ctx.fillStyle = '#6b6f7e';
        rr(ctx, px + 7, py + 4, 18, 24, 3);
        ctx.fill();
        ctx.fillStyle = '#d96a5f';
        ctx.fillRect(px + 10, py + 8, 12, 5);
        ctx.fillStyle = '#fff';
        ctx.fillRect(px + 12, py + 18, 8, 7);
        break;
      }
      default:
        break;
    }
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, bg: string, fg = '#fff') {
  ctx.font = '700 11px "Hiragino Maru Gothic ProN","Yu Gothic UI",system-ui,sans-serif';
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = bg;
  rr(ctx, cx - w / 2, cy - 8, w, 16, 8);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 0.5);
}

export function drawStaticLayer(ctx: CanvasRenderingContext2D): void {
  drawGrass(ctx);
  const plaza = PLACES.find((p) => p.kind === 'plaza')!;
  const park = PLACES.find((p) => p.kind === 'park')!;
  drawPark(ctx, park);
  drawRoads(ctx);
  drawPlaza(ctx, plaza);
  // 玄関前の舗装
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (TILES[y][x] === 'pave' && !placeAt({ x, y })) {
        ctx.fillStyle = '#eadbbd';
        rr(ctx, x * TILE + 1, y * TILE, TILE - 2, TILE, 4);
        ctx.fill();
      }
    }
  }
  for (const p of PLACES) if (p.indoor) drawBuilding(ctx, p);
  drawFurniture(ctx);
  // 木(奥の行から順に)
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (TILES[y][x] === 'tree') drawTree(ctx, x, y);

  // 看板
  for (const p of PLACES) {
    if (!p.indoor) continue;
    const cx = (p.rect.x + p.rect.w / 2) * TILE;
    label(ctx, p.name, cx, p.rect.y * TILE + 12, 'rgba(70,60,50,0.55)');
  }
  label(ctx, '住宅エリア', 8.5 * TILE, 12, '#7d6a58');
  label(ctx, '公園', 4 * TILE + 16, 8 * TILE + 12, '#4f9a5c');
  label(ctx, '広場', 13.5 * TILE + 16, 8 * TILE + 12, '#c08a4a');
}
