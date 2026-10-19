// セーブ・ロード(localStorage)。保存データにはバージョンを持たせ、読み込むときは中身を1つずつ検証する。
// 壊れたデータ・古いバージョン・手で書き換えられたデータは、アプリを落とさずに「読み込めない」として扱う。

import type {
  Activity,
  CharId,
  CharMemory,
  CharState,
  ChatSession,
  DayStat,
  GoalKind,
  LogEntry,
  LogType,
  Plan,
  Point,
  Weather,
  World,
} from './types';
import { CHAR_IDS, GOAL_KINDS, WEATHERS } from './types';
import { hasPlace, isWalkable } from './map';
import { SAVE_VERSION } from './world';
import { checkInvariants } from './invariants';

export const SAVE_KEY = 'minitown-claude:save';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadResult =
  | { ok: true; world: World; savedAt: string }
  | { ok: false; reason: string; empty: boolean };

export function serializeWorld(world: World, now = new Date()): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: now.toISOString(), world });
}

export function saveToStorage(storage: StorageLike, world: World): boolean {
  try {
    storage.setItem(SAVE_KEY, serializeWorld(world));
    return true;
  } catch {
    return false; // 容量オーバー・プライベートモードなど。アプリは続行する
  }
}

export function loadFromStorage(storage: StorageLike): LoadResult {
  let text: string | null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return { ok: false, reason: 'セーブデータにアクセスできませんでした', empty: false };
  }
  if (text === null) return { ok: false, reason: 'セーブデータはありません', empty: true };
  return parseSave(text);
}

export function clearSave(storage: StorageLike): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* 何もしない */
  }
}

// ---- 検証 ----

class Bad extends Error {}

type Obj = Record<string, unknown>;

function obj(v: unknown, name: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Bad(`${name} がオブジェクトではありません`);
  return v as Obj;
}

function arr(v: unknown, name: string): unknown[] {
  if (!Array.isArray(v)) throw new Bad(`${name} が配列ではありません`);
  return v;
}

function num(v: unknown, name: string, lo = -Infinity, hi = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Bad(`${name} の値が不正です`);
  return v;
}

function int(v: unknown, name: string, lo = -Infinity, hi = Infinity): number {
  const n = num(v, name, lo, hi);
  if (!Number.isInteger(n)) throw new Bad(`${name} が整数ではありません`);
  return n;
}

function str(v: unknown, name: string, max = 500): string {
  if (typeof v !== 'string' || v.length > max) throw new Bad(`${name} が文字列ではありません`);
  return v;
}

function oneOf<T extends string>(v: unknown, list: readonly T[], name: string): T {
  if (typeof v !== 'string' || !list.includes(v as T)) throw new Bad(`${name} の値が不正です`);
  return v as T;
}

function point(v: unknown, name: string, mustWalk = true): Point {
  const o = obj(v, name);
  const p = { x: int(o.x, `${name}.x`, 0, 99), y: int(o.y, `${name}.y`, 0, 99) };
  if (mustWalk && !isWalkable(p)) throw new Bad(`${name} が歩けない場所です`);
  return p;
}

const ACTIVITIES: readonly Activity[] = [
  'sleeping',
  'morning',
  'walking',
  'working',
  'eating',
  'resting',
  'leisure',
  'chatting',
  'gathering',
];
const LOG_TYPES: readonly LogType[] = [
  'wake',
  'sleep',
  'commute',
  'work',
  'rest',
  'eat',
  'leisure',
  'talk',
  'home',
  'weather',
  'event',
  'system',
];

function charRecord<T>(v: unknown, name: string, f: (x: unknown, n: string) => T): Record<CharId, T> {
  const o = obj(v, name);
  const out = {} as Record<CharId, T>;
  for (const id of CHAR_IDS) out[id] = f(o[id], `${name}.${id}`);
  return out;
}

function decodePlan(v: unknown, name: string): Plan | null {
  if (v === null) return null;
  const o = obj(v, name);
  const placeId = str(o.placeId, `${name}.placeId`, 40);
  if (placeId !== 'street' && !hasPlace(placeId)) throw new Bad(`${name}.placeId が不明な場所です`);
  const plan: Plan = {
    kind: oneOf<GoalKind>(o.kind, GOAL_KINDS, `${name}.kind`),
    placeId,
    spot: point(o.spot, `${name}.spot`),
    stage: oneOf(o.stage, ['travel', 'doing'] as const, `${name}.stage`),
    duration: num(o.duration, `${name}.duration`, 0, 100000),
    doUntil: num(o.doUntil, `${name}.doUntil`),
    startedAt: num(o.startedAt, `${name}.startedAt`),
    commitUntil: num(o.commitUntil, `${name}.commitUntil`),
    reason: str(o.reason, `${name}.reason`),
  };
  if (o.partner !== undefined) plan.partner = oneOf<CharId>(o.partner, CHAR_IDS, `${name}.partner`);
  if (o.workUntil !== undefined) plan.workUntil = num(o.workUntil, `${name}.workUntil`, 0, 1440);
  if (o.partnerAt !== undefined) plan.partnerAt = point(o.partnerAt, `${name}.partnerAt`, false);
  return plan;
}

