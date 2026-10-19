// ゲーム全体の状態: シミュレーション本体、固定ステップ実行、オートセーブ、イベント操作。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Simulation } from '../sim/simulation';
import { FixedStepRunner } from '../sim/runner';
import { formatStamp, type Speed } from '../sim/clock';
import { loadFromStorage, saveToStorage, type StorageLike } from '../sim/save';
import type { CharId, UserEventType } from '../sim/types';
import { EVENT_LABEL } from '../sim/events';
import { History } from './history';

function getStorage(): StorageLike {
  try {
    const s = window.localStorage;
    const probe = '__minitown_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    // localStorage が使えない環境(プライベートモードなど): メモリ上だけで動かす
    const mem = new Map<string, string>();
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    };
  }
}

/** 初回のシード(画面側の選択なので乱数でよい。シミュレーション内部ではない) */
export function randomSeed(): string {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warn';
}

export interface Game {
  sim: Simulation;
  runner: FixedStepRunner;
  history: History;
  version: number;
  speed: Speed;
  selected: CharId | null;
  toast: Toast | null;
  storageAvailable: boolean;
  setSpeed(s: Speed): void;
  togglePause(): void;
  select(id: CharId | null): void;
  trigger(type: UserEventType): void;
  newWorld(seed: string): void;
  saveNow(): void;
  loadNow(): void;
  hasSave(): boolean;
}

export function useGame(): Game {
  const storage = useMemo(getStorage, []);
  const initial = useMemo(() => {
    const loaded = loadFromStorage(storage);
    if (loaded.ok) {
      return {
        sim: Simulation.restore(loaded.world),
        notice: `前回の続きから再開しました(${formatStamp(loaded.world.tick)})`,
        tone: 'info' as const,
      };
    }
    if (!loaded.empty) {
      return {
        sim: Simulation.create(randomSeed()),
        notice: `${loaded.reason}。新しい世界を始めました`,
        tone: 'warn' as const,
      };
    }
    return { sim: Simulation.create(randomSeed()), notice: '', tone: 'info' as const };
  }, [storage]);

  const simRef = useRef<Simulation>(initial.sim);
  const historyRef = useRef(new History());
  const runner = useMemo(
    () =>
      new FixedStepRunner(
        () => {
          simRef.current.step();
          historyRef.current.sample(simRef.current.world);
        },
        240,
        2000,
      ),
    [],
  );
  const [version, setVersion] = useState(0);
  const [speed, setSpeedState] = useState<Speed>(1);
  const lastSpeedRef = useRef<Speed>(1);
  const [selected, setSelected] = useState<CharId | null>('aoi');
  const [toast, setToast] = useState<Toast | null>(
    initial.notice ? { id: 1, text: initial.notice, tone: initial.tone } : null,
  );
  const toastId = useRef(2);
  const lastSavedTick = useRef(-1);
  const storageOk = useRef(true);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const say = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    setToast({ id: toastId.current++, text, tone });
  }, []);

  const save = useCallback(
    (quiet: boolean) => {
      const ok = saveToStorage(storage, simRef.current.world);
      storageOk.current = ok;
      if (ok) lastSavedTick.current = simRef.current.world.tick;
      if (!quiet) say(ok ? `保存しました(${formatStamp(simRef.current.world.tick)})` : '保存できませんでした(ブラウザの保存領域が使えません)', ok ? 'info' : 'warn');
    },
    [storage, say],
  );

  // 固定ステップの実行(setInterval: 裏のタブでも止まらない)
  useEffect(() => {
    let last = performance.now();
    let lastUi = 0;
    const id = window.setInterval(() => {
      const now = performance.now();
      const steps = runner.advance(now - last);
      last = now;
      if (steps > 0 && now - lastUi > 140) {
        lastUi = now;
        bump();
      }
    }, 40);
    return () => window.clearInterval(id);
  }, [runner, bump]);

  // オートセーブ
  useEffect(() => {
    const id = window.setInterval(() => {
      if (simRef.current.world.tick !== lastSavedTick.current) save(true);
    }, 4000);
    const onHide = () => {
      if (document.visibilityState === 'hidden') save(true);
    };
    const onPageHide = () => save(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [save]);

  // 最初の保存
  useEffect(() => {
    save(true);
  }, [save]);

  const setSpeed = useCallback(
    (s: Speed) => {
      runner.speed = s;
      if (s !== 0) lastSpeedRef.current = s;
      setSpeedState(s);
    },
    [runner],
  );

  const togglePause = useCallback(() => {
    setSpeed(runner.speed === 0 ? lastSpeedRef.current : 0);
  }, [runner, setSpeed]);

  const trigger = useCallback(
    (type: UserEventType) => {
      const r = simRef.current.trigger(type);
      say(`${EVENT_LABEL[type]}: ${r.message}`, r.ok ? 'info' : 'warn');
      save(true);
      bump();
    },
    [say, save, bump],
  );

  const newWorld = useCallback(
    (seed: string) => {
      simRef.current = Simulation.create(seed.trim() === '' ? randomSeed() : seed);
      historyRef.current.reset();
      runner.resetAccumulator();
      setSelected('aoi');
      save(true);
      say(`新しい世界を始めました(シード: ${simRef.current.world.seedText})`);
      bump();
    },
    [runner, save, say, bump],
  );

  const loadNow = useCallback(() => {
    const r = loadFromStorage(storage);
    if (r.ok) {
      simRef.current = Simulation.restore(r.world);
      historyRef.current.reset();
      runner.resetAccumulator();
      say(`保存した世界を読み込みました(${formatStamp(r.world.tick)})`);
      bump();
    } else {
      say(r.reason, 'warn');
    }
  }, [storage, runner, say, bump]);

  const hasSave = useCallback(() => loadFromStorage(storage).ok, [storage]);

  return {
    sim: simRef.current,
    runner,
    history: historyRef.current,
    version,
    speed,
    selected,
    toast,
    storageAvailable: storageOk.current,
    setSpeed,
    togglePause,
    select: setSelected,
    trigger,
    newWorld,
    saveNow: () => save(false),
    loadNow,
    hasSave,
  };
}

