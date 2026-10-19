// 自律行動の頭脳: Utility AI。
// 「いまできる行動」を候補として並べ、それぞれに 0〜1.5 くらいの点数(欲求の強さ)をつけ、
// いちばん高いものを選ぶ。点数は 時刻の基準スケジュール × 体の状態(空腹・疲労・気分)
// × 性格 × 天候 × 距離 で決まる。基準スケジュールは「点数を上げる要素の一つ」にすぎないので、
// 空腹や疲労が強ければ仕事より食事・休憩が勝つ。
//
// なぜ Utility AI か:
//  - 欲求(スケジュール・空腹・疲労・社交・天気)を同じ物差しで比べられ、「なぜ今それを選んだか」を
//    点数の内訳として説明できる(UIの「行動の理由」)。
//  - 性格を係数の違いとして表せる(アオイは仕事の係数が高く、ミナは社交の係数が高い)。
//  - 状態機械のような「条件の組み合わせ爆発」が起きにくく、行動の追加が簡単。
// 切り替えの連発を防ぐために、(1)いまの計画に粘着ボーナス(性格の頑固さ)、(2)開始直後の一定時間は
// 乗り換えない、(3)直前と同じことを繰り返すとペナルティ、を入れている。

import type { CharId, CharState, GoalKind, Plan, Weather, World } from './types';
import { CHAR_IDS } from './types';
import {
  HOME_ID,
  PLACES,
  chebyshev,
  getPlace,
  manhattan,
  placeAt,
  travelSteps,
  type Place,
  type PlaceKind,
} from './map';
import { PROFILES, type Profile } from './profiles';
import { T, WORK_BLOCKS, isNight, minuteOfDay, workBlockAt } from './clock';
import { clamp, smooth } from './needs';

export interface Option {
  key: string;
  kind: GoalKind;
  placeId: string;
  partner?: CharId;
  score: number;
  reason: string;
  /** doing の長さ(分)の範囲。[0,0] は条件で終わる(睡眠・勤務) */
  duration: [number, number];
  workUntil?: number;
  /** 床(他に何もないときの選択肢)。繰り返しペナルティを受けない */
  floor?: boolean;
}

export function optionKey(kind: GoalKind, placeId: string, partner?: CharId): string {
  return kind === 'chat' ? `chat:${partner}` : `${kind}@${placeId}`;
}

export function planKey(p: Plan): string {
  return optionKey(p.kind, p.placeId, p.partner);
}

interface Ctx {
  world: World;
  c: CharState;
  prof: Profile;
  m: number;
  tick: number;
  h: number;
  f: number;
  mood: number;
  weather: Weather;
  here: Place | null;
}

/** 開店時間 */
export function isOpen(kind: PlaceKind, m: number): boolean {
  if (kind === 'office') return m >= 7 * 60 + 30 && m <= 20 * 60;
  if (kind === 'cafe') return m >= 7 * 60 && m < 22 * 60;
  return true;
}

/** 屋外の施設の天候による行きやすさ */
function weatherFactor(kind: PlaceKind, weather: Weather, m: number): number {
  if (kind === 'home' || kind === 'office' || kind === 'cafe') return 1;
  let w = weather === 'sunny' ? 1.1 : weather === 'cloudy' ? 0.9 : 0.05;
  if (m >= 21 * 60 + 30 || m < 6 * 60) w *= 0.3;
  else if (m >= 20 * 60 + 30) w *= 0.6;
  return w;
}

function costTo(x: Ctx, placeId: string): number {
  if (x.here?.id === placeId) return 0;
  return travelSteps(x.c.pos, placeId);
}

function homeId(c: CharState): string {
  return HOME_ID[c.id];
}

// ---- 各行動の候補 ----

function sleepOption(x: Ctx): Option | null {
  const home = homeId(x.c);
  const steps = costTo(x, home);
  let s = 0;
  let reason = '';
  if (isNight(x.m)) {
    s = 2.0;
    reason = '夜も更けたので、眠る時間';
  } else if (x.m >= 19 * 60) {
    const leave = T.bed - steps - 5;
    if (x.m >= leave) {
      s = 0.5 + 1.1 * clamp((x.m - leave) / Math.max(1, T.bed - leave), 0, 1);
      reason = '23時の就寝に間に合うよう、家へ戻る';
    }
    const exhausted = 1.35 * smooth(x.f, 85, 100);
    if (exhausted > s) {
      s = exhausted;
      reason = '疲れ切っているので、早めに休む';
    }
  }
  if (s <= 0.01) return null;
  return { key: optionKey('sleep', home), kind: 'sleep', placeId: home, score: s, reason, duration: [0, 0] };
}

