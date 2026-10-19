// 街のマップ: タイル、場所(施設)、座る・寝るなどの「スポット」を定義する。
// 地図は固定データなので保存しない(コードから毎回同じものを作る)。

import type { CharId, Point } from './types';

export const MAP_W = 28;
export const MAP_H = 18;

export type Terrain =
  | 'grass'
  | 'road'
  | 'pave'
  | 'floor'
  | 'wall'
  | 'door'
  | 'tree'
  | 'water'
  | 'furniture';

export type PlaceKind = 'home' | 'office' | 'cafe' | 'park' | 'plaza';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Place {
  id: string;
  kind: PlaceKind;
  name: string;
  /** 壁を含む建物全体、または公園・広場の範囲 */
  rect: Rect;
  indoor: boolean;
  /** 入口。距離計算の基準にする */
  anchor: Point;
  owner?: CharId;
}

export type SpotKind = 'bed' | 'chair' | 'sofa' | 'desk' | 'break' | 'seat' | 'bench' | 'stroll';

export interface Spot {
  id: string;
  placeId: string;
  kind: SpotKind;
  pos: Point;
  owner?: CharId;
}

export type FurnitureKind = 'table' | 'shelf' | 'desk' | 'counter' | 'coffee' | 'fountain';

export interface Furniture {
  x: number;
  y: number;
  kind: FurnitureKind;
}

export const PLACE_KIND_NAME: Record<PlaceKind, string> = {
  home: '住宅エリア',
  office: 'オフィス',
  cafe: 'カフェ',
  park: '公園',
  plaza: '広場',
};

export const HOME_ID: Record<CharId, string> = {
  aoi: 'home_aoi',
  mina: 'home_mina',
  ren: 'home_ren',
};

const HOUSE_X: Record<CharId, number> = { aoi: 1, mina: 6, ren: 11 };
const HOUSE_NAME: Record<CharId, string> = { aoi: 'アオイの家', mina: 'ミナの家', ren: 'レンの家' };

export const PLACES: Place[] = [];
export const SPOTS: Spot[] = [];
export const FURNITURE: Furniture[] = [];

const tiles: Terrain[][] = [];
for (let y = 0; y < MAP_H; y++) {
  tiles.push(new Array<Terrain>(MAP_W).fill('grass'));
}

function setTile(x: number, y: number, t: Terrain) {
  tiles[y][x] = t;
}

function fillRect(r: Rect, t: Terrain) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) setTile(x, y, t);
}

function addPlace(p: Place) {
  PLACES.push(p);
}

function addSpot(placeId: string, kind: SpotKind, x: number, y: number, owner?: CharId) {
  SPOTS.push({ id: `${placeId}:${kind}:${x},${y}`, placeId, kind, pos: { x, y }, owner });
}

function addFurniture(x: number, y: number, kind: FurnitureKind) {
  FURNITURE.push({ x, y, kind });
  setTile(x, y, 'furniture');
}

/** 壁で囲った建物を作る。door は壁の上の座標 */
function building(rect: Rect, door: Point) {
  fillRect(rect, 'wall');
  fillRect({ x: rect.x + 1, y: rect.y + 1, w: rect.w - 2, h: rect.h - 2 }, 'floor');
  setTile(door.x, door.y, 'door');
}

// ---- 道路・広場 ----
for (let x = 0; x < MAP_W; x++) {
  setTile(x, 7, 'road');
  setTile(x, 16, 'road');
}
for (let y = 7; y <= 16; y++) {
  setTile(8, y, 'road');
  setTile(19, y, 'road');
}
fillRect({ x: 9, y: 8, w: 10, h: 8 }, 'pave');
// 玄関前の舗装
for (const p of [
  { x: 3, y: 6 },
  { x: 8, y: 6 },
  { x: 13, y: 6 },
  { x: 21, y: 6 },
  { x: 23, y: 9 },
  { x: 23, y: 8 },
]) {
  setTile(p.x, p.y, 'pave');
}

// ---- 住宅(3軒) ----
for (const id of ['aoi', 'mina', 'ren'] as const) {
  const x0 = HOUSE_X[id];
  const placeId = HOME_ID[id];
  const rect = { x: x0, y: 1, w: 5, h: 5 };
  building(rect, { x: x0 + 2, y: 5 });
  addPlace({
    id: placeId,
    kind: 'home',
    name: HOUSE_NAME[id],
    rect,
    indoor: true,
    anchor: { x: x0 + 2, y: 5 },
    owner: id,
  });
  const ix = x0 + 1;
  addFurniture(ix + 1, 2, 'shelf');
  addFurniture(ix + 2, 2, 'table');
  addSpot(placeId, 'bed', ix, 2, id);
  addSpot(placeId, 'chair', ix + 2, 3, id);
  addSpot(placeId, 'sofa', ix, 4, id);
}

