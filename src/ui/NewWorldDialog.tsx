import { useEffect, useRef, useState } from 'react';
import { randomSeed } from './useGame';

interface Props {
  open: boolean;
  /** 上書きされる現在の世界の表示(例: 3日目 14:20) */
  currentLabel: string;
  currentSeed: string;
  hasSave: boolean;
  onCancel(): void;
  onConfirm(seed: string): void;
}

/** 新しい世界を始める確認。セーブデータを上書きすることをはっきり伝える */
export function NewWorldDialog({ open, currentLabel, currentSeed, hasSave, onCancel, onConfirm }: Props) {
  const [seed, setSeed] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSeed(randomSeed());
      const t = window.setTimeout(() => inputRef.current?.select(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nw-title"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(seed);
        }}
      >
        <h2 id="nw-title">🆕 新しい世界を始める</h2>
        <label className="field">
          <span>ランダムシード(同じ数字なら、同じ世界がはじまります)</span>
          <div className="field-row">
            <input
              ref={inputRef}
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              inputMode="text"
              autoComplete="off"
              maxLength={40}
              placeholder="例: 12345"
            />
            <button type="button" className="btn" onClick={() => setSeed(randomSeed())}>
              🎲 ランダム
            </button>
          </div>
        </label>
        <div className="warn-box" role="alert">
          <b>⚠️ いまの世界は消えます</b>
          <p>
            {hasSave ? '保存されているセーブデータ' : 'いまの世界'}({currentLabel}、シード {currentSeed})は、新しい世界で
            <b>上書き</b>されます。元には戻せません。
          </p>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            キャンセル
          </button>
          <button type="submit" className="btn danger">
            上書きして始める
          </button>
        </div>
      </form>
    </div>
  );
}
