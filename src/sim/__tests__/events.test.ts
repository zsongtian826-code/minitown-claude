import { describe, expect, it } from 'vitest';
import { CHAR_IDS, type CharId } from '../types';
import { placeAt } from '../map';
import { Simulation } from '../simulation';
import { SeededRng, randInt } from '../rng';
import { clone, expectValid, newSim, runTo } from './helpers';

/** 屋外が混ざっている/天気が晴れ曇りの時間を探す */
function findSim(pred: (sim: Simulation) => boolean, day: number, h: number, m = 0): Simulation {
  for (let seed = 1; seed < 200; seed++) {
    const sim = newSim(seed);
    runTo(sim, day, h, m, false);
    if (pred(sim)) return sim;
  }
  throw new Error('条件に合うシードがありません');
}

describe('天候', () => {
  it('天候は晴れ・曇り・雨のいずれかで、時間とともに変化し、同じシードなら再現される', () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const sim = newSim(seed);
      for (let i = 0; i < 72 * 60; i++) {
        sim.step();
        seen.add(sim.world.weather.current);
      }
    }
    expect([...seen].sort()).toEqual(['cloudy', 'rainy', 'sunny']);
  });

  it('テスト14: 天候が変わるtickには、内部状態と一致するログが必ず1件でき、変わらないtickにはできない', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const sim = newSim(seed);
      let prev = sim.world.weather.current;
      let logLen = sim.world.log.length;
      for (let i = 0; i < 72 * 60; i++) {
        sim.step();
        if (i % 600 === 0 && i > 0 && i < 3 * 600) sim.trigger('rain');
        const cur = sim.world.weather.current;
        const fresh = sim.world.log.slice(logLen).filter((e) => e.type === 'weather' && !e.text.includes('予定を変えた'));
        logLen = sim.world.log.length;
        if (cur !== prev) {
          expect(fresh.length, `tick ${sim.world.tick}`).toBe(1);
          const text = fresh[0].text;
          if (cur === 'rainy') expect(text).toMatch(/雨が降り出した/);
          else if (prev === 'rainy') expect(text).toMatch(/雨が止ん/);
          else expect(text).toMatch(/雲/);
          // 雨が止んだというログがあるとき、内部の天候は雨ではない
          if (/雨が止ん/.test(text)) expect(cur).not.toBe('rainy');
          if (/雨が降り出した/.test(text)) expect(cur).toBe('rainy');
          expect(sim.world.weather.prev).toBe(prev);
        } else {
          expect(fresh.length).toBe(0);
        }
        prev = cur;
      }
    }
  });
});

