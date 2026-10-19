import { useEffect, useRef, useState } from 'react';
import { SPEEDS, dayOf, formatStamp, formatTime, type Speed } from './sim/clock';
import { CHAR_IDS, type UserEventType } from './sim/types';
import { PROFILES } from './sim/profiles';
import { ACTIVITY_ICON, ACTIVITY_LABEL } from './sim/activity';
import { EVENT_LABEL } from './sim/events';
import { useGame } from './ui/useGame';
import { MapView } from './ui/MapView';
import { Avatar } from './ui/Avatar';
import { NewWorldDialog } from './ui/NewWorldDialog';
import { CharPanel } from './ui/panels/CharPanel';
import { LogPanel } from './ui/panels/LogPanel';
import { ChatPanel } from './ui/panels/ChatPanel';
import { RelationPanel } from './ui/panels/RelationPanel';
import { SummaryPanel } from './ui/panels/SummaryPanel';
import { dayPhase, weatherLabel } from './ui/format';
import { locationName } from './ui/describe';

type TabId = 'char' | 'log' | 'chat' | 'rel' | 'sum';
const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'char', icon: '🧑', label: '住人' },
  { id: 'log', icon: '📜', label: 'ログ' },
  { id: 'chat', icon: '💬', label: '会話' },
  { id: 'rel', icon: '💞', label: '関係' },
  { id: 'sum', icon: '📒', label: '振り返り' },
];

const EVENTS: { type: UserEventType; icon: string; title: string }[] = [
  { type: 'rain', icon: '☔', title: '現在の天気を雨に変えます。屋外にいる人は雨宿りに向かいます' },
  { type: 'gift', icon: '🍰', title: 'オフィスにいる人に食べ物が届きます(空腹が減り、気分が上がります)' },
  { type: 'invite', icon: '☕', title: '起きている人をカフェにお誘いします。参加するかは性格と状態しだい' },
];

const SPEED_LABEL: Record<number, string> = { 1: '1×', 10: '10×', 60: '60×' };

