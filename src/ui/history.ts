// 数値の変化を見せるための履歴。画面側だけで持つ(保存データには入れない)。

import type { CharId, World } from '../sim/types';
import { CHAR_IDS } from '../sim/types';

export interface Sample {
  tick: number;
  hunger: number;
  fatigue: number;
  mood: number;
}

const INTERVAL = 10; // ゲーム内10分ごと
const MAX = 144; // 24時間ぶん

export class History {
  private data: Record<CharId, Sample[]> = { aoi: [], mina: [], ren: [] };

  reset(): void {
    this.data = { aoi: [], mina: [], ren: [] };
  }

  /** tick が10の倍数のときに記録する */
  sample(world: World): void {
    if (world.tick % INTERVAL !== 0) return;
    for (const id of CHAR_IDS) {
      const c = world.chars[id];
      const arr = this.data[id];
      if (arr.length > 0 && arr[arr.length - 1].tick === world.tick) continue;
      arr.push({ tick: world.tick, hunger: c.hunger, fatigue: c.fatigue, mood: c.mood });
      if (arr.length > MAX) arr.shift();
    }
  }

  get(id: CharId): readonly Sample[] {
    return this.data[id];
  }

  /** 約 minutes 分前との差(なければ 0) */
  delta(id: CharId, key: 'hunger' | 'fatigue' | 'mood', current: number, minutes = 60): number {
    const arr = this.data[id];
    if (arr.length === 0) return 0;
    const idx = Math.max(0, arr.length - 1 - Math.round(minutes / INTERVAL));
    return current - arr[idx][key];
  }
}
