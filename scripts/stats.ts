// 開発用: 複数シードで72時間走らせ、1日あたりの行動時間・会話数・計画の切り替え回数などを集計する。
import { Simulation } from '../src/sim/simulation';
import { CHAR_IDS } from '../src/sim/types';
import { checkInvariants } from '../src/sim/invariants';

const seeds = process.argv.slice(2).length ? process.argv.slice(2) : ['1', '2', '3', '42', '12345'];
for (const seed of seeds) {
  const sim = Simulation.create(seed);
  const starts: Record<string, number> = { aoi: 0, mina: 0, ren: 0 };
  const flips: Record<string, number> = { aoi: 0, mina: 0, ren: 0 };
  const lastPlan: Record<string, { startedAt: number; stage: string; kind: string } | null> = { aoi: null, mina: null, ren: null };
  let bad = '';
  for (let i = 0; i < 72 * 60; i++) {
    sim.step();
    const errs = checkInvariants(sim.world);
    if (errs.length && !bad) bad = `${sim.world.tick}: ${errs[0]}`;
    for (const id of CHAR_IDS) {
      const p = sim.world.chars[id].plan;
      const prev = lastPlan[id];
      if (p && (!prev || prev.startedAt !== p.startedAt || prev.kind !== p.kind)) {
        starts[id]++;
        if (prev && prev.stage === 'travel' && sim.world.tick - prev.startedAt < 6 && prev.kind !== 'chat') flips[id]++;
      }
      lastPlan[id] = p ? { startedAt: p.startedAt, stage: p.stage, kind: p.kind } : null;
    }
  }
  console.log(`== seed ${seed} invariants: ${bad || 'OK'}  chats=${sim.world.chats.length}`);
  for (const day of Object.keys(sim.world.stats)) {
    const s = sim.world.stats[day];
    console.log(
      ` day${day} ` +
        CHAR_IDS.map(
          (id) => `${id}[w${s[id].work} e${s[id].eat} r${s[id].rest} l${s[id].leisure} c${s[id].chat}(${s[id].chats}) k${s[id].walk} s${s[id].sleep}]`,
        ).join(' '),
    );
  }
  console.log(' plan starts/72h', JSON.stringify(starts), 'quick flips', JSON.stringify(flips));
  console.log(' relations', CHAR_IDS.map((id) => CHAR_IDS.filter((o) => o !== id).map((o) => `${id}>${o}:${sim.world.chars[id].relations[o].toFixed(0)}`).join(' ')).join(' | '));
}
