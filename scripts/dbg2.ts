import { Simulation } from '../src/sim/simulation';
import { buildOptions } from '../src/sim/behavior';
import { findPath, placeAt } from '../src/sim/map';
const sim = Simulation.create(1);
sim.run(3605);
const w = sim.world;
for (const id of ['aoi','mina','ren'] as const) { const c = w.chars[id]; console.log(id, c.pos, c.activity, c.plan?.kind, c.plan?.stage, placeAt(c.pos)?.id, c.mem.lastChatWith); }
const m = w.chars.mina;
sim.step();
console.log('after', m.plan, m.activity);
const aoi = w.chars.aoi;
console.log(findPath(m.pos, aoi.pos));
