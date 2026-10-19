import { CHAR_IDS, type CharId, type CharState } from '../../sim/types';
import { PROFILES } from '../../sim/profiles';
import { ACTIVITY_ICON, ACTIVITY_LABEL } from '../../sim/activity';
import { predictNext } from '../../sim/behavior';
import { dayStats } from '../../sim/world';
import { chatPlaceName } from '../../sim/chat';
import type { Game } from '../useGame';
import { Avatar } from '../Avatar';
import { KIND_LABEL, locationName, optionText, planText } from '../describe';
import { fatigueText, hungerText, minutesText, moodText, relationLabel } from '../format';
import type { Sample } from '../history';

function Sparkline({ data, pick, color }: { data: readonly Sample[]; pick: (s: Sample) => number; color: string }) {
  const pts = data.slice(-48);
  if (pts.length < 2) return <svg className="spark" viewBox="0 0 100 24" aria-hidden="true" />;
  const path = pts.map((s, i) => `${(i / (pts.length - 1)) * 100},${24 - (pick(s) / 100) * 22 - 1}`).join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="12" x2="100" y2="12" className="spark-mid" />
      <polyline points={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Meter(props: {
  label: string;
  icon: string;
  value: number;
  text: string;
  delta: number;
  color: string;
  /** 高いほど良くない(空腹・疲労) */
  badWhenHigh: boolean;
  data: readonly Sample[];
  pick: (s: Sample) => number;
}) {
  const { value, delta } = props;
  const warn = props.badWhenHigh ? value >= 80 : value <= 25;
  const arrow = Math.abs(delta) < 1 ? '→' : delta > 0 ? '▲' : '▼';
  return (
    <div className={`meter ${warn ? 'meter-warn' : ''}`}>
      <div className="meter-head">
        <span className="meter-label">
          <span aria-hidden="true">{props.icon}</span> {props.label}
        </span>
        <span className="meter-num">
          {Math.round(value)}
          <small>/100</small>
        </span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label={props.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-valuetext={`${Math.round(value)}(${props.text})`}
      >
        <div className="meter-fill" style={{ width: `${value}%`, background: props.color }} />
      </div>
      <div className="meter-foot">
        <span className="meter-text">{props.text}</span>
        <span className="meter-delta" title="約1時間前との差">
          {arrow} {Math.abs(delta) < 1 ? '変化なし' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}/時間`}
        </span>
        <Sparkline data={props.data} pick={props.pick} color={props.color} />
      </div>
    </div>
  );
}

function TraitBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="trait">
      <span>{label}</span>
      <div className="trait-track">
        <div className="trait-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function CharPanel({ game }: { game: Game }) {
  const w = game.sim.world;
  const id: CharId = game.selected ?? 'aoi';
  const c: CharState = w.chars[id];
  const prof = PROFILES[id];
  const plan = c.plan;
  const next = predictNext(w, c);
  const hist = game.history.get(id);
  const today = dayStats(w)[id];
  const others = CHAR_IDS.filter((o) => o !== id);

  let destination = 'なし';
  if (plan?.stage === 'travel') destination = `${chatPlaceName(plan.placeId)}へ移動中`;
  else if (c.chat) destination = 'なし(会話中)';
  else if (plan) destination = `なし(${locationName(c)}で${KIND_LABEL[plan.kind]})`;

  return (
    <div className="panel-body">
      <div className="char-tabs" role="tablist" aria-label="住人を選ぶ">
        {CHAR_IDS.map((cid) => (
          <button
            key={cid}
            role="tab"
            aria-selected={cid === id}
            className={`char-tab ${cid === id ? 'is-active' : ''}`}
            style={{ ['--c' as string]: PROFILES[cid].look.ui }}
            onClick={() => game.select(cid)}
          >
            <Avatar id={cid} mood={w.chars[cid].mood} size={34} />
            <span>{PROFILES[cid].name}</span>
          </button>
        ))}
      </div>

      <section className="card char-head" style={{ ['--c' as string]: prof.look.ui }}>
        <Avatar id={id} mood={c.mood} activity={c.activity} size={72} />
        <div>
          <h2>{prof.name}</h2>
          <p className="muted">{prof.personality}</p>
          <p className="small">{prof.trait}</p>
        </div>
      </section>

      <section className="card">
        <h3>いまの様子</h3>
        <dl className="kv">
          <dt>現在の行動</dt>
          <dd>
            <span className="pill" style={{ ['--c' as string]: prof.look.ui }}>
              <span aria-hidden="true">{ACTIVITY_ICON[c.activity]}</span> {ACTIVITY_LABEL[c.activity]}
            </span>
          </dd>
          <dt>現在位置</dt>
          <dd>
            {locationName(c)}
            <span className="muted small"> ({c.pos.x},{c.pos.y})</span>
          </dd>
          <dt>次の目的地</dt>
          <dd>{destination}</dd>
          <dt>行動の理由</dt>
          <dd>{c.chat ? `${PROFILES[c.chat.partner].name}と会話している` : (plan?.reason ?? '—')}</dd>
          <dt>このあと(予測)</dt>
          <dd>{next ? optionText(next) : '—'}</dd>
        </dl>
        {plan && <p className="small muted">計画: {planText(plan)}</p>}
      </section>

      <section className="card">
        <h3>からだと気分</h3>
        <Meter
          label="空腹度"
          icon="🍙"
          value={c.hunger}
          text={hungerText(c.hunger)}
          delta={game.history.delta(id, 'hunger', c.hunger)}
          color="#f09a45"
          badWhenHigh
          data={hist}
          pick={(s) => s.hunger}
        />
        <Meter
          label="疲労度"
          icon="😮‍💨"
          value={c.fatigue}
          text={fatigueText(c.fatigue)}
          delta={game.history.delta(id, 'fatigue', c.fatigue)}
          color="#8e7cc3"
          badWhenHigh
          data={hist}
          pick={(s) => s.fatigue}
        />
        <Meter
          label="気分"
          icon="😊"
          value={c.mood}
          text={moodText(c.mood)}
          delta={game.history.delta(id, 'mood', c.mood)}
          color="#ec7fa0"
          badWhenHigh={false}
          data={hist}
          pick={(s) => s.mood}
        />
        <p className="small muted">折れ線は直近8時間(ゲーム内)の推移です。</p>
      </section>

      <section className="card">
        <h3>関係値</h3>
        {others.map((o) => {
          const v = c.relations[o];
          return (
            <div className="rel-row" key={o} style={{ ['--c' as string]: PROFILES[o].look.ui }}>
              <Avatar id={o} mood={w.chars[o].mood} size={30} />
              <div className="rel-main">
                <div className="rel-top">
                  <b>{PROFILES[o].name}</b>
                  <span className="muted small">{relationLabel(v)}</span>
                  <span className="meter-num">{Math.round(v)}</span>
                </div>
                <div className="meter-track" role="meter" aria-label={`${PROFILES[o].name}との関係値`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
                  <div className="meter-fill" style={{ width: `${v}%`, background: PROFILES[o].look.ui }} />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="card">
        <h3>性格の傾向</h3>
        <TraitBar label="仕事熱心" value={(prof.diligence - 0.6) / 0.6} />
        <TraitBar label="社交的" value={prof.sociability} />
        <TraitBar label="寄り道好き" value={prof.spontaneity} />
        <TraitBar label="頑固さ" value={prof.stubbornness / 0.5} />
        <p className="small muted" style={{ marginTop: 8 }}>
          きょうの合計: 仕事 {minutesText(today.work)} / 食事 {minutesText(today.eat)} / 休憩・自由 {minutesText(today.rest + today.leisure)} /
          会話 {today.chats}回
        </p>
      </section>
    </div>
  );
}
