// ユーザー介入イベント。どれも「ログや表示だけ」ではなく、実際の世界の状態(天候・空腹・気分・計画)を変える。
// 連打しても壊れないように、二重発火の防止・効果の上限・クールダウンを入れている。

import type { Rng } from './rng';
import { randInt, randRange } from './rng';
import type { CharId, EventResult, GoalKind, UserEventType, World } from './types';
import { CHAR_IDS } from './types';
import { placeAt } from './map';
import { PROFILES } from './profiles';
import { minuteOfDay, workBlockAt } from './clock';
import { clamp100, smooth } from './needs';
import { setWeather } from './weather';
import { pushLog } from './world';
import { beginPlan } from './engine';
import { abortChatOf } from './chat';
import { isOpen, type Option } from './behavior';

export const EVENT_LABEL: Record<UserEventType, string> = {
  rain: '突然の雨',
  gift: '差し入れ',
  invite: '休憩のお誘い',
};

/** 雨の効果が続く最長の時間(分) */
const RAIN_MAX_HOLD = 240;
/** 差し入れが「まだ残っている」間(分) */
const GIFT_COOLDOWN = 30;
const INVITE_WINDOW = 90;

export function triggerEvent(world: World, rng: Rng, type: UserEventType): EventResult {
  // 二重発火の防止: 同じ種類が同じ瞬間にもう一度来ても無視する
  if (world.eventAt[type] === world.tick) {
    return { ok: false, message: 'いま発生させたばかりです(二重発火を防ぎました)' };
  }
  let result: EventResult;
  switch (type) {
    case 'rain':
      result = rainEvent(world, rng);
      break;
    case 'gift':
      result = giftEvent(world);
      break;
    case 'invite':
      result = inviteEvent(world, rng);
      break;
  }
  world.eventAt[type] = world.tick;
  world.rngState = rng.getState();
  return result;
}

function rainEvent(world: World, rng: Rng): EventResult {
  const w = world.weather;
  if (w.current === 'rainy') {
    w.holdUntil = Math.min(Math.max(w.holdUntil, world.tick + 90), world.tick + RAIN_MAX_HOLD);
    pushLog(world, 'event', '【突然の雨】もう雨が降っているので、雨はもうしばらく続きそうだ');
    return { ok: true, message: 'すでに雨でした。雨がしばらく続きます' };
  }
  w.holdUntil = world.tick + 120 + randInt(rng, 0, 60);
  setWeather(world, 'rainy', 'event');
  pushLog(world, 'event', '【突然の雨】空が急に暗くなり、雨を降らせた(2〜3時間ほど続く)');
  return { ok: true, message: '雨を降らせました' };
}

function giftEvent(world: World): EventResult {
  if (world.tick - world.lastGiftAt < GIFT_COOLDOWN) {
    pushLog(world, 'event', '【差し入れ・残り】前の差し入れがまだ残っているので、新しくは届かなかった');
    return { ok: false, message: '前の差し入れがまだ残っています' };
  }
  const present: CharId[] = [];
  const absent: CharId[] = [];
  for (const id of CHAR_IDS) {
    const c = world.chars[id];
    if (placeAt(c.pos)?.id === 'office' && c.activity !== 'sleeping') present.push(id);
    else absent.push(id);
  }
  if (present.length === 0) {
    pushLog(world, 'event', '【差し入れ・不在】差し入れが届いたが、オフィスは無人だった(誰にも効果なし)');
    return { ok: false, message: 'オフィスに誰もいないので、効果はありませんでした' };
  }
  world.lastGiftAt = world.tick;
  for (const id of present) {
    const c = world.chars[id];
    const h0 = c.hunger;
    const m0 = c.mood;
    c.hunger = clamp100(c.hunger - 25);
    c.mood = clamp100(c.mood + 10);
    c.bubble = { text: 'わ、差し入れだ！', untilTick: world.tick + 5 };
    pushLog(
      world,
      'event',
      `【差し入れ】${PROFILES[id].name}に食べ物が届いた(空腹 ${Math.round(h0)}→${Math.round(c.hunger)}、気分 ${Math.round(m0)}→${Math.round(c.mood)})`,
      id,
    );
  }
  if (absent.length > 0) {
    pushLog(world, 'event', `【差し入れ】${absent.map((id) => PROFILES[id].name).join('・')}はオフィスにいないので届かなかった`);
  }
  return { ok: true, message: `${present.map((id) => PROFILES[id].name).join('・')}に届きました` };
}

/** お誘いに乗る気持ちの強さ。(参加する/しない)の判断と、理由を返す */
function joinDecision(world: World, id: CharId, rng: Rng): { join: boolean; why: string } {
  const c = world.chars[id];
  const prof = PROFILES[id];
  if (c.activity === 'sleeping') return { join: false, why: 'ぐっすり眠っているため' };
  let s = 0.35 + 0.45 * prof.sociability + 0.002 * (c.mood - 50);
  s -= 0.25 * smooth(c.fatigue, 70, 100);
  s += 0.15 * smooth(c.hunger, 40, 80);
  const working = c.activity === 'working' && workBlockAt(minuteOfDay(world.tick)) !== null;
  if (working) s -= 0.3 * prof.diligence;
  s += randRange(rng, -0.1, 0.1);
  if (s >= 0.55) return { join: true, why: '' };
  if (working) return { join: false, why: '仕事を優先して' };
  if (c.fatigue > 70) return { join: false, why: '疲れていて' };
  return { join: false, why: '気が乗らず' };
}

function inviteEvent(world: World, rng: Rng): EventResult {
  const now = world.tick;
  if (world.invite && now < world.invite.endTick) {
    pushLog(world, 'event', '【お誘い】さきほどのお誘いがまだ続いているので、新しいお誘いは見送られた');
    return { ok: false, message: 'お誘いが進行中です' };
  }
  const m = minuteOfDay(now);
  if (!isOpen('cafe', m)) {
    pushLog(world, 'event', '【お誘い】カフェが閉まっている時間なので、お誘いは見送られた');
    return { ok: false, message: 'カフェが閉まっています(7:00〜22:00)' };
  }
  pushLog(world, 'event', '【お誘い】「カフェでちょっと休憩しませんか？」とお誘いが届いた');
  const joiners: CharId[] = [];
  for (const id of CHAR_IDS) {
    const d = joinDecision(world, id, rng);
    const name = PROFILES[id].name;
    if (!d.join) {
      pushLog(world, 'event', `【お誘い】${name}は${d.why}、今回は見送った`, id);
      continue;
    }
    joiners.push(id);
    pushLog(world, 'event', `【お誘い】${name}はお誘いに乗って、カフェへ向かう`, id);
  }
  if (joiners.length === 0) {
    return { ok: true, message: '誰も参加しませんでした' };
  }
  world.invite = { startTick: now, endTick: now + INVITE_WINDOW, participants: joiners };
  for (const id of joiners) {
    const c = world.chars[id];
    abortChatOf(world, c, rng);
    c.plan = null;
    c.path = [];
    const opt: Option = {
      key: 'gather@cafe',
      kind: 'gather' as GoalKind,
      placeId: 'cafe',
      score: 99,
      reason: 'お茶のお誘いに乗った',
      duration: [35, 55],
    };
    beginPlan(world, c, opt, rng);
  }
  return { ok: true, message: `${joiners.map((id) => PROFILES[id].name).join('・')}が参加します` };
}
