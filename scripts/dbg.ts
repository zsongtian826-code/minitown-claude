import { Simulation } from '../src/sim/simulation';
import { checkInvariants } from '../src/sim/invariants';
for (const seed of [1, 2, 3, 42, 12345, 'abc', 777]) {
  const sim = Simulation.create(seed);
  for (let i = 0; i < 72 * 60; i++) {
    const before = JSON.stringify(sim.world.chars.mina);
    sim.step();
    const e = checkInvariants(sim.world);
    if (e.length) {
      console.log('seed', seed, 'tick', sim.world.tick, e);
      console.log('before', before);
      console.log('after', JSON.stringify(sim.world.chars.mina));
      process.exit(0);
    }
  }
}
