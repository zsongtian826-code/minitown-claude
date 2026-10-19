// 世界の整合性チェック。テストとデバッグ用に、「あり得ない状態」を文字列で返す。
// (睡眠中に勤務している、移動中に会話している、数値が範囲外、壁の中にいる、など)

import type { CharState, World } from './types';
import { CHAR_IDS } from './types';
import { HOME_ID, chebyshev, inBounds, isWalkable, manhattan, placeAt, samePoint } from './map';
import { PROFILES } from './profiles';

const STAT_KEYS = ['hunger', 'fatigue', 'mood'] as const;

export function checkInvariants(world: World): string[] {
  const errors: string[] = [];
  const err = (c: CharState, msg: string) => errors.push(`${PROFILES[c.id].name}: ${msg}`);

  for (const id of CHAR_IDS) {
    const c = world.chars[id];
    for (const k of STAT_KEYS) {
      const v = c[k];
      if (!Number.isFinite(v) || v < 0 || v > 100) err(c, `${k} が範囲外 (${v})`);
    }
    for (const other of CHAR_IDS) {
      const r = c.relations[other];
      if (!Number.isFinite(r) || r < 0 || r > 100) err(c, `関係値が範囲外 (${other}: ${r})`);
    }
    if (!inBounds(c.pos) || !isWalkable(c.pos)) err(c, `歩けない場所にいる (${c.pos.x},${c.pos.y})`);
    if (manhattan(c.pos, c.prev) > 1) err(c, '1tickで2マス以上動いた(瞬間移動)');

    const place = placeAt(c.pos);
    const plan = c.plan;

    if (c.activity === 'sleeping') {
      if (place?.id !== HOME_ID[id]) err(c, '睡眠中なのに自宅にいない');
      if (plan?.kind !== 'sleep') err(c, '睡眠中なのに計画が睡眠でない');
      if (c.chat) err(c, '睡眠中に会話している');
    }
    if (c.activity === 'working') {
      if (place?.id !== 'office') err(c, '勤務中なのにオフィスにいない');
      if (plan?.kind !== 'work') err(c, '勤務中なのに計画が勤務でない');
    }
    if (c.activity === 'eating' && plan?.kind !== 'eat') err(c, '食事中なのに計画が食事でない');
    if (c.activity === 'morning' && place?.id !== HOME_ID[id] && c.plan) err(c, '朝の準備中なのに自宅にいない');
    if (c.activity === 'gathering' && place?.id !== 'cafe') err(c, 'お茶会なのにカフェにいない');
    if (c.activity === 'walking') {
      if (plan?.stage !== 'travel') err(c, '移動中なのに計画が移動段階でない');
    }
    if (c.activity === 'chatting') {
      if (!c.chat) err(c, '会話中なのに会話情報がない');
      if (c.path.length > 0) err(c, '会話中に移動している');
    }
    if (c.chat) {
      const p = world.chars[c.chat.partner];
      if (p.chat?.partner !== id) err(c, '会話の相手が会話していない');
      if ((placeAt(p.pos)?.id ?? 'street') !== (place?.id ?? 'street')) err(c, '別の場所にいる相手と会話している');
      if (chebyshev(p.pos, c.pos) > 2) err(c, '離れた相手と会話している');
      if (p.activity === 'sleeping') err(c, '睡眠中の相手と会話している');
    }
    if (plan) {
      if (plan.stage === 'travel' && c.path.length === 0 && !c.chat) err(c, '移動段階なのに経路がない');
      if (plan.stage === 'doing' && plan.kind !== 'chat' && !c.chat && !samePoint(c.pos, plan.spot)) {
        err(c, `「${plan.kind}」をしているのに目的地(席)にいない`);
      }
      if (plan.stage === 'doing' && c.path.length > 0) err(c, '実行中なのに経路が残っている');
    } else if (!c.chat && world.tick > 0) {
      err(c, '計画がない(何もしていない)');
    }
  }
  return errors;
}
