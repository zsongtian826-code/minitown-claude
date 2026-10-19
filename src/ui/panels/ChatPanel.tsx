import { PROFILES } from '../../sim/profiles';
import { formatStamp } from '../../sim/clock';
import { chatPlaceName } from '../../sim/chat';
import type { Game } from '../useGame';
import { Avatar } from '../Avatar';

export function ChatPanel({ game }: { game: Game }) {
  const w = game.sim.world;
  const sessions = w.chats.filter((s) => s.lines.length > 0).slice(-40).reverse();
  return (
    <div className="panel-body">
      <p className="small muted">会話の内容は、性格・時間・場所・天気・気分・関係値・最近の出来事から、ルールで作られます(外部のAIは使っていません)。</p>
      {sessions.length === 0 && <p className="empty">まだ会話はありません。しばらく眺めてみましょう。</p>}
      {sessions.map((s) => (
        <article className="card chat-card" key={s.id}>
          <header className="chat-head">
            <time>{formatStamp(s.startTick)}</time>
            <span>
              {chatPlaceName(s.placeId)} ・ {PROFILES[s.a].name} × {PROFILES[s.b].name}
            </span>
            {!s.done ? (
              <span className="badge live">会話中</span>
            ) : (
              s.relDelta && (
                <span className="badge" title="この会話での関係値の変化(左: 先に話した人から見た相手、右: 相手から見た関係値)">
                  関係値 {s.relDelta[0] >= 0 ? '+' : ''}
                  {s.relDelta[0].toFixed(1)} / {s.relDelta[1] >= 0 ? '+' : ''}
                  {s.relDelta[1].toFixed(1)}
                </span>
              )
            )}
          </header>
          <ul className="chat-lines">
            {s.lines.map((l, i) => (
              <li key={i} className={`chat-line ${l.speaker === s.a ? 'left' : 'right'}`} style={{ ['--c' as string]: PROFILES[l.speaker].look.ui }}>
                <Avatar id={l.speaker} mood={w.chars[l.speaker].mood} size={30} />
                <div className="chat-bubble">
                  <b>{PROFILES[l.speaker].name}</b>
                  <span>{l.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