function morningOption(x: Ctx): Option | null {
  const { c, m } = x;
  if (c.mem.lastDone.morning >= c.mem.wakeTick) return null;
  if (m < 5 * 60 || m >= 11 * 60) return null;
  const home = homeId(c);
  let duration: [number, number] = x.prof.diligence > 1.1 ? [40, 50] : x.prof.spontaneity > 0.8 ? [25, 40] : [30, 40];
  if (m >= T.workAm) duration = [10, 15];
  return {
    key: optionKey('morning', home),
    kind: 'morning',
    placeId: home,
    score: 1.5,
    reason: m >= T.workAm ? '寝坊したので、急いで身支度する' : '起きたので、朝の身支度と朝ごはん',
    duration,
  };
}

function workOption(x: Ctx): Option | null {
  const { m, prof } = x;
  const atOffice = x.here?.id === 'office';
  const steps = atOffice ? 0 : travelSteps(x.c.pos, 'office');
  let base = 0;
  let until = 0;
  let reason = '';
  const block = workBlockAt(m);
  if (block) {
    base = 1;
    until = block[1];
    reason = block[0] === T.workAm ? '午前の勤務時間' : '午後の勤務時間';
  } else {
    for (const b of WORK_BLOCKS) {
      const lead = steps + prof.slack;
      if (m < b[0] && m >= b[0] - lead - 2) {
        base = 1;
        until = b[1];
        reason = b[0] === T.workAm ? '始業に間に合うよう、出社する' : '昼休みを切り上げて、仕事に戻る';
      }
    }
    if (base === 0 && m >= T.workEnd && m < T.free && atOffice && prof.diligence > 1.1) {
      base = 0.7 - 0.6 * smooth(x.f, 50, 90);
      until = T.free;
      reason = 'キリのいいところまで、少し残業する';
    }
  }
  if (base <= 0) return null;
  let s = base * prof.diligence;
  s -= smooth(x.h, 62, 100) * (1.25 - 0.2 * prof.diligence);
  s -= smooth(x.f, 70, 100) * (0.8 - 0.15 * prof.diligence);
  if (x.mood < 25) s -= 0.1;
  return {
    key: optionKey('work', 'office'),
    kind: 'work',
    placeId: 'office',
    score: Math.max(0, s),
    reason,
    duration: [0, 0],
    workUntil: until,
  };
}

function candidatePlaces(c: CharState): Place[] {
  return PLACES.filter((p) => p.kind !== 'home' || p.id === homeId(c));
}

function eatOptions(x: Ctx): Option[] {
  const { c, prof, m, tick } = x;
  const sinceEat = tick - c.mem.lastDone.eat;
  let bonus = 0;
  let meal = '';
  if (m >= 700 && m <= 810 && sinceEat > 180) {
    bonus = 0.55 * smooth(x.h, 10, 45);
    meal = '昼食の時間';
  } else if (m >= 1050 && m <= 1230 && sinceEat > 180) {
    bonus = 0.55 * smooth(x.h, 15, 50);
    meal = '夕食の時間';
  }
  let base = 1.4 * smooth(x.h, 40, 100) + bonus;
  if (sinceEat < 150 && x.h < 88) base *= 0.15;
  if (base < 0.05) return [];
  const out: Option[] = [];
  for (const p of candidatePlaces(c)) {
    const pw = prof.meal[p.kind];
    if (pw < 0.05 || !isOpen(p.kind, m)) continue;
    let s = base * (0.55 + 0.45 * pw) + (base > 0.3 ? 0.2 * pw : 0);
    s *= weatherFactor(p.kind, x.weather, m);
    const steps = costTo(x, p.id);
    s -= steps * 0.011;
    // 昼休みの間に往復できない場所は避ける
    if (m >= 660 && m < T.workPm && m + 2 * steps + 30 > T.workPm + 8) s -= 0.45;
    const why = x.h >= 85 ? '空腹が限界に近い' : meal || 'お腹が空いてきた';
    const hint = p.kind === 'office' ? '(お弁当)' : p.kind === 'park' ? '(外でお弁当)' : '';
    out.push({
      key: optionKey('eat', p.id),
      kind: 'eat',
      placeId: p.id,
      score: s,
      reason: `${why}${hint}`,
      duration: [25, 35],
    });
  }
  return out;
}

