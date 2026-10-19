import type { LogType, Weather } from '../sim/types';
import { WEATHER_NAME } from '../sim/weather';
import { minuteOfDay } from '../sim/clock';

export const WEATHER_ICON: Record<Weather, string> = { sunny: '☀️', cloudy: '☁️', rainy: '🌧️' };

export function weatherLabel(w: Weather): string {
  return `${WEATHER_ICON[w]} ${WEATHER_NAME[w]}`;
}

export const LOG_ICON: Record<LogType, string> = {
  wake: '🌅',
  sleep: '🌙',
  commute: '🚪',
  work: '💼',
  rest: '☕',
  eat: '🍙',
  leisure: '🌿',
  talk: '💬',
  home: '🏠',
  weather: '🌦️',
  event: '✨',
  system: '📖',
};

export const LOG_TYPE_NAME: Record<LogType, string> = {
  wake: '起床',
  sleep: '就寝',
  commute: '出勤',
  work: '仕事',
  rest: '休憩',
  eat: '食事',
  leisure: '自由',
  talk: '会話',
  home: '帰宅',
  weather: '天候',
  event: 'イベント',
  system: '記録',
};

export type LogFilter = 'all' | 'life' | 'talk' | 'weather' | 'event';

export const LOG_FILTERS: { id: LogFilter; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'life', label: '生活' },
  { id: 'talk', label: '会話' },
  { id: 'weather', label: '天候' },
  { id: 'event', label: 'イベント' },
];

export function matchesFilter(type: LogType, f: LogFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'life':
      return ['wake', 'sleep', 'commute', 'work', 'rest', 'eat', 'leisure', 'home'].includes(type);
    case 'talk':
      return type === 'talk';
    case 'weather':
      return type === 'weather';
    case 'event':
      return type === 'event' || type === 'system';
  }
}

export function dayPhase(tick: number): string {
  const m = minuteOfDay(tick);
  if (m < 5 * 60) return '深夜';
  if (m < 9 * 60) return '朝';
  if (m < 11 * 60 + 30) return '午前';
  if (m < 14 * 60) return '昼';
  if (m < 17 * 60) return '午後';
  if (m < 19 * 60) return '夕方';
  if (m < 23 * 60) return '夜';
  return '深夜';
}

export function relationLabel(v: number): string {
  if (v < 25) return 'よそよそしい';
  if (v < 45) return '顔見知り';
  if (v < 65) return '友だち';
  if (v < 85) return '仲良し';
  return '親友';
}

export function hungerText(v: number): string {
  if (v >= 85) return 'ぺこぺこ';
  if (v >= 65) return 'お腹すいた';
  if (v >= 40) return 'ちょっと空腹';
  if (v >= 15) return 'ふつう';
  return '満腹';
}

export function fatigueText(v: number): string {
  if (v >= 85) return 'へとへと';
  if (v >= 65) return '疲れてきた';
  if (v >= 40) return '少し疲れ';
  if (v >= 15) return '元気';
  return 'すっきり';
}

export function moodText(v: number): string {
  if (v >= 80) return 'ごきげん';
  if (v >= 62) return 'いい感じ';
  if (v >= 40) return 'ふつう';
  if (v >= 22) return 'ちょっと沈み気味';
  return '落ち込み中';
}

export function minutesText(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}
