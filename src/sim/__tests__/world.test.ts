import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W, PLACES, SPOTS, findPath, isWalkable, placeAt, terrainAt, travelSteps } from '../map';
import { dayOf, formatStamp, formatTime, minuteOfDay, SPEEDS } from '../clock';
import { FixedStepRunner } from '../runner';
import { SeededRng, parseSeed } from '../rng';
import { newSim, IDS } from './helpers';

describe('マップ', () => {
  it('最低15×10マスで、5種類の場所がある', () => {
    expect(MAP_W).toBeGreaterThanOrEqual(15);
    expect(MAP_H).toBeGreaterThanOrEqual(10);
    const kinds = new Set(PLACES.map((p) => p.kind));
    for (const k of ['home', 'office', 'cafe', 'park', 'plaza']) expect(kinds.has(k as never)).toBe(true);
  });

  it('全スポットと全施設の入口が、互いに到達できる(全施設間の移動可能性)', () => {
    const points = [...SPOTS.map((s) => s.pos), ...PLACES.map((p) => p.anchor)];
    for (const p of points) expect(isWalkable(p)).toBe(true);
    const base = PLACES[0].anchor;
    for (const p of points) {
      expect(findPath(base, p), `${base.x},${base.y} → ${p.x},${p.y}`).not.toBeNull();
      expect(findPath(p, base)).not.toBeNull();
    }
    for (const place of PLACES) for (const q of PLACES) expect(Number.isFinite(travelSteps(place.anchor, q.id))).toBe(true);
  });

  it('A*の経路は、隣り合う歩ける道だけでつながり、壁・木・家具・水を通らない', () => {
    const points = [...SPOTS.map((s) => s.pos)];
    for (const a of points) {
      for (const b of points) {
        const path = findPath(a, b)!;
        let cur = a;
        for (const step of path) {
          expect(Math.abs(step.x - cur.x) + Math.abs(step.y - cur.y)).toBe(1);
          expect(isWalkable(step)).toBe(true);
          expect(['wall', 'tree', 'water', 'furniture']).not.toContain(terrainAt(step));
          cur = step;
        }
        expect(cur).toEqual(b);
      }
    }
  });

  it('壁の中・建物の外壁には歩いて入れない。建物には入口(ドア)からだけ入れる', () => {
    for (const p of PLACES.filter((x) => x.indoor)) {
      const outside = [
        { x: p.anchor.x, y: p.anchor.y - 1 },
        { x: p.anchor.x, y: p.anchor.y + 1 },
      ].find((q) => isWalkable(q) && placeAt(q)?.id !== p.id)!;
      const inside = SPOTS.find((sp) => sp.placeId === p.id)!.pos;
      expect(placeAt(inside)?.id).toBe(p.id);
      const path = findPath(outside, inside)!;
      expect(path).not.toBeNull();
      // 経路は必ず入口のドアを通る
      expect(path.some((s) => s.x === p.anchor.x && s.y === p.anchor.y)).toBe(true);
    }
  });

  it('経路探索は同じ入力に同じ結果を返す', () => {
    const a = SPOTS[0].pos;
    const b = SPOTS[SPOTS.length - 1].pos;
    expect(findPath(a, b)).toEqual(findPath(a, b));
  });
});

describe('ワールドクロック', () => {
  it('開始は1日目07:00で、1tick=1分進む', () => {
    expect(formatStamp(0)).toBe('1日目 07:00');
    expect(formatStamp(60)).toBe('1日目 08:00');
    expect(minuteOfDay(0)).toBe(420);
  });

  it('24時間たつと翌日になり、0時をまたいでも時刻が正しい', () => {
    expect(formatStamp(17 * 60 - 1)).toBe('1日目 23:59');
    expect(formatStamp(17 * 60)).toBe('2日目 00:00');
    expect(dayOf(24 * 60)).toBe(2);
    expect(formatTime(24 * 60)).toBe('07:00');
    expect(formatStamp(72 * 60)).toBe('4日目 07:00');
  });

  it('シミュレーションを進めると world.tick と時刻が一致して進む', () => {
    const sim = newSim();
    sim.run(90);
    expect(sim.world.tick).toBe(90);
    expect(formatStamp(sim.world.tick)).toBe('1日目 08:30');
  });
});

