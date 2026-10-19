// シミュレーション本体: 1tick = ゲーム内1分の固定ステップで世界を進める。
// UI・描画・実時間には一切依存しない。

import type { Rng } from './rng';
import { pick, randInt } from './rng';
import type { CharId, CharState, GoalKind, Plan, Point, World } from './types';
import { CHAR_IDS } from './types';
import {
  HOME_ID,
  chebyshev,
  findPath,
  getPlace,
  isWalkable,
  manhattan,
  nearestOpenTile,
  neighbors8,
  placeAt,
  samePoint,
  spotsOf,
  terrainAt,
  type SpotKind,
} from './map';
import { PROFILES } from './profiles';
import { T, isNight, minuteOfDay } from './clock';
import { applyNeeds } from './needs';
import { activityFor } from './activity';
import { updateWeather } from './weather';
import { dayStats, isSpotTaken, pushLog } from './world';
import {
  bestOption,
  buildOptions,
  canBeApproached,
  noiseAmp,
  pairCooldown,
  planKey,
  type Option,
} from './behavior';
import { canStartChat, chatPlaceName, tickChats, tryStartChat } from './chat';

/** 計画を決めてから、緊急でない限り乗り換えない時間(分) */
const COMMIT_MINUTES = 12;
const NEVER_END = 1e9;

// ---- 場所と座席 ----

const SPOT_KINDS: Record<GoalKind, Record<string, SpotKind[]>> = {
  sleep: { home: ['bed'] },
  morning: { home: ['chair'] },
  work: { office: ['desk'] },
  eat: { home: ['chair'], office: ['desk'], cafe: ['seat'], park: ['bench', 'stroll'], plaza: ['bench', 'stroll'] },
  rest: {
    home: ['sofa', 'chair'],
    office: ['break'],
    cafe: ['seat'],
    park: ['bench', 'stroll'],
    plaza: ['bench', 'stroll'],
  },
  leisure: {
    home: ['sofa', 'chair'],
    cafe: ['seat'],
    park: ['stroll', 'bench'],
    plaza: ['stroll', 'bench'],
  },
  gather: { cafe: ['seat'] },
  chat: {},
};

function sameLocation(a: Point, b: Point): boolean {
  return (placeAt(a)?.id ?? 'street') === (placeAt(b)?.id ?? 'street');
}

