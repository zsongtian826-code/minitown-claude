// ワールドクロック。信頼できる時間は world.tick(1tick = ゲーム内1分)ただ一つで、
// 日付・時刻はすべてここの関数で tick から求める。

/** 開始時刻 1日目 07:00 */
export const START_MINUTE = 7 * 60;
export const MINUTES_PER_DAY = 24 * 60;

/** 速度(現実の1秒あたりのゲーム内分)。0 = 一時停止 */
export const SPEEDS = [0, 1, 10, 60] as const;
export type Speed = (typeof SPEEDS)[number];

export function absoluteMinute(tick: number): number {
  return START_MINUTE + tick;
}

export function dayOf(tick: number): number {
  return Math.floor(absoluteMinute(tick) / MINUTES_PER_DAY) + 1;
}

/** その日の0:00からの分(0〜1439) */
export function minuteOfDay(tick: number): number {
  return absoluteMinute(tick) % MINUTES_PER_DAY;
}

export function hhmm(minute: number): string {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function formatTime(tick: number): string {
  return hhmm(minuteOfDay(tick));
}

export function formatStamp(tick: number): string {
  return `${dayOf(tick)}日目 ${formatTime(tick)}`;
}

/** 時刻の指定(分)。読みやすさのための定数 */
export const T = {
  wake: 7 * 60,
  workAm: 9 * 60,
  lunch: 12 * 60,
  workPm: 13 * 60,
  workEnd: 17 * 60,
  free: 18 * 60,
  bed: 23 * 60,
} as const;

/** 勤務ブロック(午前 9:00-12:00 / 午後 13:00-17:00) */
export const WORK_BLOCKS: readonly (readonly [number, number])[] = [
  [T.workAm, T.lunch],
  [T.workPm, T.workEnd],
];

export function workBlockAt(minute: number): readonly [number, number] | null {
  for (const b of WORK_BLOCKS) if (minute >= b[0] && minute < b[1]) return b;
  return null;
}

/** 夜(就寝時間帯)かどうか: 23:00〜翌6:00 */
export function isNight(minute: number): boolean {
  return minute >= T.bed || minute < 6 * 60;
}
