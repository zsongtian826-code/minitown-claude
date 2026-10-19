// 開発用: ヘッドレスでシミュレーションを走らせ、ログと状態を表示する。
//   npx vite-node scripts/simulate.ts [シード] [時間数]
import { Simulation } from '../src/sim/simulation';
import { formatStamp } from '../src/sim/clock';
import { CHAR_IDS } from '../src/sim/types';
import { PROFILES } from '../src/sim/profiles';
import { ACTIVITY_LABEL } from '../src/sim/activity';
import { placeAt } from '../src/sim/map';
import { checkInvariants } from '../src/sim/invariants';

const seed = process.argv[2] ?? '12345';
const hours = Number(process.argv[3] ?? 24);
const sim = Simulation.create(seed);
let shown = 0;
for (let i = 0; i < hours * 60; i++) {
  sim.step();
  const bad = checkInvariants(sim.world);
  if (bad.length) {
    console.log('INVARIANT', formatStamp(sim.world.tick), bad);
    break;
  }
  while (shown < sim.world.log.length) {
    const e = sim.world.log[shown++];
    console.log(`${formatStamp(e.tick)} [${e.type}] ${e.text}`);
  }
  if (sim.world.tick % 120 === 0) {
    const row = CHAR_IDS.map((id) => {
      const c = sim.world.chars[id];
      return `${PROFILES[id].name}:${ACTIVITY_LABEL[c.activity]}@${placeAt(c.pos)?.name ?? '通り'} 腹${c.hunger.toFixed(0)} 疲${c.fatigue.toFixed(0)} 気${c.mood.toFixed(0)}`;
    }).join(' | ');
    console.log(`   ---- ${formatStamp(sim.world.tick)} ${row}`);
  }
}
