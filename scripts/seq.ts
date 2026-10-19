import { Simulation } from '../src/sim/simulation';
import { CHAR_IDS } from '../src/sim/types';
import { formatStamp } from '../src/sim/clock';
const sim = Simulation.create(process.argv[2] ?? '1');
const last: Record<string, string> = {};
const keys: Record<string, string[]> = { aoi: [], mina: [], ren: [] };
for (let i = 0; i < 72 * 60; i++) {
  sim.step();
  for (const id of CHAR_IDS) {
    const p = sim.world.chars[id].plan;
    const sig = p ? `${p.kind}@${p.placeId}#${p.startedAt}` : '';
    if (sig && last[id] !== sig) {
      last[id] = sig;
      keys[id].push(`${formatStamp(p!.startedAt).slice(-5)} ${p!.kind}@${p!.placeId}`);
    }
  }
}
for (const id of CHAR_IDS) { console.log(id); console.log(keys[id].join('\n')); }