export default function App() {
  const game = useGame();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tab, setTab] = useState<TabId>('char');
  const [newOpen, setNewOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(true);
  const w = game.sim.world;

  // トーストは数秒で消す
  const toastId = game.toast?.id;
  useEffect(() => {
    if (toastId === undefined) return;
    setToastVisible(true);
    const t = window.setTimeout(() => setToastVisible(false), 4800);
    return () => window.clearTimeout(t);
  }, [toastId]);

  // キーボード: スペースで一時停止/再開、1・2・3で速度
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing || newOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ') {
        // ボタンにフォーカスがあるときは、ボタン自身の動作(押す)を優先する
        if (el && el.tagName === 'BUTTON') return;
        e.preventDefault();
        game.togglePause();
      } else if (e.key === '1') game.setSpeed(1);
      else if (e.key === '2') game.setSpeed(10);
      else if (e.key === '3') game.setSpeed(60);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const screenshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `minitown-day${dayOf(w.tick)}-${formatTime(w.tick).replace(':', '')}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  };

  const paused = game.speed === 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">
            🏘️
          </span>
          <div>
            <h1>ミニタウン</h1>
            <p className="brand-sub">シード {w.seedText}</p>
          </div>
        </div>
        <div className="clock" aria-live="off">
          <div className="clock-main">
            <span className="clock-day">{dayOf(w.tick)}日目</span>
            <time className="clock-time" aria-label={`ゲーム内時刻 ${formatStamp(w.tick)}`}>
              {formatTime(w.tick)}
            </time>
          </div>
          <div className="clock-sub">
            <span className="chip-static">{dayPhase(w.tick)}</span>
            <span className="chip-static" aria-label={`天気 ${weatherLabel(w.weather.current)}`}>
              {weatherLabel(w.weather.current)}
            </span>
          </div>
        </div>
        <div className="controls" role="group" aria-label="時間の操作">
          <button className={`btn play ${paused ? 'is-paused' : ''}`} onClick={game.togglePause} aria-pressed={paused} aria-label={paused ? '再開' : '一時停止'} title="スペースキーでも切り替えられます">
            <span aria-hidden="true">{paused ? '▶' : '⏸'}</span> {paused ? '再開' : '一時停止'}
          </button>
          <div className="seg" role="radiogroup" aria-label="速度">
            {SPEEDS.filter((s) => s !== 0).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={game.speed === s}
                aria-label={`${s}倍速`}
                className={`seg-btn ${game.speed === s ? 'is-active' : ''}`}
                onClick={() => game.setSpeed(s as Speed)}
                title={`現実の1秒 = ゲーム内${s}分(キー: ${s === 1 ? 1 : s === 10 ? 2 : 3})`}
              >
                {SPEED_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="map-col" aria-label="街の様子">
          <div className="map-card">
            <MapView game={game} canvasRef={canvasRef} />
            {paused && <div className="paused-badge">⏸ 一時停止中</div>}
            <div className="map-badges" aria-hidden="true">
              <span>{weatherLabel(w.weather.current)}</span>
              <span>{formatStamp(w.tick)}</span>
            </div>
          </div>

          <ul className="char-strip" aria-label="住人の一覧">
            {CHAR_IDS.map((id) => {
              const c = w.chars[id];
              return (
                <li key={id}>
                  <button
                    className={`strip-btn ${game.selected === id ? 'is-active' : ''}`}
                    style={{ ['--c' as string]: PROFILES[id].look.ui }}
                    aria-pressed={game.selected === id}
                    onClick={() => {
                      game.select(id);
                      setTab('char');
                    }}
                  >
                    <Avatar id={id} mood={c.mood} activity={c.activity} size={40} />
                    <span className="strip-text">
                      <b>{PROFILES[id].name}</b>
                      <span>
                        <span aria-hidden="true">{ACTIVITY_ICON[c.activity]}</span> {ACTIVITY_LABEL[c.activity]}
                      </span>
                      <small>{locationName(c)}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="actions-card">
            <h2 className="mini-title">世界に介入する</h2>
            <div className="event-row">
              {EVENTS.map((e) => (
                <button key={e.type} className="btn event-btn" title={e.title} aria-label={`${EVENT_LABEL[e.type]}を起こす`} onClick={() => game.trigger(e.type)}>
                  <span aria-hidden="true">{e.icon}</span> {EVENT_LABEL[e.type]}
                </button>
              ))}
            </div>
            <div className="world-row">
              <button className="btn" onClick={game.saveNow}>
                💾 保存
              </button>
              <button className="btn" onClick={game.loadNow}>
                📂 読み込み
              </button>
              <button className="btn" onClick={screenshot}>
                📷 画像で保存
              </button>
              <button className="btn danger-outline" onClick={() => setNewOpen(true)}>
                🆕 新しい世界
              </button>
            </div>
            <details className="about">
              <summary>このアプリについて</summary>
              <p>
                3人の住人が、空腹・疲労・気分と性格をもとに、自分で行動を決めて暮らします。放っておいても生活は続きます。
                キャラクターをクリックすると詳細が見られます。自動で保存されるので、閉じても続きから再開できます。
              </p>
              <p className="small">キー: スペース=一時停止/再開、1・2・3=速度</p>
            </details>
          </div>
        </section>

        <aside className="side-col" aria-label="情報パネル">
          <div className="tabs" role="tablist" aria-label="情報の切り替え">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="tabpanel"
                className={`tab ${tab === t.id ? 'is-active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span aria-hidden="true">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="tabpanel">
            {tab === 'char' && <CharPanel game={game} />}
            {tab === 'log' && <LogPanel game={game} />}
            {tab === 'chat' && <ChatPanel game={game} />}
            {tab === 'rel' && <RelationPanel game={game} />}
            {tab === 'sum' && <SummaryPanel game={game} />}
          </div>
        </aside>
      </main>

      <NewWorldDialog
        open={newOpen}
        currentLabel={formatStamp(w.tick)}
        currentSeed={w.seedText}
        hasSave={newOpen && game.hasSave()}
        onCancel={() => setNewOpen(false)}
        onConfirm={(seed) => {
          setNewOpen(false);
          game.newWorld(seed);
        }}
      />

      <div className="toast-zone" role="status" aria-live="polite">
        {game.toast && toastVisible && <div className={`toast ${game.toast.tone}`}>{game.toast.text}</div>}
      </div>
    </div>
  );
}