function decodeMem(v: unknown, name: string): CharMemory {
  const o = obj(v, name);
  const lastDone = {} as Record<GoalKind, number>;
  const ld = obj(o.lastDone, `${name}.lastDone`);
  for (const k of GOAL_KINDS) lastDone[k] = num(ld[k], `${name}.lastDone.${k}`);
  return {
    lastDone,
    lastGoalKey: str(o.lastGoalKey, `${name}.lastGoalKey`, 80),
    lastGoalEnd: num(o.lastGoalEnd, `${name}.lastGoalEnd`),
    lastChatWith: charRecord(o.lastChatWith, `${name}.lastChatWith`, (x, n) => num(x, n)),
    recentLines: arr(o.recentLines, `${name}.recentLines`)
      .slice(-10)
      .map((x, i) => str(x, `${name}.recentLines[${i}]`, 80)),
    wakeTick: num(o.wakeTick, `${name}.wakeTick`),
    sleepStart: num(o.sleepStart, `${name}.sleepStart`),
    commuteLoggedDay: num(o.commuteLoggedDay, `${name}.commuteLoggedDay`),
  };
}

function decodeChar(id: CharId, v: unknown): CharState {
  const name = `chars.${id}`;
  const o = obj(v, name);
  if (o.id !== id) throw new Bad(`${name}.id が一致しません`);
  const chatRaw = o.chat;
  let chat: CharState['chat'] = null;
  if (chatRaw !== null && chatRaw !== undefined) {
    const c = obj(chatRaw, `${name}.chat`);
    chat = {
      sessionId: int(c.sessionId, `${name}.chat.sessionId`, 0),
      partner: oneOf<CharId>(c.partner, CHAR_IDS, `${name}.chat.partner`),
      startTick: num(c.startTick, `${name}.chat.startTick`),
      endTick: num(c.endTick, `${name}.chat.endTick`),
    };
  }
  let bubble: CharState['bubble'] = null;
  if (o.bubble !== null && o.bubble !== undefined) {
    const b = obj(o.bubble, `${name}.bubble`);
    bubble = { text: str(b.text, `${name}.bubble.text`, 200), untilTick: num(b.untilTick, `${name}.bubble.untilTick`) };
  }
  return {
    id,
    pos: point(o.pos, `${name}.pos`),
    prev: point(o.prev, `${name}.prev`),
    facing: o.facing === -1 ? -1 : 1,
    activity: oneOf<Activity>(o.activity, ACTIVITIES, `${name}.activity`),
    plan: decodePlan(o.plan ?? null, `${name}.plan`),
    path: arr(o.path, `${name}.path`).map((p, i) => point(p, `${name}.path[${i}]`)),
    hunger: num(o.hunger, `${name}.hunger`, 0, 100),
    fatigue: num(o.fatigue, `${name}.fatigue`, 0, 100),
    mood: num(o.mood, `${name}.mood`, 0, 100),
    relations: charRecord(o.relations, `${name}.relations`, (x, n) => num(x, n, 0, 100)),
    chat,
    bubble,
    replan: o.replan === null || o.replan === undefined ? null : str(o.replan, `${name}.replan`, 40),
    mem: decodeMem(o.mem, `${name}.mem`),
  };
}

function decodeLog(v: unknown): LogEntry[] {
  return arr(v, 'log')
    .slice(-400)
    .map((x, i) => {
      const o = obj(x, `log[${i}]`);
      const e: LogEntry = {
        id: int(o.id, `log[${i}].id`, 0),
        tick: num(o.tick, `log[${i}].tick`),
        type: oneOf<LogType>(o.type, LOG_TYPES, `log[${i}].type`),
        text: str(o.text, `log[${i}].text`),
      };
      if (o.who !== undefined) e.who = oneOf<CharId>(o.who, CHAR_IDS, `log[${i}].who`);
      return e;
    });
}

