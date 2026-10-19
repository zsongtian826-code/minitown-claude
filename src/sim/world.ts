// ワールド(シミュレーションの全状態)の作成と、ログ・統計の小さな道具。

import type { Rng } from './rng';
import { parseSeed, randInt } from './rng';
import {
  CHAR_IDS,
  GOAL_KINDS,
  type CharId,
  type CharState,
  type DayStat,
  type GoalKind,
  type LogType,
  type Point,
  type Weather,
  type World,
} from './types';
import { HOME_ID, SPOTS, samePoint } from './map';
import { PROFILES } from './profiles';
import { dayOf } from './clock';

export const SAVE_VERSION = 1;
/** イベントログに残す最大件数(最低100件の要件を満たし、無制限には増やさない) */
export const LOG_CAP = 400;
export const CHAT_CAP = 120;
const NEVER = -100000;

function emptyDayStat(): DayStat {
  return { work: 0, eat: 0, rest: 0, leisure: 0, chat: 0, walk: 0, sleep: 0, chats: 0 };
}

export function pushLog(world: World, type: LogType, text: string, who?: CharId): void {
  world.log.push({ id: world.nextLogId++, tick: world.tick, type, who, text });
  if (world.log.length > LOG_CAP) world.log.splice(0, world.log.length - LOG_CAP);
}

export function dayStats(world: World, tick = world.tick): Record<CharId, DayStat> {
  const key = String(dayOf(tick));
  let s = world.stats[key];
  if (!s) {
    s = { aoi: emptyDayStat(), mina: emptyDayStat(), ren: emptyDayStat() };
    world.stats[key] = s;
    // 古い日の統計は捨てる(最大10日分)
    const days = Object.keys(world.stats)
      .map(Number)
      .sort((a, b) => a - b);
    while (days.length > 10) delete world.stats[String(days.shift())];
  }
  return s;
}

function bedPos(id: CharId): Point {
  const s = SPOTS.find((x) => x.placeId === HOME_ID[id] && x.kind === 'bed');
  if (!s) throw new Error('bed not found');
  return { ...s.pos };
}

function initialWeather(rng: Rng): Weather {
  const r = rng.next();
  return r < 0.55 ? 'sunny' : r < 0.85 ? 'cloudy' : 'rainy';
}

export function createWorld(seedInput: string | number, rng: Rng): World {
  const seed = parseSeed(seedInput);
  const seedText = String(seedInput).trim() || String(seed);
  rng.setState(seed);

  const weather = initialWeather(rng);
  const chars = {} as Record<CharId, CharState>;
  for (const id of CHAR_IDS) {
    const prof = PROFILES[id];
    const lastDone = {} as Record<GoalKind, number>;
    for (const k of GOAL_KINDS) lastDone[k] = NEVER;
    const relations = {} as Record<CharId, number>;
    const lastChatWith = {} as Record<CharId, number>;
    for (const other of CHAR_IDS) {
      relations[other] = other === id ? 0 : prof.initialRelations[other] + randInt(rng, -3, 3);
      lastChatWith[other] = NEVER;
    }
    const pos = bedPos(id);
    chars[id] = {
      id,
      pos,
      prev: { ...pos },
      facing: 1,
      activity: 'morning',
      plan: null,
      path: [],
      hunger: 30 + randInt(rng, -8, 12),
      fatigue: 12 + randInt(rng, 0, 12),
      mood: prof.baseMood + randInt(rng, -6, 6),
      relations,
      chat: null,
      bubble: null,
      replan: null,
      mem: {
        lastDone,
        lastGoalKey: '',
        lastGoalEnd: NEVER,
        lastChatWith,
        recentLines: [],
        wakeTick: 0,
        sleepStart: NEVER,
        commuteLoggedDay: 0,
      },
    };
  }

  const world: World = {
    version: SAVE_VERSION,
    seed,
    seedText,
    tick: 0,
    rngState: rng.getState(),
    weather: { current: weather, prev: weather, changedAt: 0, holdUntil: 0 },
    chars,
    log: [],
    nextLogId: 1,
    chats: [],
    nextChatId: 1,
    invite: null,
    lastGiftAt: NEVER,
    eventAt: { rain: NEVER, gift: NEVER, invite: NEVER },
    stats: {},
  };
  pushLog(world, 'system', `ミニタウンの朝がはじまった(シード: ${seedText})`);
  for (const id of CHAR_IDS) pushLog(world, 'wake', `${PROFILES[id].name}は目を覚ました`, id);
  world.rngState = rng.getState();
  return world;
}

/** spot を他の誰かが目的地にしているか */
export function isSpotTaken(world: World, p: Point, exceptId: CharId): boolean {
  for (const id of CHAR_IDS) {
    if (id === exceptId) continue;
    const o = world.chars[id];
    if (o.plan && samePoint(o.plan.spot, p) && o.plan.kind !== 'chat') return true;
  }
  return false;
}
