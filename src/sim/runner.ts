// 固定ステップの実行役。実時間(描画フレーム)から「何tick進めるか」だけを決める。
// 世界の進み方は tick の回数だけで決まるので、フレームレートや端末の速さで結果は変わらない。

import type { Speed } from './clock';

export class FixedStepRunner {
  /** 現実の1秒あたりのゲーム内分。0 = 一時停止 */
  speed: Speed = 1;
  /** たまった時間。1000 = 1tick分(ms×速度で数えて、小数の誤差を避ける) */
  private acc = 0;

  constructor(
    private readonly step: () => void,
    /** 1回の advance で進める tick の上限(遅い端末で処理が追いつかなくなるのを防ぐ) */
    private readonly maxStepsPerAdvance = 240,
    /** 1回に受け付ける経過時間の上限(ms)。タブが裏に回っていた間の大ジャンプを防ぐ */
    private readonly maxDeltaMs = 500,
  ) {}

  /** 経過した実時間(ms)を渡すと、必要な回数だけ step を呼ぶ。進めた tick 数を返す */
  advance(deltaMs: number): number {
    if (this.speed === 0) return 0;
    const dt = Math.min(Math.max(deltaMs, 0), this.maxDeltaMs);
    this.acc += dt * this.speed;
    let n = 0;
    while (this.acc >= 1000 && n < this.maxStepsPerAdvance) {
      this.step();
      this.acc -= 1000;
      n++;
    }
    if (this.acc >= 1000) this.acc %= 1000; // 追いつけない分は捨てる
    return n;
  }

  /** 次のtickまでの進み具合(0〜1)。描画の補間に使う */
  get progress(): number {
    return this.speed === 0 ? 1 : Math.min(1, this.acc / 1000);
  }

  resetAccumulator(): void {
    this.acc = 0;
  }
}