function decodeChats(v: unknown): ChatSession[] {
  return arr(v, 'chats')
    .slice(-120)
    .map((x, i) => {
      const o = obj(x, `chats[${i}]`);
      const s: ChatSession = {
        id: int(o.id, `chats[${i}].id`, 0),
        startTick: num(o.startTick, `chats[${i}].startTick`),
        endTick: num(o.endTick, `chats[${i}].endTick`),
        placeId: str(o.placeId, `chats[${i}].placeId`, 40),
        a: oneOf<CharId>(o.a, CHAR_IDS, `chats[${i}].a`),
        b: oneOf<CharId>(o.b, CHAR_IDS, `chats[${i}].b`),
        done: o.done === true,
        lines: arr(o.lines, `chats[${i}].lines`).map((l, j) => {
          const lo = obj(l, `chats[${i}].lines[${j}]`);
          const line: ChatSession['lines'][number] = {
            tick: num(lo.tick, 'line.tick'),
            speaker: oneOf<CharId>(lo.speaker, CHAR_IDS, 'line.speaker'),
            text: str(lo.text, 'line.text', 300),
          };
          if (typeof lo.topic === 'string') line.topic = lo.topic.slice(0, 20);
          return line;
        }),
      };
      if (Array.isArray(o.relDelta) && o.relDelta.length === 2) {
        s.relDelta = [num(o.relDelta[0], 'relDelta'), num(o.relDelta[1], 'relDelta')];
      }
      return s;
    });
}

function decodeStats(v: unknown): Record<string, Record<CharId, DayStat>> {
  const o = obj(v, 'stats');
  const out: Record<string, Record<CharId, DayStat>> = {};
  for (const day of Object.keys(o).slice(-10)) {
    if (!/^\d+$/.test(day)) throw new Bad('stats のキーが不正です');
    out[day] = charRecord(o[day], `stats.${day}`, (x, n) => {
      const s = obj(x, n);
      const g = (k: keyof DayStat) => num(s[k], `${n}.${k}`, 0, 100000);
      return {
        work: g('work'),
        eat: g('eat'),
        rest: g('rest'),
        leisure: g('leisure'),
        chat: g('chat'),
        walk: g('walk'),
        sleep: g('sleep'),
        chats: g('chats'),
      };
    });
  }
  return out;
}

/** 保存データの文字列を検証して World にする */
export function parseSave(text: string): LoadResult {
  const fail = (reason: string): LoadResult => ({ ok: false, reason, empty: false });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('セーブデータが壊れています(JSONとして読めません)');
  }
  try {
    const top = obj(raw, 'セーブデータ');
    const version = top.version;
    if (version !== SAVE_VERSION) {
      return fail(`セーブデータのバージョンが違います(保存: ${String(version)} / このアプリ: ${SAVE_VERSION})`);
    }
    const w = obj(top.world, 'world');
    const weather = obj(w.weather, 'weather');
    let invite: World['invite'] = null;
    if (w.invite !== null && w.invite !== undefined) {
      const iv = obj(w.invite, 'invite');
      invite = {
        startTick: num(iv.startTick, 'invite.startTick'),
        endTick: num(iv.endTick, 'invite.endTick'),
        participants: arr(iv.participants, 'invite.participants').map((p) =>
          oneOf<CharId>(p, CHAR_IDS, 'invite.participants'),
        ),
      };
    }
    const ea = obj(w.eventAt, 'eventAt');
    const eventAt = { rain: num(ea.rain, 'eventAt.rain'), gift: num(ea.gift, 'eventAt.gift'), invite: num(ea.invite, 'eventAt.invite') };
    const chars = {} as Record<CharId, CharState>;
    const rawChars = obj(w.chars, 'chars');
    for (const id of CHAR_IDS) chars[id] = decodeChar(id, rawChars[id]);
    const world: World = {
      version: SAVE_VERSION,
      seed: int(w.seed, 'seed', 0, 4294967295),
      seedText: str(w.seedText, 'seedText', 100),
      tick: int(w.tick, 'tick', 0, 100000000),
      rngState: int(w.rngState, 'rngState', 0, 4294967295),
      weather: {
        current: oneOf<Weather>(weather.current, WEATHERS, 'weather.current'),
        prev: oneOf<Weather>(weather.prev, WEATHERS, 'weather.prev'),
        changedAt: num(weather.changedAt, 'weather.changedAt'),
        holdUntil: num(weather.holdUntil, 'weather.holdUntil'),
      },
      chars,
      log: decodeLog(w.log),
      nextLogId: int(w.nextLogId, 'nextLogId', 0),
      chats: decodeChats(w.chats),
      nextChatId: int(w.nextChatId, 'nextChatId', 0),
      invite,
      lastGiftAt: num(w.lastGiftAt, 'lastGiftAt'),
      eventAt,
      stats: decodeStats(w.stats),
    };
    const problems = checkInvariants(world);
    if (problems.length > 0) return fail(`セーブデータの内容に矛盾があります(${problems[0]})`);
    const savedAt = typeof top.savedAt === 'string' ? top.savedAt : '';
    return { ok: true, world, savedAt };
  } catch (e) {
    if (e instanceof Bad) return fail(`セーブデータが不正です: ${e.message}`);
    return fail('セーブデータを読み込めませんでした');
  }
}
