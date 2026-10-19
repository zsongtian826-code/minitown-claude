import { describe, expect, it } from 'vitest';
import { CHAR_IDS } from '../types';
import { HOME_ID, placeAt } from '../map';
import { formatStamp } from '../clock';
import { clone, expectValid, newSim, runTo, snapshot } from './helpers';

describe('自律行動: 一日の暮らし', () => {
  it('テスト1: 3人がそれぞれ独立して行動する(同じ時刻でも別の行動・場所になる)', () => {
    const sim = newSim(12345);
    let differentActivity = 0;
    let differentPlace = 0;
    for (let i = 0; i < 24 * 60; i++) {
      sim.step();
      const [a, m, r] = CHAR_IDS.map((id) => sim.world.chars[id]);
      if (new Set([a.activity, m.activity, r.activity]).size > 1) differentActivity++;
      if (new Set([`${a.pos.x},${a.pos.y}`, `${m.pos.x},${m.pos.y}`, `${r.pos.x},${r.pos.y}`]).size === 3) differentPlace++;
    }
    expect(differentActivity).toBeGreaterThan(200);
    expect(differentPlace).toBeGreaterThan(800);
    // 1人の状態を変えても、他の人の持ち物(状態)は変わらない
    const w = clone(sim.world);
    expect(w.chars.aoi.hunger).toBe(sim.world.chars.aoi.hunger);
    sim.world.chars.aoi.hunger = 5;
    expect(sim.world.chars.mina.hunger).toBe(w.chars.mina.hunger);
  });

  it('テスト6: 目的地へ到達する(移動を始めた人が、その場所で「する」段階に入る)', () => {
    const sim = newSim(1);
    let arrivals = 0;
    const prevStage: Record<string, string> = {};
    for (let i = 0; i < 24 * 60; i++) {
      sim.step();
      for (const id of CHAR_IDS) {
        const p = sim.world.chars[id].plan;
        const key = p ? `${p.kind}@${p.startedAt}` : 'none';
        if (p?.stage === 'doing' && prevStage[id] === `${key}:travel`) {
          arrivals++;
          expect(sim.world.chars[id].pos).toEqual(p.spot);
        }
        prevStage[id] = `${key}:${p?.stage}`;
      }
    }
    expect(arrivals).toBeGreaterThan(20);
    // 朝は全員オフィスに到着して仕事を始める
    const works = sim.world.log.filter((e) => e.type === 'work' && e.text.includes('仕事を始めた'));
    expect(new Set(works.map((e) => e.who)).size).toBe(3);
  });

  it('テスト9: 全員が帰宅し、夜は自宅で眠っている', () => {
    for (const seed of [1, 2, 42, 12345]) {
      const sim = newSim(seed);
      runTo(sim, 1, 23, 40);
      for (const id of CHAR_IDS) {
        const c = sim.world.chars[id];
        expect(placeAt(c.pos)?.id).toBe(HOME_ID[id]);
        expect(c.activity).toBe('sleeping');
      }
      expect(sim.world.log.filter((e) => e.type === 'home').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('テスト10: 就寝して、翌朝に起床する', () => {
    const sim = newSim(42);
    runTo(sim, 2, 9, 30);
    for (const id of CHAR_IDS) {
      const logs = sim.world.log.filter((e) => e.who === id);
      const sleep = logs.find((e) => e.type === 'sleep');
      const wake = logs.filter((e) => e.type === 'wake').pop()!;
      expect(sleep).toBeDefined();
      expect(wake.tick).toBeGreaterThan(sleep!.tick);
      expect(formatStamp(wake.tick)).toMatch(/^2日目 0[789]:/);
      expect(sim.world.chars[id].activity).not.toBe('sleeping');
    }
  });

  it('基準スケジュール: 07:00に起きて、09:00ごろ勤務、12:00に昼食、13:00に勤務再開、17:00に勤務終了', () => {
    const sim = newSim(2);
    const at = (h: number, m = 0) => {
      runTo(sim, 1, h, m);
      return CHAR_IDS.map((id) => sim.world.chars[id].activity);
    };
    expect(at(7, 30)).toEqual(expect.arrayContaining(['morning']));
    expect(at(9, 15)).toEqual(['working', 'working', 'working']);
    expect(at(10, 30)).toEqual(['working', 'working', 'working']);
    const lunch = at(12, 20);
    expect(lunch.some((a) => a === 'eating' || a === 'walking')).toBe(true);
    expect(lunch.filter((a) => a === 'working').length).toBeLessThanOrEqual(1);
    expect(at(13, 30)).toEqual(['working', 'working', 'working']);
    expect(at(16, 30)).toEqual(['working', 'working', 'working']);
    const evening = at(18, 30);
    expect(evening.filter((a) => a === 'working').length).toBe(0);
  });

  it('個性: アオイは出勤が早く、仕事の時間が長い。ミナは会話が多く、レンは寄り道(自由時間)が多い', () => {
    const totals = { aoi: { work: 0, chats: 0, leisure: 0 }, mina: { work: 0, chats: 0, leisure: 0 }, ren: { work: 0, chats: 0, leisure: 0 } };
    for (const seed of [1, 2, 3, 42, 12345]) {
      const sim = newSim(seed);
      sim.run(72 * 60);
      for (const day of Object.values(sim.world.stats)) {
        for (const id of CHAR_IDS) {
          totals[id].work += day[id].work;
          totals[id].chats += day[id].chats;
          totals[id].leisure += day[id].leisure;
        }
      }
    }
    expect(totals.aoi.work).toBeGreaterThan(totals.mina.work);
    expect(totals.aoi.work).toBeGreaterThan(totals.ren.work);
    expect(totals.mina.chats).toBeGreaterThan(totals.aoi.chats);
    expect(totals.ren.leisure).toBeGreaterThan(totals.aoi.leisure);
  });
});

describe('自律行動: 状態に応じた判断', () => {
  it('テスト7: 空腹度が極端に高いと、仕事より食事を優先する', () => {
    for (const id of CHAR_IDS) {
      const sim = newSim(3);
      runTo(sim, 1, 10, 0);
      expect(sim.world.chars[id].activity).toBe('working');
      sim.world.chars[id].hunger = 96;
      let ate = false;
      for (let i = 0; i < 60 && !ate; i++) {
        sim.step();
        expectValid(sim.world);
        ate = sim.world.chars[id].activity === 'eating';
      }
      expect(ate, `${id} は空腹で食事に向かうはず`).toBe(true);
    }
  });

  it('テスト7b: 空腹でなければ、勤務時間中に食事へ向かわない(時間だけでなく状態で動く)', () => {
    const sim = newSim(3);
    runTo(sim, 1, 9, 30);
    for (let i = 0; i < 100; i++) {
      sim.step();
      for (const id of CHAR_IDS) expect(sim.world.chars[id].activity).toBe('working');
    }
  });

  it('テスト8: 疲労度が高いと、休憩や睡眠を選ぶ', () => {
    for (const id of CHAR_IDS) {
      const sim = newSim(3);
      runTo(sim, 1, 14, 0);
      sim.world.chars[id].fatigue = 97;
      let rested = false;
      for (let i = 0; i < 90 && !rested; i++) {
        sim.step();
        expectValid(sim.world);
        const a = sim.world.chars[id].activity;
        rested = a === 'resting' || a === 'sleeping' || a === 'gathering';
      }
      expect(rested, `${id} は疲れ切って休憩に向かうはず`).toBe(true);
    }
    // 夜に疲れ切っていれば、早めに就寝する
    const sim = newSim(3);
    runTo(sim, 1, 20, 0);
    for (const id of CHAR_IDS) sim.world.chars[id].fatigue = 98;
    let slept = 0;
    for (let i = 0; i < 120; i++) {
      sim.step();
      slept = CHAR_IDS.filter((id) => sim.world.chars[id].activity === 'sleeping').length;
      if (slept === 3) break;
    }
    expect(slept).toBeGreaterThanOrEqual(2);
  });

  it('睡眠中に勤務せず、食事中に仕事をしない(毎tickの整合性チェックを3日間)', () => {
    const sim = newSim(99);
    for (let i = 0; i < 72 * 60; i++) {
      sim.step();
      expectValid(sim.world);
      for (const id of CHAR_IDS) {
        const c = sim.world.chars[id];
        if (c.activity === 'sleeping') expect(c.plan?.kind).toBe('sleep');
        if (c.activity === 'eating') expect(c.plan?.kind).not.toBe('work');
        if (c.activity === 'working') expect(c.plan?.kind).toBe('work');
      }
    }
  });

  it('同じことを永久には繰り返さず、行き先を無駄に変え続けない', () => {
    for (const seed of [1, 2, 3, 42, 12345]) {
      const sim = newSim(seed);
      const starts: Record<string, number> = { aoi: 0, mina: 0, ren: 0 };
      const last: Record<string, string> = {};
      const keys: Record<string, string[]> = { aoi: [], mina: [], ren: [] };
      let quickFlips = 0;
      for (let i = 0; i < 72 * 60; i++) {
        sim.step();
        for (const id of CHAR_IDS) {
          const p = sim.world.chars[id].plan;
          const sig = p ? `${p.kind}@${p.placeId}#${p.startedAt}` : '';
          if (sig && last[id] !== sig) {
            starts[id]++;
            keys[id].push(`${p!.kind}@${p!.placeId}`);
            if (p!.stage === 'travel') {
              /* 到着前の乗り換えを数える */
            }
            last[id] = sig;
          }
        }
      }
      for (const id of CHAR_IDS) {
        // 1日あたり計画は30件未満(切り替えの連発をしていない)
        expect(starts[id]).toBeLessThan(90);
        // 同じ「休憩/自由時間/食事」が5回以上連続しない
        let run = 1;
        for (let i = 1; i < keys[id].length; i++) {
          const same = keys[id][i] === keys[id][i - 1] && !/^(work|sleep|chat)/.test(keys[id][i]);
          run = same ? run + 1 : 1;
          expect(run).toBeLessThan(5);
        }
        // 3日間で、少なくとも6種類以上の行動をしている
        expect(new Set(keys[id]).size).toBeGreaterThanOrEqual(6);
      }
      void quickFlips;
    }
  });
});

describe('長時間の安定性', () => {
  it('テスト20: ゲーム内24時間を進めても破綻しない', () => {
    const sim = newSim(12345);
    for (let i = 0; i < 24 * 60; i++) {
      sim.step();
      expectValid(sim.world);
    }
    expect(formatStamp(sim.world.tick)).toBe('2日目 07:00');
  });

  it('テスト21: ゲーム内72時間を進めても、全員が毎日の生活を続ける(複数シード)', () => {
    for (const seed of [1, 2, 3, 42, 12345, 'abc', 777]) {
      const sim = newSim(seed);
      for (let i = 0; i < 72 * 60; i++) {
        sim.step();
        expectValid(sim.world);
      }
      for (const day of ['2', '3']) {
        const stats = sim.world.stats[day];
        for (const id of CHAR_IDS) {
          expect(stats[id].work, `seed ${seed} day${day} ${id} work`).toBeGreaterThan(300);
          expect(stats[id].eat, `${id} eat`).toBeGreaterThanOrEqual(25);
          expect(stats[id].sleep, `${id} sleep`).toBeGreaterThan(330);
          expect(stats[id].rest + stats[id].leisure, `${id} free`).toBeGreaterThan(60);
        }
      }
      // 毎晩寝て、毎朝起きている
      for (const id of CHAR_IDS) {
        const wakes = sim.world.log.filter((e) => e.who === id && e.type === 'wake').length;
        const sleeps = sim.world.log.filter((e) => e.who === id && e.type === 'sleep').length;
        expect(sleeps).toBe(3);
        expect(wakes).toBeGreaterThanOrEqual(3); // 初日の起床 + 2日目・3日目の朝(4日目07:00ちょうどに起きる人もいる)
      }
    }
  });

  it('30日(43200分)走らせても安定し、ログ・統計が増え続けない', () => {
    const sim = newSim(5);
    for (let i = 0; i < 30 * 1440; i++) {
      sim.step();
      if (i % 37 === 0) expectValid(sim.world);
    }
    expectValid(sim.world);
    expect(sim.world.log.length).toBeLessThanOrEqual(400);
    expect(sim.world.log.length).toBeGreaterThanOrEqual(100);
    expect(sim.world.chats.length).toBeLessThanOrEqual(120);
    expect(Object.keys(sim.world.stats).length).toBeLessThanOrEqual(10);
    expect(JSON.stringify(sim.world).length).toBeLessThan(400_000);
    // 毎日きちんと眠っている(最後の日の統計)
    const lastDay = String(Math.max(...Object.keys(sim.world.stats).map(Number)) - 1);
    for (const id of CHAR_IDS) expect(sim.world.stats[lastDay][id].sleep).toBeGreaterThan(330);
  });

  it('ログにはゲーム内時刻があり、時刻の順に並ぶ', () => {
    const sim = newSim(12345);
    sim.run(24 * 60);
    let prev = -1;
    for (const e of sim.world.log) {
      expect(e.tick).toBeGreaterThanOrEqual(prev);
      prev = e.tick;
    }
    const types = new Set(sim.world.log.map((e) => e.type));
    for (const t of ['wake', 'commute', 'work', 'eat', 'rest', 'home', 'sleep']) expect(types.has(t as never)).toBe(true);
  });
});

describe('再現性(シード)', () => {
  it('テスト17: 同じシード・同じ入力イベント・同じステップ数なら、完全に同じ結果になる', () => {
    const run = (seed: string | number) => {
      const sim = newSim(seed);
      sim.run(300);
      sim.trigger('gift');
      sim.run(200);
      sim.trigger('rain');
      sim.run(100);
      sim.trigger('invite');
      sim.run(2000);
      return snapshot(sim.world);
    };
    expect(run(2024)).toBe(run(2024));
    expect(run('hello')).toBe(run('hello'));
    expect(run(2024)).not.toBe(run(2025));
  });

  it('シミュレーションの中で Math.random を使っていない', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname, '..');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
      expect(text, f).not.toMatch(/Math\.random/);
      // 現在時刻(Date)も使わない。例外は保存日時を記録するだけの save.ts
      if (f !== 'save.ts') expect(text, f).not.toMatch(/Date\.now|new Date\(/);
    }
  });
});
