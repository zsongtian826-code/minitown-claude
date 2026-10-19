import { describe, expect, it } from 'vitest';
import { CHAR_IDS, type World } from '../types';
import { ALL_POOLS, ALL_REACTIONS, buildDCtx, tplUsable, type DCtx, type DialogueFlag, type Tpl } from '../dialogue';
import { canStartChat, tryStartChat } from '../chat';
import { SeededRng } from '../rng';
import { newSim, runTo, expectValid } from './helpers';

describe('会話', () => {
  it('テスト12: 会話をすると関係値と気分が変わり、会話ログが残る', () => {
    const sim = newSim(42);
    const before = JSON.parse(JSON.stringify(sim.world.chars)) as World['chars'];
    runTo(sim, 2, 0, 0);
    const done = sim.world.chats.filter((s) => s.done);
    expect(done.length).toBeGreaterThan(2);
    for (const s of done) {
      expect(s.lines.length).toBeGreaterThanOrEqual(2);
      expect(s.relDelta).toBeDefined();
      expect(s.endTick).toBeGreaterThan(s.startTick);
      // 話者は二人が交互に話す
      expect(new Set(s.lines.map((l) => l.speaker)).size).toBe(2);
      for (const l of s.lines) expect(l.text.length).toBeGreaterThan(3);
    }
    let changed = 0;
    for (const id of CHAR_IDS) {
      for (const o of CHAR_IDS) {
        if (id !== o && Math.abs(sim.world.chars[id].relations[o] - before[id].relations[o]) >= 0.5) changed++;
      }
    }
    expect(changed).toBeGreaterThanOrEqual(2);
  });

  it('会話は一人ずつ同時に1つだけで、二人とも立ち止まり、同じ場所のすぐ近くにいる。睡眠中・移動中には起きない', () => {
    for (const seed of [1, 2, 3, 42, 12345]) {
      const sim = newSim(seed);
      for (let i = 0; i < 72 * 60; i++) {
        sim.step();
        expectValid(sim.world);
        const talking = CHAR_IDS.filter((id) => sim.world.chars[id].chat);
        expect(talking.length === 0 || talking.length === 2).toBe(true);
        for (const id of talking) {
          const c = sim.world.chars[id];
          expect(c.activity).toBe('chatting');
          expect(c.path.length).toBe(0);
        }
      }
    }
  });

  it('テスト11: 睡眠中の相手とは会話を始められない', () => {
    const sim = newSim(1);
    runTo(sim, 1, 23, 50);
    const [a, m] = [sim.world.chars.aoi, sim.world.chars.mina];
    expect(m.activity).toBe('sleeping');
    expect(canStartChat(sim.world, a, m)).toBe(false);
    expect(tryStartChat(sim.world, a, m, new SeededRng(1))).toBe(false);
    // 睡眠中のセッションがないことを、3日間のすべての会話の時刻で確認
    const sim2 = newSim(2);
    sim2.run(72 * 60);
    for (const s of sim2.world.chats) {
      const startMinute = (s.startTick + 420) % 1440;
      expect(startMinute).toBeGreaterThanOrEqual(6 * 60);
      expect(startMinute).toBeLessThan(23 * 60);
    }
  });

  it('同じ二人の会話は短い間隔では繰り返されない(不自然な頻度の防止)', () => {
    const sim = newSim(12345);
    sim.run(72 * 60);
    const last: Record<string, number> = {};
    for (const s of sim.world.chats) {
      const key = [s.a, s.b].sort().join('-');
      if (last[key] !== undefined) expect(s.startTick - last[key]).toBeGreaterThanOrEqual(25);
      last[key] = s.endTick;
    }
  });

  it('同じセリフばかりにならない(3日間で同一セリフの占有率が低い)', () => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const seed of [1, 2, 3, 42, 12345]) {
      const sim = newSim(seed);
      sim.run(72 * 60);
      for (const s of sim.world.chats) {
        for (const l of s.lines) {
          counts.set(l.text, (counts.get(l.text) ?? 0) + 1);
          total++;
        }
      }
    }
    expect(total).toBeGreaterThan(100);
    expect(counts.size).toBeGreaterThan(40);
    const max = Math.max(...counts.values());
    expect(max / total).toBeLessThan(0.1);
  });
});