// ---- オフィス ----
{
  const rect = { x: 17, y: 1, w: 10, h: 5 };
  building(rect, { x: 21, y: 5 });
  addPlace({
    id: 'office',
    kind: 'office',
    name: 'オフィス',
    rect,
    indoor: true,
    anchor: { x: 21, y: 5 },
  });
  for (const x of [19, 22, 25]) addFurniture(x, 2, 'desk');
  addFurniture(18, 2, 'coffee');
  addSpot('office', 'desk', 19, 3, 'aoi');
  addSpot('office', 'desk', 22, 3, 'mina');
  addSpot('office', 'desk', 25, 3, 'ren');
  addSpot('office', 'break', 18, 4);
  addSpot('office', 'break', 24, 4);
}

// ---- カフェ ----
{
  const rect = { x: 20, y: 10, w: 7, h: 6 };
  building(rect, { x: 23, y: 10 });
  addPlace({
    id: 'cafe',
    kind: 'cafe',
    name: 'カフェ',
    rect,
    indoor: true,
    anchor: { x: 23, y: 10 },
  });
  addFurniture(22, 12, 'table');
  addFurniture(24, 12, 'table');
  addFurniture(24, 14, 'counter');
  addFurniture(25, 14, 'counter');
  for (const [x, y] of [
    [22, 13],
    [24, 13],
    [21, 12],
    [25, 12],
    [22, 11],
    [24, 11],
  ]) {
    addSpot('cafe', 'seat', x, y);
  }
}

// ---- 公園 ----
{
  const rect = { x: 1, y: 8, w: 7, h: 8 };
  addPlace({
    id: 'park',
    kind: 'park',
    name: '公園',
    rect,
    indoor: false,
    anchor: { x: 4, y: 8 },
  });
  for (const [x, y] of [
    [1, 8],
    [7, 8],
    [1, 11],
    [1, 14],
    [2, 15],
    [4, 15],
    [7, 13],
    [7, 15],
    [3, 10],
  ]) {
    setTile(x, y, 'tree');
  }
  for (const [x, y] of [
    [5, 11],
    [6, 11],
    [5, 12],
    [6, 12],
  ]) {
    setTile(x, y, 'water');
  }
  addSpot('park', 'bench', 2, 10);
  addSpot('park', 'bench', 3, 13);
  addSpot('park', 'bench', 6, 14);
  addSpot('park', 'bench', 5, 9);
  addSpot('park', 'stroll', 4, 12);
  addSpot('park', 'stroll', 6, 9);
  addSpot('park', 'stroll', 3, 11);
}

// ---- 広場 ----
{
  const rect = { x: 9, y: 8, w: 10, h: 8 };
  addPlace({
    id: 'plaza',
    kind: 'plaza',
    name: '広場',
    rect,
    indoor: false,
    anchor: { x: 13, y: 8 },
  });
  for (const [x, y] of [
    [13, 11],
    [14, 11],
    [13, 12],
    [14, 12],
  ]) {
    addFurniture(x, y, 'fountain');
  }
  for (const [x, y] of [
    [9, 8],
    [18, 8],
    [9, 15],
    [18, 15],
  ]) {
    setTile(x, y, 'tree');
  }
  addSpot('plaza', 'bench', 11, 10);
  addSpot('plaza', 'bench', 16, 10);
  addSpot('plaza', 'bench', 11, 13);
  addSpot('plaza', 'bench', 16, 13);
  addSpot('plaza', 'stroll', 12, 9);
  addSpot('plaza', 'stroll', 15, 14);
  addSpot('plaza', 'stroll', 10, 12);
  addSpot('plaza', 'stroll', 17, 12);
}

// ---- 飾りの木(通れない) ----
for (const [x, y] of [
  [2, 0],
  [12, 0],
  [18, 0],
  [23, 0],
  [27, 3],
  [27, 9],
  [27, 13],
  [0, 3],
  [0, 10],
  [3, 17],
  [9, 17],
  [15, 17],
  [21, 17],
  [26, 17],
  [5, 6],
  [10, 6],
  [16, 6],
  [18, 6],
  [24, 8],
  [26, 8],
]) {
  setTile(x, y, 'tree');
}

export const TILES: readonly (readonly Terrain[])[] = tiles;

const placeGrid: (string | null)[][] = [];
for (let y = 0; y < MAP_H; y++) placeGrid.push(new Array<string | null>(MAP_W).fill(null));
for (const p of PLACES) {
  for (let y = p.rect.y; y < p.rect.y + p.rect.h; y++) {
    for (let x = p.rect.x; x < p.rect.x + p.rect.w; x++) placeGrid[y][x] = p.id;
  }
}

const placeById = new Map<string, Place>(PLACES.map((p) => [p.id, p]));

export function getPlace(id: string): Place {
  const p = placeById.get(id);
  if (!p) throw new Error(`unknown place: ${id}`);
  return p;
}

export function hasPlace(id: string): boolean {
  return placeById.has(id);
}

export function inBounds(p: Point): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < MAP_W && p.y < MAP_H;
}

export function terrainAt(p: Point): Terrain {
  return tiles[p.y][p.x];
}