describe('固定ステップ実行(一時停止・速度)', () => {
  const frames = (runner: FixedStepRunner, totalMs: number, frameMs: number) => {
    let n = 0;
    for (let t = 0; t < totalMs; t += frameMs) n += runner.advance(frameMs);
    return n;
  };

  it('一時停止中は世界が進まない', () => {
    const sim = newSim();
    const runner = new FixedStepRunner(() => sim.step());
    runner.speed = 0;
    expect(frames(runner, 10000, 16)).toBe(0);
    expect(sim.world.tick).toBe(0);
    runner.speed = 1;
    frames(runner, 3000, 100);
    expect(sim.world.tick).toBe(3);
  });

  it('1倍速=1秒で1分、10倍速=10分、60倍速=60分進む', () => {
    expect(SPEEDS).toEqual([0, 1, 10, 60]);
    const results: number[] = [];
    for (const speed of [1, 10, 60] as const) {
      const sim = newSim();
      const runner = new FixedStepRunner(() => sim.step());
      runner.speed = speed;
      frames(runner, 1000, 100); // 現実の1秒
      results.push(sim.world.tick);
    }
    expect(results).toEqual([1, 10, 60]);
  });

  it('速度を上げると、表示だけでなく内部の状態(空腹・疲労)も同じだけ進む', () => {
    const slow = newSim();
    const fast = newSim();
    const r1 = new FixedStepRunner(() => slow.step());
    const r2 = new FixedStepRunner(() => fast.step());
    r1.speed = 1;
    r2.speed = 60;
    for (let i = 0; i < 200; i++) {
      r1.advance(100);
      r2.advance(100);
    }
    expect(fast.world.tick).toBe(20 * 60);
    expect(slow.world.tick).toBe(20);
    expect(fast.world.chars.aoi.hunger).not.toBe(slow.world.chars.aoi.hunger);
  });

  it('描画フレームレートが違っても、同じtick数なら結果が同じ', () => {
    const a = newSim();
    const b = newSim();
    const ra = new FixedStepRunner(() => a.step());
    const rb = new FixedStepRunner(() => b.step());
    ra.speed = 10;
    rb.speed = 10;
    for (let i = 0; i < 600; i++) ra.advance(16.7); // 約60fps
    for (let i = 0; i < 100; i++) rb.advance(100); // 10fps
    const n = Math.min(a.world.tick, b.world.tick);
    expect(n).toBeGreaterThan(50);
    const c = newSim();
    const d = newSim();
    c.run(n);
    d.run(n);
    expect(JSON.stringify(c.world)).toBe(JSON.stringify(d.world));
    expect(a.world.tick).toBe(Math.round(600 * 16.7 * 0.01));
  });

  it('遅い端末で大量の経過時間が来ても、1回で進める量には上限がある', () => {
    const sim = newSim();
    const runner = new FixedStepRunner(() => sim.step(), 240, 500);
    runner.speed = 60;
    expect(runner.advance(60000)).toBeLessThanOrEqual(30);
  });
});

describe('乱数', () => {
  it('同じシードなら同じ数列、状態を戻せば続きが再現される', () => {
    const a = new SeededRng(123);
    const b = new SeededRng(123);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs);
    const state = a.getState();
    const c = a.next();
    a.setState(state);
    expect(a.next()).toBe(c);
  });

  it('シード文字列は数字ならそのまま、文字ならハッシュになる', () => {
    expect(parseSeed('12345')).toBe(12345);
    expect(parseSeed('')).toBe(12345);
    expect(parseSeed('hello')).toBe(parseSeed('hello'));
    expect(parseSeed('hello')).not.toBe(parseSeed('world'));
  });

  it('3人が最初から独立した状態を持つ', () => {
    const sim = newSim();
    const w = sim.world;
    expect(IDS.length).toBe(3);
    expect(w.chars.aoi).not.toBe(w.chars.mina);
    expect(w.chars.aoi.pos).not.toBe(w.chars.mina.pos);
    expect(w.chars.aoi.relations).not.toBe(w.chars.mina.relations);
  });
});
