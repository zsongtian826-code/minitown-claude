import { useState } from 'react';
import { CHAR_IDS, type CharId, type DayStat } from '../../sim/types';
import { PROFILES } from '../../sim/profiles';
import { dayOf } from '../../sim/clock';
import type { Game } from '../useGame';
import { minutesText } from '../format';

const PARTS: { key: keyof DayStat; label: string; color: string }[] = [
  { key: 'work', label: '仕事', color: '#6f8fd1' },
  { key: 'eat', label: '食事', color: '#f09a45' },
  { key: 'rest', label: '休憩', color: '#8ccf9b' },
  { key: 'leisure', label: '自由時間', color: '#e6c24f' },
  { key: 'chat', label: '会話', color: '#ec7fa0' },
  { key: 'walk', label: '移動', color: '#b6a89a' },
  { key: 'sleep', label: '睡眠', color: '#4f4a78' },
];

function oneLiner(id: CharId, s: DayStat): string {
  const name = PROFILES[id].name;
  const total = PARTS.reduce((n, p) => n + (s[p.key] as number), 0) || 1;
  if (total < 30) return `${name}の一日は、まだはじまったばかり。`;
  if (s.work / total > 0.38) return `${name}は仕事に打ち込んだ一日でした。`;
  if (s.sleep / total > 0.5) return `${name}はたっぷり眠った一日でした。`;
  if (s.chats >= 4) return `${name}はおしゃべりを楽しんだ一日でした。`;
  if ((s.leisure + s.rest) / total > 0.3) return `${name}はのんびり過ごした一日でした。`;
  if (s.walk / total > 0.14) return `${name}はよく歩き回った一日でした。`;
  return `${name}はマイペースな一日でした。`;
}

export function SummaryPanel({ game }: { game: Game }) {
  const w = game.sim.world;
  const today = dayOf(w.tick);
  const days = Object.keys(w.stats)
    .map(Number)
    .sort((a, b) => b - a);
  const [picked, setPicked] = useState<number | null>(null);
  const day = picked !== null && w.stats[String(picked)] ? picked : today;
  const stats = w.stats[String(day)];

  return (
    <div className="panel-body">
      <div className="chips" role="group" aria-label="日を選ぶ">
        {days.slice(0, 6).map((d) => (
          <button key={d} className={`chip ${d === day ? 'is-active' : ''}`} aria-pressed={d === day} onClick={() => setPicked(d)}>
            {d}日目{d === today ? '(今日)' : ''}
          </button>
        ))}
      </div>
      {!stats && <p className="empty">まだ記録がありません。</p>}
      {stats && (
        <>
          <ul className="legend" aria-label="色の凡例">
            {PARTS.map((p) => (
              <li key={p.key}>
                <i style={{ background: p.color }} />
                {p.label}
              </li>
            ))}
          </ul>
          {CHAR_IDS.map((id) => {
            const s = stats[id];
            const total = PARTS.reduce((n, p) => n + (s[p.key] as number), 0) || 1;
            return (
              <section className="card" key={id}>
                <h3 style={{ color: PROFILES[id].look.ui }}>{PROFILES[id].name}</h3>
                <p className="small">{oneLiner(id, s)}</p>
                <div className="stack" role="img" aria-label={PARTS.map((p) => `${p.label}${minutesText(s[p.key] as number)}`).join('、')}>
                  {PARTS.map((p) => (
                    <div key={p.key} style={{ width: `${((s[p.key] as number) / total) * 100}%`, background: p.color }} title={`${p.label} ${minutesText(s[p.key] as number)}`} />
                  ))}
                </div>
                <p className="small muted tally">
                  {PARTS.filter((p) => (s[p.key] as number) > 0).map((p) => (
                    <span key={p.key}>
                      {p.label} {minutesText(s[p.key] as number)}
                    </span>
                  ))}
                  <span>会話 {s.chats}回</span>
                </p>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
