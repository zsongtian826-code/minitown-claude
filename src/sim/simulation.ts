// UI から使う入口。世界(World)と、注入された乱数(Rng)をまとめて持つ。

import { SeededRng, parseSeed, type Rng } from './rng';
import { createWorld } from './world';
import { stepWorld } from './engine';
import { triggerEvent } from './events';
import type { EventResult, UserEventType, World } from './types';

export class Simulation {
  world: World;
  readonly rng: Rng;

  constructor(world: World, rng: Rng) {
    this.world = world;
    this.rng = rng;
  }

  /** 新しい世界を作る。同じシードなら同じ初期状態になる */
  static create(seed: string | number, rng: Rng = new SeededRng(parseSeed(seed))): Simulation {
    const world = createWorld(seed, rng);
    return new Simulation(world, rng);
  }

  /** 保存された世界から再開する */
  static restore(world: World, rng: Rng = new SeededRng(0)): Simulation {
    rng.setState(world.rngState);
    return new Simulation(world, rng);
  }

  /** ゲーム内1分進める(固定ステップ) */
  step(): void {
    stepWorld(this.world, this.rng);
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step();
  }

  trigger(type: UserEventType): EventResult {
    return triggerEvent(this.world, this.rng, type);
  }
}
