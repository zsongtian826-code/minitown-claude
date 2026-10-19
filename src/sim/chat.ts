// キャラクター同士の会話。会話は「二人とも立ち止まっていて、同じ場所のすぐ近くにいる」ときだけ始まり、
// 数分間続き、終わったときに関係値と気分が変わる。ひとつひとつのセリフはルールベース(dialogue.ts)。

import type { Rng } from './rng';
import { chance, randInt, randRange } from './rng';
import type { CharId, CharState, ChatSession, World } from './types';
import { chebyshev, getPlace, hasPlace, placeAt } from './map';
import { PROFILES } from './profiles';
import { canBeApproached } from './behavior';
import { generateLine, type Topic } from './dialogue';
import { activityFor } from './activity';
import { CHAT_CAP, dayStats, pushLog } from './world';
import { clamp100 } from './needs';
import { isNight, minuteOfDay } from './clock';

/** 「同じ場所」とみなす単位。施設の中は施設ごと、それ以外はすべて街の通り */
function locationId(c: CharState): string {
  return placeAt(c.pos)?.id ?? 'street';
}

export function chatPlaceName(placeId: string): string {
  return hasPlace(placeId) ? getPlace(placeId).name : '街の通り';
}

export function sessionById(world: World, id: number): ChatSession | undefined {
  for (let i = world.chats.length - 1; i >= 0; i--) if (world.chats[i].id === id) return world.chats[i];
  return undefined;
}

/** a が b に話しかけて会話を始められるか(b が受けるかどうかの判定は別) */
export function canStartChat(world: World, a: CharState, b: CharState): boolean {
  if (isNight(minuteOfDay(world.tick) + 10)) return false;
  if (a.chat || !canBeApproached(b)) return false;
  if (a.activity === 'sleeping' || a.activity === 'morning') return false;
  if (locationId(a) !== locationId(b)) return false;
  return chebyshev(a.pos, b.pos) <= 2;
}

/** b が話しかけられて応じる確率 */
export function acceptProbability(b: CharState, a: CharState): number {
  const prof = PROFILES[b.id];
  let p = 0.45 + 0.5 * prof.sociability + (b.relations[a.id] - 50) / 200;
  if (b.hunger > 80) p -= 0.2;
  if (b.mood < 30) p -= 0.2;
  if (b.fatigue > 85) p -= 0.15;
  if (b.activity === 'eating') p -= 0.1;
  return Math.min(0.97, Math.max(0.05, p));
}

/** 相手と会話を始める(始められなければ false) */
export function tryStartChat(world: World, a: CharState, b: CharState, rng: Rng): boolean {
  if (!canStartChat(world, a, b)) return false;
  if (!chance(rng, acceptProbability(b, a))) return false;
  const profA = PROFILES[a.id];
  const profB = PROFILES[b.id];
  const social = (profA.sociability + profB.sociability) / 2;
  const duration = randInt(rng, 5, 10) + (social > 0.65 ? randInt(rng, 0, 5) : 0);
  const placeId = locationId(a);
  const session: ChatSession = {
    id: world.nextChatId++,
    startTick: world.tick,
    endTick: world.tick + duration,
    placeId,
    a: a.id,
    b: b.id,
    lines: [],
    done: false,
  };
  world.chats.push(session);
  if (world.chats.length > CHAT_CAP) world.chats.splice(0, world.chats.length - CHAT_CAP);
  for (const [me, other] of [
    [a, b],
    [b, a],
  ] as const) {
    me.chat = { sessionId: session.id, partner: other.id, startTick: session.startTick, endTick: session.endTick };
    me.activity = 'chatting';
    me.path = [];
    me.facing = other.pos.x === me.pos.x ? me.facing : other.pos.x > me.pos.x ? 1 : -1;
  }
  if (a.plan) {
    a.plan.stage = 'doing';
    a.plan.doUntil = session.endTick;
  }
  pushLog(world, 'talk', `${profA.name}が${profB.name}に話しかけた(${chatPlaceName(placeId)})`, a.id);
  speak(world, session, 0, rng);
  return true;
}

function lineCount(duration: number): number {
  return duration < 8 ? 2 : duration < 12 ? 3 : 4;
}

