import { useEffect, useRef, type RefObject } from 'react';
import { CHAR_IDS, type CharId } from '../sim/types';
import { PROFILES } from '../sim/profiles';
import { placeAt } from '../sim/map';
import { ACTIVITY_LABEL } from '../sim/activity';
import { WEATHER_NAME } from '../sim/weather';
import { formatStamp } from '../sim/clock';
import type { Game } from './useGame';
import { drawFrame } from './render/frame';
import { TILE, WORLD_H, WORLD_W, drawStaticLayer } from './render/static';

interface Props {
  game: Game;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/** 街のマップ。地面は一度だけ描いて保存し、毎フレームはキャラクター・昼夜・雨だけを重ねる */
export function MapView({ game, canvasRef }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ground = document.createElement('canvas');
    groundRef.current = ground;
    let scale = 1;

    const resize = () => {
      const cssW = Math.max(240, wrap.clientWidth);
      const cssH = (cssW * WORLD_H) / WORLD_W;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const pw = Math.round(cssW * dpr);
      const ph = Math.round(cssH * dpr);
      scale = pw / WORLD_W;
      canvas.width = pw;
      canvas.height = ph;
      canvas.style.height = `${cssH}px`;
      ground.width = pw;
      ground.height = ph;
      const g = ground.getContext('2d')!;
      g.setTransform(scale, 0, 0, scale, 0, 0);
      drawStaticLayer(g);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const loop = (nowMs: number) => {
      const g = gameRef.current;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const paused = g.runner.speed === 0;
      drawFrame(ctx, ground, {
        world: g.sim.world,
        alpha: paused ? 1 : g.runner.progress,
        time: nowMs / 1000,
        selected: g.selected,
        paused,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [canvasRef]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WORLD_W;
    const y = ((e.clientY - rect.top) / rect.height) * WORLD_H;
    let best: CharId | null = null;
    let bestD = 30; // タップしやすいよう、少し広めに判定する
    for (const id of CHAR_IDS) {
      const c = game.sim.world.chars[id];
      const cx = (c.pos.x + 0.5) * TILE;
      const cy = (c.pos.y + 0.5) * TILE - 6;
      const d = Math.hypot(cx - x, cy - y);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    if (best) game.select(best);
  };

  const w = game.sim.world;
  const summary = CHAR_IDS.map((id) => {
    const c = w.chars[id];
    return `${PROFILES[id].name}は${placeAt(c.pos)?.name ?? '街の通り'}で${ACTIVITY_LABEL[c.activity]}`;
  }).join('、');

  return (
    <div className="map-frame" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="map-canvas"
        onPointerDown={onPointerDown}
        role="img"
        aria-label={`街のマップ。${formatStamp(w.tick)}、天気は${WEATHER_NAME[w.weather.current]}。${summary}。キャラクターをクリックすると詳細が見られます。`}
      />
    </div>
  );
}