/** 話しかけにいくとき、相手のすぐ隣の立ち位置を選ぶ */
function approachTile(from: Point, target: Point): Point {
  if (sameLocation(from, target) && chebyshev(from, target) <= 2) return { ...from };
  let best: Point | null = null;
  let bestD = Infinity;
  for (const p of neighbors8(target)) {
    if (!isWalkable(p) || terrainAt(p) === 'door' || !sameLocation(p, target)) continue;
    const d = manhattan(p, from);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ?? { ...target };
}

/** 目的地のタイルを決める。他の人が予約している座席は避ける */
function chooseSpots(world: World, c: CharState, opt: Option, rng: Rng): Point[] {
  if (opt.kind === 'chat') {
    const b = world.chars[opt.partner!];
    return [approachTile(c.pos, b.pos)];
  }
  const place = getPlace(opt.placeId);
  const kinds = SPOT_KINDS[opt.kind][place.kind] ?? [];
  const mine = spotsOf(place.id, kinds).filter((s) => !s.owner || s.owner === c.id);
  // 優先する種類の順に並べ、空いているものを集める
  const ordered = mine.filter((s) => !isSpotTaken(world, s.pos, c.id));
  const out: Point[] = [];
  if (ordered.length > 0) {
    if (place.kind === 'home' || place.kind === 'office') {
      for (const k of kinds) {
        const hit = ordered.find((s) => s.kind === k);
        if (hit) out.push({ ...hit.pos });
      }
    } else {
      // 公園・広場・カフェは、空いている席のどれかをランダムに選ぶ(同じ席ばかりにならない)
      const first = pick(rng, ordered);
      out.push({ ...first.pos });
      for (const s of ordered) if (s !== first) out.push({ ...s.pos });
    }
  }
  const fallback = nearestOpenTile(place.id, c.pos, (p) => isSpotTaken(world, p, c.id));
  if (fallback) out.push(fallback);
  return out;
}

// ---- 計画の開始・到着・終了 ----

function mealName(m: number): string {
  if (m >= 660 && m < 840) return '昼食';
  if (m >= 1020 && m < 1290) return '夕食';
  if (m >= 300 && m < 600) return '朝食';
  return '軽食';
}

function placeLabel(id: string): string {
  return chatPlaceName(id);
}

/** 計画を始める。必要なら経路探索して移動を始め、すでに着いているならすぐ「する」段階に入る */
export function beginPlan(world: World, c: CharState, opt: Option, rng: Rng): boolean {
  const prof = PROFILES[c.id];
  const spots = chooseSpots(world, c, opt, rng);
  let spot: Point | null = null;
  let path: Point[] | null = null;
  for (const s of spots) {
    const p = findPath(c.pos, s);
    if (p) {
      spot = s;
      path = p;
      break;
    }
  }
  if (!spot || !path) {
    // 行き先がない(通常は起きない)。計画なしにして、次のtickで選び直す
    c.plan = null;
    c.path = [];
    c.activity = 'resting';
    return false;
  }
  const duration = opt.duration[1] > 0 ? randInt(rng, opt.duration[0], opt.duration[1]) : 0;
  const plan: Plan = {
    kind: opt.kind,
    placeId: opt.placeId,
    spot,
    stage: 'travel',
    duration,
    doUntil: 0,
    startedAt: world.tick,
    commitUntil: world.tick + (opt.kind === 'chat' ? 5 : COMMIT_MINUTES),
    reason: opt.reason,
    partner: opt.partner,
    workUntil: opt.workUntil,
    partnerAt: opt.partner ? { ...world.chars[opt.partner].pos } : undefined,
  };
  c.plan = plan;
  c.path = path;

  // 出勤のログ(その日の最初に、家から仕事へ向かうとき)
  const day = Math.floor((world.tick + 420) / 1440) + 1;
  if (opt.kind === 'work' && path.length > 0 && placeAt(c.pos)?.kind === 'home' && c.mem.commuteLoggedDay !== day) {
    c.mem.commuteLoggedDay = day;
    pushLog(world, 'commute', `${prof.name}は出勤のため家を出た`, c.id);
  }

  if (path.length > 0) {
    c.activity = 'walking';
  } else {
    arrive(world, c, rng);
  }
  return true;
}

/** 目的地に着いた: 「する」段階に入る */
function arrive(world: World, c: CharState, rng: Rng): void {
  const plan = c.plan;
  if (!plan) return;
  const prof = PROFILES[c.id];
  const m = minuteOfDay(world.tick);
  c.path = [];

  if (plan.kind === 'chat') {
    const b = plan.partner ? world.chars[plan.partner] : null;
    if (b && tryStartChat(world, c, b, rng)) return;
    // 話しかけられなかった(相手が行ってしまった・断られた)
    if (plan.partner) c.mem.lastChatWith[plan.partner] = world.tick - pairCooldown(c.id, plan.partner) + 30;
    c.plan = null;
    c.activity = 'resting';
    return;
  }

  // 勤務の終了時刻を過ぎてから着いたら、すぐ終わり
  if (plan.kind === 'work' && plan.workUntil !== undefined && m >= plan.workUntil) {
    finishPlan(world, c);
    return;
  }

  plan.stage = 'doing';
  plan.doUntil = plan.kind === 'sleep' || plan.kind === 'work' ? NEVER_END : world.tick + plan.duration;
  c.activity = activityFor(plan.kind);
  const here = placeAt(c.pos);
  const placeName = here ? here.name : '街の通り';

  switch (plan.kind) {
    case 'sleep':
      c.mem.sleepStart = world.tick;
      plan.reason = 'ぐっすり眠っている。朝になったら起きる';
      pushLog(world, 'sleep', `${prof.name}は${placeName}で就寝した`, c.id);
      break;
    case 'work':
      pushLog(world, 'work', `${prof.name}は仕事を始めた`, c.id);
      break;
    case 'eat':
      pushLog(world, 'eat', `${prof.name}は${placeName}で${mealName(m)}をとっている`, c.id);
      break;
    case 'rest':
      pushLog(world, 'rest', `${prof.name}は${placeName}で休憩している`, c.id);
      break;
    case 'leisure':
      pushLog(world, 'leisure', `${prof.name}は${placeName}でのんびり過ごしている`, c.id);
      break;
    case 'gather':
      pushLog(world, 'rest', `${prof.name}がカフェに着いた(お茶のお誘い)`, c.id);
      break;
    case 'morning':
      break;
    default:
      break;
  }
}

/** 計画を終える(自然に終わったとき) */
function finishPlan(world: World, c: CharState): void {
  const plan = c.plan;
  if (!plan) return;
  const prof = PROFILES[c.id];
  const mem = c.mem;
  mem.lastDone[plan.kind] = world.tick;
  if (plan.kind === 'morning') mem.lastDone.eat = world.tick; // 朝食をとった
  mem.lastGoalKey = planKey(plan);
  mem.lastGoalEnd = world.tick;
  if (plan.kind === 'sleep') {
    mem.wakeTick = world.tick;
    const slept = world.tick - mem.sleepStart;
    pushLog(world, 'wake', `${prof.name}は起床した(睡眠 ${Math.floor(slept / 60)}時間${slept % 60}分)`, c.id);
  } else if (plan.kind === 'work') {
    const m = minuteOfDay(world.tick);
    if (m >= T.workEnd - 1) pushLog(world, 'work', `${prof.name}は今日の仕事を終えた`, c.id);
    else if (m < T.workPm) pushLog(world, 'work', `${prof.name}は午前の仕事を区切った(昼休みへ)`, c.id);
  }
  c.plan = null;
  c.path = [];
}

/** 計画を途中でやめる */
function abandonPlan(c: CharState, tick: number): void {
  if (c.plan) {
    c.mem.lastGoalKey = planKey(c.plan);
    c.mem.lastGoalEnd = tick;
  }
  c.plan = null;
  c.path = [];
  c.activity = 'resting';
}

/** 起きる条件: 起床時刻を過ぎていて十分に回復した(または、予定より遅れすぎた) */
function shouldWake(world: World, c: CharState): boolean {
  const prof = PROFILES[c.id];
  const m = minuteOfDay(world.tick);
  const slept = world.tick - c.mem.sleepStart;
  if (slept >= 720) return true;
  if (slept < 180) return false;
  const wakeAt = T.wake + prof.wakeOffset;
  return m >= wakeAt && m < 12 * 60 && (c.fatigue <= 30 || m >= wakeAt + 90);
}

// ---- 意思決定 ----

function decideNew(world: World, c: CharState, rng: Rng, allowChat = true): void {
  let options = buildOptions(world, c);
  if (!allowChat) options = options.filter((o) => o.kind !== 'chat');
  const prof = PROFILES[c.id];
  const opt = bestOption(options, { amp: noiseAmp(prof), next: () => rng.next() });
  beginPlan(world, c, opt, rng);
}

/** 実行中の計画を続けるか、もっと欲求の強い行動へ乗り換えるか */
function considerSwitch(world: World, c: CharState, rng: Rng): void {
  const plan = c.plan;
  if (!plan || c.chat) return;
  const m = minuteOfDay(world.tick);
  const urgent = c.replan !== null;
  const doing = plan.stage === 'doing';
  if (plan.kind === 'sleep' && doing) {
    c.replan = null;
    return;
  }
  if (!urgent && doing && (plan.kind === 'morning' || plan.kind === 'eat' || plan.kind === 'gather')) return;
  if (plan.kind === 'gather' && doing && !isNight(m)) {
    c.replan = null;
    return;
  }

  const options = buildOptions(world, c);
  const key = planKey(plan);
  const cur = options.find((o) => o.key === key);
  const curScore = cur ? cur.score : plan.kind === 'gather' ? 99 : 0;
  const others = options.filter((o) => o.key !== key);
  if (others.length === 0) {
    c.replan = null;
    return;
  }
  const best = bestOption(others);
  const prof = PROFILES[c.id];
  const committed = world.tick < plan.commitUntil;
  const need = urgent ? 0 : prof.stubbornness + (doing ? 0 : 0.15) + (committed ? 0.6 : 0);
  const reason = c.replan;
  c.replan = null;
  if (best.score <= curScore + need) return;

  const before = placeAt(c.pos);
  abandonPlan(c, world.tick);
  if (beginPlan(world, c, best, rng) && reason === 'rain' && !before?.indoor) {
    const dest = c.plan ? placeLabel(c.plan.placeId) : '';
    pushLog(world, 'weather', `${prof.name}は雨を避けて予定を変えた(→${dest})`, c.id);
  }
}

// ---- 1tickの進行 ----

function stepMove(world: World, c: CharState): void {
  const next = c.path.shift();
  if (!next) return;
  const before = placeAt(c.pos);
  if (next.x !== c.pos.x) c.facing = next.x > c.pos.x ? 1 : -1;
  c.pos = next;
  const after = placeAt(next);
  if (after && after.id === HOME_ID[c.id] && before?.id !== after.id) {
    pushLog(world, 'home', `${PROFILES[c.id].name}は帰宅した`, c.id);
  }
}

/** 会話に向かっている途中の確認(相手が行ってしまったら取りやめ、動いたら経路を引き直す) */
function checkChatApproach(world: World, c: CharState, rng: Rng): 'ok' | 'cancel' | 'started' {
  const plan = c.plan!;
  const b = plan.partner ? world.chars[plan.partner] : null;
  if (!b || !canBeApproached(b)) return 'cancel';
  if (canStartChat(world, c, b)) {
    return tryStartChat(world, c, b, rng) ? 'started' : 'cancel';
  }
  if (!plan.partnerAt || !samePoint(plan.partnerAt, b.pos)) {
    const tile = approachTile(c.pos, b.pos);
    const path = findPath(c.pos, tile);
    if (!path) return 'cancel';
    plan.spot = tile;
    plan.partnerAt = { ...b.pos };
    c.path = path;
  }
  return 'ok';
}

function advanceInner(world: World, c: CharState, rng: Rng): void {
  if (c.chat) {
    // 会話中: 話しかけられた側の予定の時計は止まる
    if (c.plan && c.plan.kind !== 'chat' && c.plan.stage === 'doing' && c.plan.doUntil < NEVER_END) {
      c.plan.doUntil += 1;
    }
    return;
  }
  if (!c.plan) {
    decideNew(world, c, rng);
    return;
  }

  considerSwitch(world, c, rng);
  const plan = c.plan;
  if (!plan || c.chat) return;

  if (plan.stage === 'travel') {
    if (plan.kind === 'chat') {
      const r = checkChatApproach(world, c, rng);
      if (r === 'started') return;
      if (r === 'cancel') {
        if (plan.partner) c.mem.lastChatWith[plan.partner] = world.tick - pairCooldown(c.id, plan.partner) + 30;
        abandonPlan(c, world.tick);
        return;
      }
    }
    stepMove(world, c);
    if (c.path.length === 0) arrive(world, c, rng);
    return;
  }

  // doing
  const m = minuteOfDay(world.tick);
  let done = false;
  if (plan.kind === 'sleep') done = shouldWake(world, c);
  else if (plan.kind === 'work') done = plan.workUntil !== undefined && m >= plan.workUntil;
  else done = world.tick >= plan.doUntil;
  if (done) {
    finishPlan(world, c);
    decideNew(world, c, rng);
  }
}

/** 1人分の進行。終わったとき、会話中でなければ必ず何かの計画を持っている */
function advanceChar(world: World, c: CharState, rng: Rng): void {
  advanceInner(world, c, rng);
  // 話しかけに失敗したときなどで計画がなくなったら、選び直す(最後は会話を除いて必ず決める)
  for (let attempt = 0; attempt < 3 && !c.plan && !c.chat; attempt++) {
    decideNew(world, c, rng, attempt < 2);
  }
}

const STAT_KEY: Record<string, 'work' | 'eat' | 'rest' | 'leisure' | 'chat' | 'walk' | 'sleep' | null> = {
  working: 'work',
  eating: 'eat',
  resting: 'rest',
  gathering: 'rest',
  leisure: 'leisure',
  chatting: 'chat',
  walking: 'walk',
  sleeping: 'sleep',
  morning: null,
};

/** 1分(1tick)進める。world と rng だけが入力 */
export function stepWorld(world: World, rng: Rng): void {
  world.tick += 1;
  const tick = world.tick;
  const m = minuteOfDay(tick);

  updateWeather(world, rng);
  if (world.invite && tick >= world.invite.endTick) world.invite = null;

  // 閉店・退勤時刻: そこにいる人に予定の見直しを促す
  if (m === 22 * 60 || m === 20 * 60) {
    const closing = m === 22 * 60 ? 'cafe' : 'office';
    for (const id of CHAR_IDS) {
      const c = world.chars[id];
      if (placeAt(c.pos)?.id === closing && c.activity !== 'sleeping') c.replan = 'closing';
    }
  }

  // 公平のため、処理の順番を毎tick回す
  const start = tick % CHAR_IDS.length;
  const order: CharId[] = CHAR_IDS.map((_, i) => CHAR_IDS[(start + i) % CHAR_IDS.length]);

  const weather = world.weather.current;
  const stats = dayStats(world);
  for (const id of order) {
    const c = world.chars[id];
    c.prev = { ...c.pos };
    applyNeeds(c, weather);
    const k = STAT_KEY[c.activity];
    if (k) stats[id][k] += 1;
  }

  tickChats(world, rng);
  for (const id of order) advanceChar(world, world.chars[id], rng);

  for (const id of CHAR_IDS) {
    const c = world.chars[id];
    if (c.bubble && c.bubble.untilTick <= tick) c.bubble = null;
  }
  world.rngState = rng.getState();
}

