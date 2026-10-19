// シード付き乱数。シミュレーション本体はここから注入された Rng だけを使う(Math.random は使わない)。

export interface Rng {
  /** 0以上1未満の一様乱数 */
  next(): number;
  /** 内部状態(セーブ用)。32bit符号なし整数 */
  getState(): number;
  setState(state: number): void;
}

/** mulberry32: 小さくて速く、状態が32bit整数1つで済むので保存しやすい */
export class SeededRng implements Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  getState(): number {
    return this.s;
  }

  setState(state: number): void {
    this.s = state >>> 0;
  }
}

/** [min, max] の整数 */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng.next() * (max - min + 1));
}

/** [min, max) の実数 */
export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min);
}

export function chance(rng: Rng, p: number): boolean {
  return rng.next() < p;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng.next() * items.length)];
}

/** 重み付き抽選。重みが全部0以下なら先頭を返す */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return items[0];
  let r = rng.next() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

/** 入力のシード文字列(数字ならそのまま、文字ならハッシュ)を32bit整数にする */
export function parseSeed(input: string | number): number {
  if (typeof input === 'number') return Math.floor(Math.abs(input)) >>> 0;
  const text = input.trim();
  if (text === '') return 12345;
  if (/^-?\d+$/.test(text)) return Math.abs(Number(text)) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
