// 状態変化のルール。空腹度・疲労度・気分(0〜100)が、1分(1tick)ごとに何をきっかけに
// どれだけ変わるかを、ここの表と式にまとめている。

import type { Activity, CharState, Weather } from './types';
import { getPlace, placeAt } from './map';
import { profileOf } from './profiles';

export function clamp100(v: number): number {
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** なめらかに0→1へ変わる関数(x が a 以下で0、b 以上で1) */
export function smooth(x: number, a: number, b: number): number {
  if (b === a) return x >= b ? 1 : 0;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

interface Rate {
  /** 空腹度の変化(分あたり。正で空腹に) */
  hunger: number;
  /** 疲労度の変化(分あたり。負で回復) */
  fatigue: number;
  /** 気分の変化(分あたり) */
  mood: number;
}

/** 行動ごとの基本変化量 */
export const RATES: Record<Activity, Rate> = {
  sleeping: { hunger: 0.04, fatigue: -0.15, mood: 0 },
  morning: { hunger: -1.1, fatigue: 0, mood: 0.05 },
  walking: { hunger: 0.14, fatigue: 0.12, mood: 0 },
  working: { hunger: 0.14, fatigue: 0.13, mood: 0 },
  eating: { hunger: -1.5, fatigue: -0.02, mood: 0.1 },
  resting: { hunger: 0.12, fatigue: -0.2, mood: 0.05 },
  leisure: { hunger: 0.12, fatigue: -0.05, mood: 0.09 },
  chatting: { hunger: 0.12, fatigue: 0.05, mood: 0 },
  gathering: { hunger: -0.35, fatigue: -0.12, mood: 0.12 },
};

/** 気分が基準値へ戻る速さ(分あたりの割合) */
export const MOOD_DRIFT = 0.003;

/** 1tick分の状態変化を適用する。起きている間は空腹・疲労が進み、食事・睡眠・休憩で戻る */
export function applyNeeds(c: CharState, weather: Weather): void {
  const prof = profileOf(c.id);
  const r = RATES[c.activity];
  const place = placeAt(c.pos);
  const kind = place?.kind;

  // 空腹・疲労: 増える方向には個性の係数がかかる
  c.hunger += r.hunger > 0 ? r.hunger * prof.hungerRate : r.hunger;
  c.fatigue += r.fatigue > 0 ? r.fatigue * prof.fatigueRate : r.fatigue;

  // 気分
  let dMood = r.mood;
  if (c.activity === 'working') dMood += prof.workMood;
  if (kind === 'home' && c.activity === 'resting') c.fatigue -= 0.05;
  if (c.activity === 'eating' && kind === 'cafe') dMood += 0.06;
  if ((c.activity === 'resting' || c.activity === 'leisure') && kind) {
    dMood += 0.05 * prof.leisure[kind] * (kind === 'park' ? 1 : 0.6);
  }
  if (c.activity !== 'sleeping') {
    dMood += (prof.baseMood - c.mood) * MOOD_DRIFT;
    if (c.hunger > 75) dMood -= ((c.hunger - 75) / 25) * 0.06;
    if (c.fatigue > 80) dMood -= ((c.fatigue - 80) / 20) * 0.05;
    // 雨の中(屋外)にいると、気分が下がり疲れる
    if (weather === 'rainy' && !(place && place.indoor)) {
      dMood -= prof.umbrella ? 0.02 : 0.05;
      c.fatigue += 0.02;
    }
  }
  c.mood += dMood;

  c.hunger = clamp100(c.hunger);
  c.fatigue = clamp100(c.fatigue);
  c.mood = clamp100(c.mood);
}

export function placeNameAt(c: CharState): string {
  const p = placeAt(c.pos);
  return p ? p.name : '街の通り';
}

export function homeName(id: CharState['id']): string {
  return getPlace(`home_${id}`).name;
}