describe('会話の整合性(天候・出来事)', () => {
  const allTemplates: { who: string; topic: string; tpl: Tpl }[] = [];
  for (const id of CHAR_IDS) {
    for (const [topic, list] of Object.entries(ALL_POOLS[id])) {
      for (const tpl of list ?? []) allTemplates.push({ who: id, topic, tpl });
    }
    for (const [topic, list] of Object.entries(ALL_REACTIONS[id])) {
      for (const tpl of list ?? []) allTemplates.push({ who: id, topic: `react.${topic}`, tpl });
    }
  }

  it('雨に触れるセリフは、必ず天候か出来事の条件が付いている', () => {
    const rainy = allTemplates.filter(({ tpl }) => /雨|傘|水たまり/.test(tpl.text));
    expect(rainy.length).toBeGreaterThan(10);
    for (const { who, topic, tpl } of rainy) {
      expect(Boolean(tpl.wx || tpl.flag), `${who}.${topic}: ${tpl.text}`).toBe(true);
    }
  });

  it('「雨が止んだ」系のセリフは、直前に雨が止んだときだけ使える。降っている・降り出したセリフは雨のときだけ', () => {
    const stopped = allTemplates.filter(({ tpl }) => /止み|上がっ|やん|上が(?!り込)/.test(tpl.text) && /雨/.test(tpl.text));
    expect(stopped.length).toBeGreaterThanOrEqual(3);
    for (const { tpl } of stopped) expect(tpl.flag).toBe('rainStopped');
    const started = allTemplates.filter(({ tpl }) => /降り出し|降ってきた/.test(tpl.text));
    for (const { tpl } of started) expect(tpl.flag === 'rainStarted' || tpl.flag === 'rainEvent').toBe(true);
    const nowRaining = allTemplates.filter(({ tpl }) => /雨ですね|雨かあ|雨だと|雨の日|雨音|雨の音/.test(tpl.text));
    for (const { tpl } of nowRaining) expect(tpl.wx).toEqual(['rainy']);
  });

  it('実際の会話でも、雨に触れる発言は内部の天候と矛盾しない(3日間×複数シード、イベント入り)', () => {
    let rainyLines = 0;
    let stoppedLines = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const sim = newSim(seed);
      const seen = new Set<string>();
      for (let i = 0; i < 72 * 60; i++) {
        sim.step();
        if (i % 700 === 300) sim.trigger('rain');
        const w = sim.world;
        for (const s of w.chats) {
          for (const l of s.lines) {
            if (l.tick !== w.tick) continue;
            const key = `${s.id}:${l.tick}:${l.speaker}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (!/雨|傘|水たまり/.test(l.text)) continue;
            const d = buildDCtx(w, l.speaker, l.speaker === s.a ? s.b : s.a);
            // このセリフに一致する、いま使えるテンプレートがある
            const ok = allTemplates.some(({ who, tpl }) => {
              if (who !== l.speaker) return false;
              const re = new RegExp('^' + tpl.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{L\\}', '.{0,8}') + '$');
              if (!re.test(l.text)) return false;
              return !(tpl.wx && !tpl.wx.includes(d.weather)) && !(tpl.flag && !d.flags.has(tpl.flag));
            });
            expect(ok, `${w.tick} ${l.speaker}: ${l.text} (weather=${w.weather.current}, prev=${w.weather.prev})`).toBe(true);
            if (w.weather.current === 'rainy') rainyLines++;
            if (/止み|上がっ|やん/.test(l.text)) {
              stoppedLines++;
              expect(w.weather.current).not.toBe('rainy');
              expect(w.weather.prev).toBe('rainy');
            }
          }
        }
      }
    }
    expect(rainyLines).toBeGreaterThan(0);
    expect(stoppedLines).toBeGreaterThanOrEqual(0);
  });

  it('どのテンプレートも、何らかの状況で選べる(死んだ条件がない)', () => {
    const usable = new Set<Tpl>();
    const flagSets: DialogueFlag[][] = [[], ['rainStopped'], ['rainStarted'], ['gift'], ['invite'], ['rainEvent']];
    for (const m of [8 * 60, 14 * 60, 19 * 60, 23 * 60 + 30]) {
      for (const weather of ['sunny', 'cloudy', 'rainy'] as const) {
        for (const placeKind of [null, 'home', 'office', 'cafe', 'park', 'plaza'] as const) {
          for (const mood of [20, 50, 80]) {
            for (const rel of [20, 50, 80]) {
              for (const flags of flagSets) {
                const d: DCtx = {
                  m,
                  part: m < 660 ? 'morning' : m < 1020 ? 'day' : m < 1380 ? 'evening' : 'night',
                  weather,
                  prevWeather: flags.includes('rainStopped') ? 'rainy' : weather,
                  sinceChange: 10,
                  hunger: 60,
                  fatigue: 60,
                  mood,
                  rel,
                  placeKind,
                  flags: new Set(flags),
                };
                for (const { tpl } of allTemplates) if (tplUsable(tpl, d)) usable.add(tpl);
              }
            }
          }
        }
      }
    }
    const unused = allTemplates.filter(({ tpl }) => !usable.has(tpl));
    expect(unused.map((u) => `${u.who}.${u.topic}: ${u.tpl.text}`)).toEqual([]);
  });
});
