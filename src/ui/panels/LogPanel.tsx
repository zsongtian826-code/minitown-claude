import { useState } from 'react';
import { PROFILES } from '../../sim/profiles';
import { formatStamp } from '../../sim/clock';
import type { Game } from '../useGame';
import { LOG_FILTERS, LOG_ICON, LOG_TYPE_NAME, matchesFilter, type LogFilter } from '../format';

const SHOW = 100;

export function LogPanel({ game }: { game: Game }) {
  const [filter, setFilter] = useState<LogFilter>('all');
  const w = game.sim.world;
  const entries = [];
  for (let i = w.log.length - 1; i >= 0 && entries.length < SHOW; i--) {
    if (matchesFilter(w.log[i].type, filter)) entries.push(w.log[i]);
  }
  return (
    <div className="panel-body">
      <div className="chips" role="group" aria-label="ログの絞り込み">
        {LOG_FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'is-active' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <p className="small muted">新しい順に最大{SHOW}件を表示(全{w.log.length}件を保持。古いものから自動で消えます)</p>
      <ol className="log-list" aria-label="イベントログ">
        {entries.map((e) => (
          <li key={e.id} className={`log-item log-${e.type}`}>
            <time className="log-time">{formatStamp(e.tick)}</time>
            <span className="log-icon" aria-hidden="true">
              {LOG_ICON[e.type]}
            </span>
            <span className="log-body">
              <span className="log-type">{LOG_TYPE_NAME[e.type]}</span>
              {e.who && (
                <span className="who-dot" style={{ background: PROFILES[e.who].look.ui }} title={PROFILES[e.who].name} />
              )}
              {e.text}
            </span>
          </li>
        ))}
        {entries.length === 0 && <li className="empty">まだ記録はありません</li>}
      </ol>
    </div>
  );
}