function restOptions(x: Ctx): Option[] {
  const { c, prof, m, tick } = x;
  let base = 1.05 * smooth(x.f, 38, 100) + 0.5 * smooth(x.f, 90, 100);
  const digest = m >= 720 && m < 775 && tick - c.mem.lastDone.eat < 45;
  if (digest) base += 0.45;
  const out: Option[] = [];
  const dutyHours = m >= 480 && m < T.free;
  for (const p of candidatePlaces(c)) {
    const pw = prof.leisure[p.kind];
    if (!isOpen(p.kind, m)) continue;
    if (p.kind === 'office' && !(m >= 480 && m <= 19 * 60)) continue;
    let s = base * (0.5 + 0.5 * pw);
    if (p.kind === 'office') s *= dutyHours ? 0.9 : 0.4;
    s *= weatherFactor(p.kind, x.weather, m);
    s -= costTo(x, p.id) * 0.012;
    if (s <= 0.001) continue;
    out.push({
      key: optionKey('rest', p.id),
      kind: 'rest',
      placeId: p.id,
      score: s,
      reason: x.f >= 70 ? '疲れがたまってきたので、休憩する' : digest ? '食後のひと休み' : '少し休みたい',
      duration: p.kind === 'home' ? [20, 40] : [15, 30],
    });
  }
  // 床: 何もすることがないときは、いまいる場所(なければ自宅)で一息つく
  const floorPlace = x.here && x.here.kind !== 'office' ? x.here : getPlace(homeId(c));
  out.push({
    key: optionKey('rest', floorPlace.id),
    kind: 'rest',
    placeId: floorPlace.id,
    score: 0.05,
    reason: 'いまは特にすることがないので、のんびり過ごす',
    duration: [15, 25],
    floor: true,
  });
  return out;
}

function leisureOptions(x: Ctx): Option[] {
  const { c, prof, m, tick } = x;
  let base = 0;
  let early = false;
  if (m >= 730 && m <= 775 && tick - c.mem.lastDone.eat < 60) {
    base = 0.5;
  } else if (m >= T.workEnd) {
    base = (0.55 + 0.3 * smooth(m, T.workEnd, T.free)) * (1 - smooth(m, 21 * 60 + 30, T.bed));
  } else if (c.mem.lastDone.morning >= c.mem.wakeTick && m >= 450) {
    const leaveBy = T.workAm - travelSteps(c.pos, 'office') - prof.slack;
    if (m < leaveBy - 20) {
      base = 0.35 * prof.spontaneity;
      early = true;
    }
  }
  if (base <= 0.01) return [];
  const out: Option[] = [];
  for (const p of candidatePlaces(c)) {
    const pw = prof.leisure[p.kind];
    if (p.kind === 'office' || !isOpen(p.kind, m)) continue;
    let s = base * (0.5 + 0.5 * pw) * weatherFactor(p.kind, x.weather, m);
    s *= 1 + (60 - x.mood) / 200;
    s -= costTo(x, p.id) * 0.012;
    if (s <= 0.02) continue;
    out.push({
      key: optionKey('leisure', p.id),
      kind: 'leisure',
      placeId: p.id,
      score: s,
      reason: early
        ? '出発までの時間に、気の向くまま寄り道したい'
        : p.kind === 'home'
          ? '家でゆっくり過ごしたい'
          : `${p.name}で自由時間を楽しみたい`,
      duration: p.kind === 'park' && prof.spontaneity > 0.8 ? [40, 80] : [30, 70],
    });
  }
  return out;
}

/** 相手が「いま話しかけられる状態」か */
export function canBeApproached(b: CharState): boolean {
  if (b.chat) return false;
  if (b.activity === 'sleeping' || b.activity === 'morning' || b.activity === 'walking' || b.activity === 'working') {
    return false;
  }
  if (b.plan?.stage === 'travel') return false;
  const place = placeAt(b.pos);
  if (place?.kind === 'home') return false; // 他人の家には入らない
  return true;
}

export function pairCooldown(a: CharId, b: CharId): number {
  return (PROFILES[a].chatCooldown + PROFILES[b].chatCooldown) / 2;
}