function speak(world: World, s: ChatSession, index: number, rng: Rng): void {
  const total = lineCount(s.endTick - s.startTick);
  const speakerId: CharId = index % 2 === 0 ? s.a : s.b;
  const listenerId: CharId = index % 2 === 0 ? s.b : s.a;
  const prev = s.lines.length > 0 ? (s.lines[s.lines.length - 1].topic as Topic | undefined) : undefined;
  const line = generateLine(world, speakerId, listenerId, index, total, prev ?? null, rng);
  s.lines.push({ tick: world.tick, speaker: speakerId, text: line.text, topic: line.topic });
  world.chars[speakerId].bubble = { text: line.text, untilTick: world.tick + 5 };
}

/** 会話が終わったとき、me から見た関係値と気分の変化を反映する。関係値の増減を返す */
function applyChatEffects(me: CharState, other: CharState, rng: Rng): number {
  const prof = PROFILES[me.id];
  const compat = (prof.sociability + PROFILES[other.id].sociability) / 2;
  const rel = me.relations[other.id];
  let gain = (1.2 + 3 * compat) * (1 - rel / 140) * (0.6 + 0.6 * (me.mood / 100)) + randRange(rng, -0.6, 0.6);
  if (me.hunger > 80 || me.fatigue > 90) gain -= 1; // ぼんやりして噛み合わない
  gain = Math.round(gain * 10) / 10;
  me.relations[other.id] = clamp100(Math.round((rel + gain) * 10) / 10);
  let dMood = (1.5 + 5 * prof.sociability) * (0.7 + 0.3 * (rel / 100));
  if (gain < 0) dMood -= 2;
  me.mood = clamp100(me.mood + dMood);
  return gain;
}

function endChat(world: World, s: ChatSession, rng: Rng): void {
  s.done = true;
  const a = world.chars[s.a];
  const b = world.chars[s.b];
  s.relDelta = [applyChatEffects(a, b, rng), applyChatEffects(b, a, rng)];

  for (const [me, other] of [
    [a, b],
    [b, a],
  ] as const) {
    me.chat = null;
    me.mem.lastChatWith[other.id] = world.tick;
    me.mem.lastDone.chat = world.tick;
    me.bubble = null;
  }
  dayStats(world)[a.id].chats += 1;
  dayStats(world)[b.id].chats += 1;

  // 話しかけた側: 会話の計画は終わり。話しかけられた側: 中断していた計画に戻る
  a.plan = null;
  a.activity = 'resting';
  if (b.plan) {
    b.activity = b.plan.stage === 'doing' ? activityFor(b.plan.kind) : 'walking';
  } else {
    b.activity = 'resting';
  }
}

/** 毎tick: 会話中のセリフ送りと終了を処理する */
export function tickChats(world: World, rng: Rng): void {
  for (const s of world.chats) {
    if (s.done) continue;
    const a = world.chars[s.a];
    const b = world.chars[s.b];
    if (a.chat?.sessionId !== s.id || b.chat?.sessionId !== s.id) {
      // 片方が会話から外れていたら閉じる(通常は起きない)
      s.done = true;
      for (const c of [a, b]) if (c.chat?.sessionId === s.id) c.chat = null;
      continue;
    }
    const duration = s.endTick - s.startTick;
    const n = lineCount(duration);
    const elapsed = world.tick - s.startTick;
    for (let i = 1; i < n; i++) {
      if (elapsed === Math.floor((i * duration) / n)) speak(world, s, i, rng);
    }
    if (world.tick >= s.endTick) endChat(world, s, rng);
  }
}

/** 会話を途中で打ち切る(お誘いイベントなどで予定が大きく変わったとき) */
export function abortChatOf(world: World, c: CharState, rng: Rng): void {
  if (!c.chat) return;
  const s = sessionById(world, c.chat.sessionId);
  if (s && !s.done) endChat(world, s, rng);
  else c.chat = null;
}

export function activeChatPartners(world: World): [CharId, CharId][] {
  const out: [CharId, CharId][] = [];
  for (const s of world.chats) if (!s.done) out.push([s.a, s.b]);
  return out;
}

