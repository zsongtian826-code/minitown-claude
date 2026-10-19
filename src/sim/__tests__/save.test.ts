import { describe, expect, it } from 'vitest';
import { Simulation } from '../simulation';
import { SAVE_KEY, clearSave, loadFromStorage, parseSave, saveToStorage, serializeWorld, type StorageLike } from '../save';
import { SeededRng, randInt } from '../rng';
import { checkInvariants } from '../invariants';
import { clone, newSim, runTo, snapshot } from './helpers';

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe('セーブ・ロード', () => {
  it('テスト18: 保存して再読み込みすると、同じ世界を続きから進められる(結果が完全に一致する)', () => {
    const sim = newSim(2024);
    runTo(sim, 1, 12, 30);
    sim.trigger('gift');
    runTo(sim, 1, 15, 5);
    const storage = fakeStorage();
    expect(saveToStorage(storage, sim.world)).toBe(true);

    // ページを再読み込みした想定: ストレージから読み直して新しい Simulation を作る
    const loaded = loadFromStorage(storage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const resumed = Simulation.restore(loaded.world);
    expect(resumed.world).toEqual(sim.world);

    // どちらもさらに2日進める → 同じ結果(乱数の状態も保存されている)
    sim.trigger('rain');
    resumed.trigger('rain');
    sim.run(48 * 60);
    resumed.run(48 * 60);
    expect(resumed.world).toEqual(sim.world);
    expect(checkInvariants(resumed.world)).toEqual([]);
  });

  it('保存データには、時刻・日数・天候・状態・関係値・行動・目的地・ログ・シード・乱数状態が入っていて、バージョンがある', () => {
    const sim = newSim('my-seed');
    runTo(sim, 1, 9, 30);
    const saved = JSON.parse(serializeWorld(sim.world)) as { version: number; world: Record<string, any> };
    expect(saved.version).toBe(1);
    const w = saved.world;
    expect(w.tick).toBe(sim.world.tick);
    expect(w.weather.current).toBeDefined();
    expect(w.seed).toBe(sim.world.seed);
    expect(w.seedText).toBe('my-seed');
    expect(typeof w.rngState).toBe('number');
    expect(w.log.length).toBeGreaterThan(5);
    expect(w.chars.aoi.relations.mina).toBeDefined();
    expect(w.chars.aoi.activity).toBeDefined();
    expect(w.chars.aoi.plan).not.toBeUndefined();
  });

  it('セーブがない・壊れている・バージョン違いでもクラッシュせず、理由を返す', () => {
    const empty = fakeStorage();
    const r0 = loadFromStorage(empty);
    expect(r0.ok).toBe(false);
    if (!r0.ok) expect(r0.empty).toBe(true);

    const bads = ['', '{', 'null', '[]', '123', '"abc"', '{"version":1}', '{"version":99,"world":{}}', '{"version":1,"world":null}'];
    for (const text of bads) {
      const r = parseSave(text);
      expect(r.ok, text).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
    }
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadFromStorage(throwing).ok).toBe(false);
    expect(saveToStorage(throwing, newSim().world)).toBe(false);
    expect(() => clearSave(throwing)).not.toThrow();
  });

  it('内容を壊したセーブ(範囲外の数値・壁の中の位置・存在しない場所・型違い)は拒否される', () => {
    const sim = newSim(1);
    runTo(sim, 1, 11, 0);
    const good = JSON.parse(serializeWorld(sim.world)) as any;
    expect(parseSave(JSON.stringify(good)).ok).toBe(true);
    const mutate = (f: (w: any) => void) => {
      const g = clone(good);
      f(g.world);
      return parseSave(JSON.stringify(g));
    };
    expect(mutate((w) => (w.chars.aoi.hunger = 500)).ok).toBe(false);
    expect(mutate((w) => (w.chars.aoi.hunger = 'たくさん')).ok).toBe(false);
    expect(mutate((w) => (w.chars.aoi.mood = null)).ok).toBe(false);
    expect(mutate((w) => (w.chars.mina.pos = { x: 0, y: 0 })).ok).toBe(false); // 木の中
    expect(mutate((w) => (w.chars.mina.pos = { x: 1000, y: 3 })).ok).toBe(false);
    expect(mutate((w) => (w.chars.ren.plan.placeId = 'moon')).ok).toBe(false);
    expect(mutate((w) => (w.chars.ren.activity = 'flying')).ok).toBe(false);
    expect(mutate((w) => (w.weather.current = 'snow')).ok).toBe(false);
    expect(mutate((w) => (w.tick = -5)).ok).toBe(false);
    expect(mutate((w) => (w.chars.aoi.activity = 'sleeping')).ok).toBe(false); // 勤務中なのに睡眠(矛盾)
    expect(mutate((w) => delete w.chars.aoi).ok).toBe(false);
    expect(mutate((w) => (w.log = 'x')).ok).toBe(false);
  });

  it('ランダムに壊した保存データを大量に読み込ませても、例外を出さず、通った場合は整合性が保たれる', () => {
    const sim = newSim(3);
    runTo(sim, 1, 18, 0);
    const text = serializeWorld(sim.world);
    const rng = new SeededRng(7);
    let accepted = 0;
    for (let i = 0; i < 400; i++) {
      const g = JSON.parse(text) as any;
      // ランダムな葉の値を、ランダムな値に置き換える
      const paths: (string | number)[][] = [];
      const walk = (v: unknown, path: (string | number)[]) => {
        if (v && typeof v === 'object') {
          for (const k of Object.keys(v as object)) walk((v as any)[k], [...path, Array.isArray(v) ? Number(k) : k]);
        } else paths.push(path);
      };
      walk(g, []);
      const garbage: unknown[] = [null, -1, 1e9, 'x', true, [], {}, NaN, 0.5];
      for (let n = 0; n < randInt(rng, 1, 3); n++) {
        const p = paths[randInt(rng, 0, paths.length - 1)];
        let obj = g;
        for (let j = 0; j < p.length - 1; j++) obj = obj[p[j]];
        obj[p[p.length - 1]] = garbage[randInt(rng, 0, garbage.length - 1)];
      }
      const r = parseSave(JSON.stringify(g));
      if (r.ok) {
        accepted++;
        expect(checkInvariants(r.world)).toEqual([]);
        // 通ったものは、そのまま少し進めても壊れない
        const s = Simulation.restore(r.world);
        s.run(30);
      }
    }
    expect(accepted).toBeLessThan(400);
  });

  it('テスト19: 新しい世界を始めると状態が初期化され、保存も上書きできる', () => {
    const sim = newSim(1);
    sim.trigger('rain');
    sim.run(5 * 60);
    const storage = fakeStorage();
    saveToStorage(storage, sim.world);
    const old = storage.data[SAVE_KEY];

    const fresh = Simulation.create(999);
    expect(fresh.world.tick).toBe(0);
    expect(fresh.world.seedText).toBe('999');
    expect(fresh.world.log.length).toBeLessThan(6);
    expect(fresh.world.chats).toEqual([]);
    expect(fresh.world.invite).toBeNull();
    expect(fresh.world.eventAt.rain).toBeLessThan(0);
    expect(Object.keys(fresh.world.stats)).toEqual([]);
    saveToStorage(storage, fresh.world);
    expect(storage.data[SAVE_KEY]).not.toBe(old);
    const loaded = loadFromStorage(storage);
    expect(loaded.ok && loaded.world.tick === 0 && loaded.world.seed === 999).toBe(true);
    clearSave(storage);
    expect(loadFromStorage(storage).ok).toBe(false);

    // 同じシードで作り直せば、同じ初期状態に戻る
    expect(snapshot(Simulation.create(999).world)).toBe(snapshot(fresh.world));
  });
});