export function isWalkable(p: Point): boolean {
  if (!inBounds(p)) return false;
  const t = tiles[p.y][p.x];
  return t !== 'wall' && t !== 'tree' && t !== 'water' && t !== 'furniture';
}

/** 歩くときの重み。道・床は1、草地は少し重くして、道を選びやすくする */
export function moveCost(p: Point): number {
  const t = tiles[p.y][p.x];
  return t === 'grass' ? 2 : 1;
}

/** その座標がどの施設の範囲か。街路・空き地なら null */
export function placeAt(p: Point): Place | null {
  if (!inBounds(p)) return null;
  const id = placeGrid[p.y][p.x];
  return id ? getPlace(id) : null;
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export function chebyshev(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function spotsOf(placeId: string, kinds?: readonly SpotKind[]): Spot[] {
  return SPOTS.filter((s) => s.placeId === placeId && (!kinds || kinds.includes(s.kind)));
}

// ---- 経路探索 ----

const DIRS: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size() {
    return this.vals.length;
  }

  push(key: number, val: number) {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (k[parent] <= k[i]) break;
      [k[parent], k[i]] = [k[i], k[parent]];
      [v[parent], v[i]] = [v[i], v[parent]];
      i = parent;
    }
  }

  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    if (k.length > 0) {
      k[0] = lastK;
      v[0] = lastV;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * A* で from から to までの経路を求める(4方向)。
 * 戻り値は from を含まない、to を含む点の列。すでに到着しているなら空配列。到達できなければ null。
 * 同じコストのときは番号順に決まるので、結果はいつも同じになる。
 */
export function findPath(from: Point, to: Point): Point[] | null {
  if (!isWalkable(from) || !isWalkable(to)) return null;
  if (samePoint(from, to)) return [];
  const n = MAP_W * MAP_H;
  const idx = (p: Point) => p.y * MAP_W + p.x;
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = new MinHeap();
  const h = (x: number, y: number) => Math.abs(x - to.x) + Math.abs(y - to.y);
  const start = idx(from);
  const goal = idx(to);
  g[start] = 0;
  // key = f * 4096 + h(同点ならゴールに近い方を優先) だけで順序を固定する
  open.push(h(from.x, from.y) * 4096 + h(from.x, from.y), start);
  while (open.size > 0) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) break;
    const cx = cur % MAP_W;
    const cy = (cur - cx) / MAP_W;
    for (const d of DIRS) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      const np = { x: nx, y: ny };
      if (!isWalkable(np)) continue;
      const ni = idx(np);
      if (closed[ni]) continue;
      const ng = g[cur] + moveCost(np);
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        const hh = h(nx, ny);
        open.push((ng + hh) * 4096 + hh, ni);
      }
    }
  }
  if (came[goal] === -1) return null;
  const path: Point[] = [];
  for (let c = goal; c !== start; c = came[c]) {
    path.push({ x: c % MAP_W, y: Math.floor(c / MAP_W) });
  }
  path.reverse();
  return path;
}

// ---- 距離(歩数)の目安: 各施設の入口からのBFS ----

const distFields = new Map<string, Int16Array>();

function distanceField(placeId: string): Int16Array {
  const cached = distFields.get(placeId);
  if (cached) return cached;
  const field = new Int16Array(MAP_W * MAP_H).fill(-1);
  const a = getPlace(placeId).anchor;
  const queue: Point[] = [a];
  field[a.y * MAP_W + a.x] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    for (const d of DIRS) {
      const np = { x: c.x + d.x, y: c.y + d.y };
      if (!isWalkable(np)) continue;
      const i = np.y * MAP_W + np.x;
      if (field[i] !== -1) continue;
      field[i] = field[c.y * MAP_W + c.x] + 1;
      queue.push(np);
    }
  }
  distFields.set(placeId, field);
  return field;
}

/** from から施設の入口までのおよその歩数(施設の中の移動を少し足す)。行けないなら Infinity */
export function travelSteps(from: Point, placeId: string): number {
  const d = distanceField(placeId)[from.y * MAP_W + from.x];
  if (d < 0) return Infinity;
  return d + (getPlace(placeId).indoor ? 3 : 2);
}

/** 施設の中で空いているタイルのうち、near に一番近いもの(スポットが埋まっているときの代わり) */
export function nearestOpenTile(placeId: string, near: Point, taken: (p: Point) => boolean): Point | null {
  const place = getPlace(placeId);
  let best: Point | null = null;
  let bestD = Infinity;
  for (let y = place.rect.y; y < place.rect.y + place.rect.h; y++) {
    for (let x = place.rect.x; x < place.rect.x + place.rect.w; x++) {
      const p = { x, y };
      if (!isWalkable(p) || terrainAt(p) === 'door' || taken(p)) continue;
      const d = manhattan(p, near);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

export function neighbors8(p: Point): Point[] {
  const out: Point[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      out.push({ x: p.x + dx, y: p.y + dy });
    }
  }
  return out;
}
