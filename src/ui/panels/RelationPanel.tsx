import { CHAR_IDS, type CharId } from '../../sim/types';
import { PROFILES } from '../../sim/profiles';
import type { Game } from '../useGame';
import { relationLabel } from '../format';

const POS: Record<CharId, { x: number; y: number }> = {
  aoi: { x: 70, y: 62 },
  mina: { x: 290, y: 62 },
  ren: { x: 180, y: 200 },
};

export function RelationPanel({ game }: { game: Game }) {
  const w = game.sim.world;
  const pairs: [CharId, CharId][] = [
    ['aoi', 'mina'],
    ['aoi', 'ren'],
    ['mina', 'ren'],
  ];
  return (
    <div className="panel-body">
      <section className="card">
        <h3>人間関係マップ</h3>
        <svg viewBox="0 0 360 250" className="rel-svg" role="img" aria-label="3人の関係値のマップ">
          {pairs.map(([a, b]) => {
            const va = w.chars[a].relations[b];
            const vb = w.chars[b].relations[a];
            const avg = (va + vb) / 2;
            const pa = POS[a];
            const pb = POS[b];
            const mx = (pa.x + pb.x) / 2;
            const my = (pa.y + pb.y) / 2;
            return (
              <g key={`${a}-${b}`}>
                <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#ec7fa0" strokeOpacity={0.25 + avg / 160} strokeWidth={2 + avg / 9} strokeLinecap="round" />
                <rect x={mx - 36} y={my - 16} width={72} height={32} rx={10} fill="#fffdf8" stroke="#e8dcc6" />
                <text x={mx} y={my - 3} textAnchor="middle" fontSize="10.5" fill="#6b5d50">
                  {PROFILES[a].name}→{Math.round(va)}
                </text>
                <text x={mx} y={my + 10} textAnchor="middle" fontSize="10.5" fill="#6b5d50">
                  {PROFILES[b].name}→{Math.round(vb)}
                </text>
              </g>
            );
          })}
          {CHAR_IDS.map((id) => (
            <g key={id}>
              <circle cx={POS[id].x} cy={POS[id].y} r={30} fill="#fffdf8" stroke={PROFILES[id].look.ui} strokeWidth={3.5} />
              <text x={POS[id].x} y={POS[id].y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={PROFILES[id].look.ui}>
                {PROFILES[id].name}
              </text>
            </g>
          ))}
        </svg>
        <p className="small muted">線が太いほど親しい関係です。数字は「左の人から見た右の人」の関係値(0〜100)。</p>
      </section>
      <section className="card">
        <h3>一覧</h3>
        <table className="rel-table">
          <thead>
            <tr>
              <th scope="col">誰から</th>
              {CHAR_IDS.map((id) => (
                <th scope="col" key={id}>
                  {PROFILES[id].name}へ
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHAR_IDS.map((from) => (
              <tr key={from}>
                <th scope="row" style={{ color: PROFILES[from].look.ui }}>
                  {PROFILES[from].name}
                </th>
                {CHAR_IDS.map((to) => (
                  <td key={to}>
                    {from === to ? (
                      '—'
                    ) : (
                      <>
                        <b>{Math.round(w.chars[from].relations[to])}</b>
                        <small>{relationLabel(w.chars[from].relations[to])}</small>
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