function socialOptions(x: Ctx): Option[] {
  const { c, prof, m, tick } = x;
  if (isNight(m + 20)) return [];
  if (c.activity === 'sleeping' || c.activity === 'morning') return [];
  let tf = 0;
  if (m >= 720 && m < T.workPm) tf = 1;
  else if (m >= T.free - 60 && m < 21 * 60 + 30) tf = 1;
  else if (m >= 21 * 60 + 30) tf = 0.5;
  else if (m >= 480 && m < T.workAm) tf = 0.3;
  else if (workBlockAt(m)) tf = 0.2;
  if (tf === 0) return [];
  const out: Option[] = [];
  for (const id of CHAR_IDS) {
    if (id === c.id) continue;
    const b = x.world.chars[id];
    if (!canBeApproached(b)) continue;
    if (tick - c.mem.lastChatWith[id] < pairCooldown(c.id, id)) continue;
    const bPlace = placeAt(b.pos);
    const near = placeAt(c.pos)?.id === bPlace?.id && chebyshev(c.pos, b.pos) <= 2;
    const dist = near ? 0 : manhattan(c.pos, b.pos);
    if (bPlace && !isOpen(bPlace.kind, m)) continue;
    const rel = c.relations[id];
    let s = prof.sociability * (0.75 + 0.25 * (rel / 100)) * tf * (0.7 + 0.3 * (x.mood / 100));
    s -= smooth(x.f, 70, 100) * 0.4;
    s -= dist * 0.014;
    const inv = x.world.invite;
    if (inv && tick < inv.endTick && inv.participants.includes(c.id) && inv.participants.includes(id) && bPlace?.id === 'cafe') {
      s += 0.7;
    }
    if (s <= 0.02) continue;
    out.push({
      key: optionKey('chat', bPlace?.id ?? 'street', id),
      kind: 'chat',
      placeId: bPlace?.id ?? 'street',
      partner: id,
      score: s,
      reason: near ? `近くにいる${PROFILES[id].name}と話したい` : `${PROFILES[id].name}と話したい気分`,
      duration: [5, 15],
    });
  }
  return out;
}

function makeCtx(world: World, c: CharState): Ctx {
  return {
    world,
    c,
    prof: PROFILES[c.id],
    m: minuteOfDay(world.tick),
    tick: world.tick,
    h: c.hunger,
    f: c.fatigue,
    mood: c.mood,
    weather: world.weather.current,
    here: placeAt(c.pos),
  };
}

/** いまの状況で選べる行動と点数の一覧(乱数は使わない) */
export function buildOptions(world: World, c: CharState): Option[] {
  const x = makeCtx(world, c);
  const out: Option[] = [];
  const add = (o: Option | null) => {
    if (o) out.push(o);
  };
  add(sleepOption(x));
  add(morningOption(x));
  add(workOption(x));
  out.push(...eatOptions(x), ...restOptions(x), ...leisureOptions(x), ...socialOptions(x));
  // 直前と同じことを続けて繰り返さない
  for (const o of out) {
    if (o.floor) continue;
    if (
      (o.kind === 'rest' || o.kind === 'leisure' || o.kind === 'eat') &&
      c.mem.lastGoalKey === o.key &&
      x.tick - c.mem.lastGoalEnd < 150
    ) {
      o.score -= 0.5;
    }
  }
  return out.filter((o) => o.score > 0.001 || o.floor);
}

/** 最高点の候補を選ぶ。noise が与えられたら、性格に応じた揺らぎを足す */
export function bestOption(
  options: Option[],
  noise?: { amp: number; next: () => number },
): Option {
  let best: Option | null = null;
  let bestScore = -Infinity;
  for (const o of options) {
    const s = o.score + (noise ? (noise.next() - 0.5) * 2 * noise.amp : 0);
    if (s > bestScore) {
      bestScore = s;
      best = o;
    }
  }
  if (!best) throw new Error('no options');
  return best;
}

/** UI用: いまの計画の次にやりそうなこと(予測) */
export function predictNext(world: World, c: CharState): Option | null {
  if (c.plan?.kind === 'sleep' && c.plan.stage === 'doing') {
    // 眠っている人の次は、起きて朝の準備
    return {
      key: optionKey('morning', homeId(c)),
      kind: 'morning',
      placeId: homeId(c),
      score: 1.5,
      reason: '起きたら朝の身支度',
      duration: [30, 40],
    };
  }
  const options = buildOptions(world, c);
  const cur = c.plan ? planKey(c.plan) : '';
  const others = options.filter((o) => o.key !== cur);
  if (others.length === 0) return null;
  return bestOption(others);
}

export function noiseAmp(prof: Profile): number {
  return 0.05 + 0.12 * prof.spontaneity;
}
