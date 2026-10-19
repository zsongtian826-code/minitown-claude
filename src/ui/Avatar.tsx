import { useEffect, useRef } from 'react';
import type { Activity, CharId } from '../sim/types';
import { drawCharacter } from './render/sprites';

interface Props {
  id: CharId;
  mood: number;
  activity?: Activity;
  size?: number;
}

/** キャラクターの顔つきイラスト(パネル用の小さな絵) */
export function Avatar({ id, mood, activity = 'resting', size = 52 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  // 顔つきが変わる境目ごとに丸めて、数値が少し動くだけでは描き直さない
  const band = mood >= 72 ? 80 : mood >= 62 ? 65 : mood >= 36 ? 50 : 20;
  const act: Activity = activity === 'chatting' || activity === 'eating' ? activity : 'resting';
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const k = size / 46;
    ctx.translate(size / 2, size * 0.96);
    ctx.scale(k, k);
    drawCharacter(ctx, { id, facing: 1, activity: act, mood: band, time: 0.5, seed: 0 });
  }, [id, band, act, size]);
  return <canvas ref={ref} className="avatar" style={{ width: size, height: size }} aria-hidden="true" />;
}