describe('ユーザー介入イベント', () => {
  it('テスト13: 突然の雨で、内部の天候が雨になり、ログにも記録される', () => {
    const sim = findSim((s) => s.world.weather.current !== 'rainy', 1, 10);
    const r = sim.trigger('rain');
    expect(r.ok).toBe(true);
    expect(sim.world.weather.current).toBe('rainy');
    expect(sim.world.weather.holdUntil).toBeGreaterThan(sim.world.tick + 100);
    expect(sim.world.log.some((e) => e.type === 'weather' && e.text.includes('突然の雨'))).toBe(true);
    expect(sim.world.log.some((e) => e.type === 'event' && e.text.includes('【突然の雨】'))).toBe(true);
    // 雨の効果時間のあいだは、自然な天気変化で勝手に止まない
    for (let i = 0; i < 100; i++) {
      sim.step();
      expect(sim.world.weather.current).toBe('rainy');
    }
  });

  it('屋外にいる人は、雨で行き先を見直し、屋内に移る(屋内の人はそのまま)', () => {
    // 夕方に屋外(公園・広場)で過ごしている人がいる時刻を探す
    const sim = findSim(
      (s) => s.world.weather.current !== 'rainy' && CHAR_IDS.some((id) => {
        const c = s.world.chars[id];
        const p = placeAt(c.pos);
        return (c.activity === 'leisure' || c.activity === 'resting') && p && !p.indoor;
      }),
      1,
      19,
      0,
    );
    const outdoors = CHAR_IDS.filter((id) => {
      const p = placeAt(sim.world.chars[id].pos);
      return sim.world.chars[id].activity !== 'sleeping' && !(p && p.indoor);
    });
    expect(outdoors.length).toBeGreaterThan(0);
    sim.trigger('rain');
    for (const id of outdoors) expect(sim.world.chars[id].replan).toBe('rain');
    sim.run(1);
    for (const id of outdoors) {
      const plan = sim.world.chars[id].plan!;
      // 屋外の施設を行き先にしていない
      expect(['park', 'plaza']).not.toContain(plan.placeId);
    }
    expect(sim.world.log.some((e) => e.type === 'weather' && e.text.includes('雨を避けて'))).toBe(true);
    for (let i = 0; i < 400; i++) {
      sim.step();
      expectValid(sim.world);
    }
  });

  it('テスト15: 差し入れは、オフィスにいる人にだけ効く', () => {
    const sim = findSim(
      (s) => {
        const at = CHAR_IDS.map((id) => placeAt(s.world.chars[id].pos)?.id === 'office');
        return at.some(Boolean) && at.some((x) => !x);
      },
      1,
      12,
      20,
    );
    const before = clone(sim.world.chars);
    const inOffice = CHAR_IDS.filter((id) => placeAt(sim.world.chars[id].pos)?.id === 'office');
    const notInOffice = CHAR_IDS.filter((id) => !inOffice.includes(id));
    const r = sim.trigger('gift');
    expect(r.ok).toBe(true);
    for (const id of inOffice) {
      const c = sim.world.chars[id];
      expect(c.hunger).toBe(Math.max(0, before[id].hunger - 25));
      expect(c.mood).toBe(Math.min(100, before[id].mood + 10));
    }
    for (const id of notInOffice) {
      expect(sim.world.chars[id].hunger).toBe(before[id].hunger);
      expect(sim.world.chars[id].mood).toBe(before[id].mood);
    }
    expect(sim.world.log.some((e) => e.type === 'event' && e.text.includes('【差し入れ】'))).toBe(true);
  });

  it('差し入れ: オフィスが無人なら誰にも効かない(連打しても数値は0〜100のまま)', () => {
    const sim = newSim(5);
    runTo(sim, 1, 22, 0);
    const before = clone(sim.world.chars);
    const r = sim.trigger('gift');
    expect(r.ok).toBe(false);
    for (const id of CHAR_IDS) {
      expect(sim.world.chars[id].hunger).toBe(before[id].hunger);
      expect(sim.world.chars[id].mood).toBe(before[id].mood);
    }
    const sim2 = newSim(5);
    runTo(sim2, 1, 10, 0);
    for (let i = 0; i < 50; i++) sim2.trigger('gift');
    for (const id of CHAR_IDS) {
      expect(sim2.world.chars[id].hunger).toBeGreaterThanOrEqual(0);
      expect(sim2.world.chars[id].mood).toBeLessThanOrEqual(100);
    }
    // 差し入れが効いたログは、連打しても1回分(クールダウン)
    expect(sim2.world.log.filter((e) => e.text.startsWith('【差し入れ】') && e.who).length).toBeLessThanOrEqual(3);
  });

  it('お誘い: 睡眠中は不参加。参加する人はカフェへ向かって集まり、会話が生まれる', () => {
    const night = newSim(7);
    runTo(night, 1, 23, 50);
    const r0 = night.trigger('invite');
    expect(r0.ok).toBe(false); // カフェは閉まっている
    expect(CHAR_IDS.every((id) => night.world.chars[id].activity === 'sleeping')).toBe(true);

    const sim = newSim(7);
    runTo(sim, 1, 19, 0);
    sim.trigger('invite');
    const log = sim.world.log.filter((e) => e.text.startsWith('【お誘い】'));
    expect(log.length).toBeGreaterThanOrEqual(4);
    const joined = sim.world.invite?.participants ?? [];
    expect(joined.length).toBeGreaterThan(0);
    for (const id of CHAR_IDS) {
      if (!joined.includes(id)) expect(log.some((e) => e.who === id && e.text.includes('見送った'))).toBe(true);
    }
    let gathered = new Set<CharId>();
    for (let i = 0; i < 90; i++) {
      sim.step();
      expectValid(sim.world);
      for (const id of joined) {
        const c = sim.world.chars[id];
        if (c.activity === 'gathering') {
          gathered.add(id);
          expect(placeAt(c.pos)?.id).toBe('cafe');
        }
      }
    }
    expect(gathered.size).toBe(joined.length);
  });

  it('同じ施設を複数人が使うとき、席は重ならない(カフェに集まった人は別々の席にいる)', () => {
    for (const seed of [7, 8, 9, 10, 11]) {
      const sim = newSim(seed);
      runTo(sim, 1, 19, 0);
      sim.trigger('invite');
      for (let i = 0; i < 80; i++) {
        sim.step();
        const seated = CHAR_IDS.filter((id) => sim.world.chars[id].activity === 'gathering');
        const spots = seated.map((id) => `${sim.world.chars[id].pos.x},${sim.world.chars[id].pos.y}`);
        expect(new Set(spots).size).toBe(spots.length);
      }
    }
  });

  it('お誘い: 仕事中のアオイは見送り、睡眠中は参加できない', () => {
    const sim = newSim(7);
    runTo(sim, 1, 10, 30);
    sim.trigger('invite');
    const aoiLog = sim.world.log.filter((e) => e.who === 'aoi' && e.text.startsWith('【お誘い】'));
    expect(aoiLog.length).toBe(1);
    expect(aoiLog[0].text).toContain('見送った');
    expect(sim.world.chars.aoi.activity).toBe('working');
  });

  it('テスト16: イベントのあとは通常の自律行動に戻り、生活のリズムが続く', () => {
    const sim = newSim(11);
    runTo(sim, 1, 10, 0);
    sim.trigger('rain');
    sim.trigger('gift');
    runTo(sim, 1, 14, 0);
    sim.trigger('invite');
    runTo(sim, 1, 18, 0);
    // お誘いの時間が過ぎたら、お茶会は終わっている
    expect(CHAR_IDS.some((id) => sim.world.chars[id].activity === 'gathering')).toBe(false);
    expect(sim.world.invite).toBeNull();
    runTo(sim, 1, 23, 40);
    for (const id of CHAR_IDS) {
      expect(sim.world.chars[id].activity).toBe('sleeping');
      expect(placeAt(sim.world.chars[id].pos)?.id).toBe(`home_${id}`);
    }
    runTo(sim, 2, 9, 30);
    expect(CHAR_IDS.every((id) => sim.world.chars[id].activity === 'working')).toBe(true);
  });

  it('イベントを連打・乱打しても状態が破綻しない(二重発火も防ぐ)', () => {
    const sim = newSim(3);
    runTo(sim, 1, 9, 0);
    for (let i = 0; i < 100; i++) {
      sim.trigger('rain');
      sim.trigger('gift');
      sim.trigger('invite');
    }
    expectValid(sim.world);
    expect(sim.world.weather.holdUntil).toBeLessThanOrEqual(sim.world.tick + 240);
    // 同じ瞬間の同種イベントは無視される
    const again = sim.trigger('rain');
    expect(again.ok).toBe(false);
    for (let i = 0; i < 24 * 60; i++) {
      sim.step();
      expectValid(sim.world);
    }
    // ランダムなタイミングで乱打(別の乱数列)
    const chaos = new SeededRng(99);
    const sim2 = newSim(8);
    for (let i = 0; i < 72 * 60; i++) {
      sim2.step();
      if (chaos.next() < 0.02) sim2.trigger(['rain', 'gift', 'invite'][randInt(chaos, 0, 2)] as 'rain');
      expectValid(sim2.world);
    }
  });
});
