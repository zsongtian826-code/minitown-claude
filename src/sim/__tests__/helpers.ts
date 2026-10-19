import { Simulation } from '../simulation';
import { checkInvariants } from '../invariants';
import { absoluteMinute } from '../clock';
import type { CharId, World } from '../types';
import { CHAR_IDS } from '../types';

/** 「d日目 h:m」まで進める(すでに過ぎていたらエラー)。毎tick整合性もチェックする */
export function runTo(sim: Simulation, day: number, h: number, m = 0, check = true): void {
  const target = (day - 1) * 1440 + h * 60 + m - absoluteMinute(0);
  if (target < sim.world.tick) throw new Error(`already past: ${sim.world.tick} > ${target}`);
  while (sim.world.tick < target) {
    sim.step();
    if (check) expectValid(sim.world);
  }
}

export function expectValid(world: World): void {
  const errs = checkInvariants(world);
  if (errs.length > 0) throw new Error(`tick ${world.tick}: ${errs.join(' / ')}`);
}

export function snapshot(world: World): string {
  return JSON.stringify(world);
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export const IDS: readonly CharId[] = CHAR_IDS;

export function newSim(seed: string | number = 12345): Simulation {
  return Simulation.create(seed);
}
