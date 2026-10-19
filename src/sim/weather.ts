// 天候。天気の状態は world.weather ただ一つで、変えるときは必ず setWeather を通す。
// ログの文章も setWeather が (変更前→変更後) から作るので、表示・ログ・会話と内部状態が食い違わない。

import type { Rng } from './rng';
import type { Weather, World } from './types';
import { CHAR_IDS } from './types';
import { placeAt } from './map';
import { minuteOfDay } from './clock';
import { pushLog } from './world';

export const WEATHER_NAME: Record<Weather, string> = {
  sunny: '晴れ',
  cloudy: '曇り',
  rainy: '雨',
};

/** 1時間ごとの天気の移り変わり確率 */
const TRANSITIONS: Record<Weather, readonly (readonly [Weather, number])[]> = {
  sunny: [
    ['sunny', 0.86],
    ['cloudy', 0.13],
    ['rainy', 0.01],
  ],
  cloudy: [
    ['sunny', 0.15],
    ['cloudy', 0.7],
    ['rainy', 0.15],
  ],
  rainy: [
    ['sunny', 0.03],
    ['cloudy', 0.17],
    ['rainy', 0.8],
  ],
};

export type WeatherCause = 'natural' | 'event';

function changeText(prev: Weather, next: Weather, cause: WeatherCause): string {
  if (next === 'rainy') return cause === 'event' ? '突然の雨が降り出した！' : '雨が降り出した';
  if (prev === 'rainy') return next === 'sunny' ? '雨が止んで、空が晴れた' : '雨が止んだ。空はまだ曇っている';
  return next === 'sunny' ? '雲が切れて、日が差してきた' : '空に雲が広がってきた';
}

/** 天気を変える唯一の入口。変更があれば true */
export function setWeather(world: World, next: Weather, cause: WeatherCause): boolean {
  const prev = world.weather.current;
  if (prev === next) return false;
  world.weather.prev = prev;
  world.weather.current = next;
  world.weather.changedAt = world.tick;
  pushLog(world, 'weather', changeText(prev, next, cause));
  if (next === 'rainy') {
    // 屋外にいる(睡眠中でない)人は、行き先を見直す
    for (const id of CHAR_IDS) {
      const c = world.chars[id];
      const place = placeAt(c.pos);
      if (c.activity !== 'sleeping' && !(place && place.indoor)) c.replan = 'rain';
    }
  }
  return true;
}

export function updateWeather(world: World, rng: Rng): void {
  const w = world.weather;
  if (world.tick < w.holdUntil) return;
  const onTheHour = minuteOfDay(world.tick) % 60 === 0;
  if (!onTheHour && world.tick !== w.holdUntil) return;
  const r = rng.next();
  let acc = 0;
  for (const [to, p] of TRANSITIONS[w.current]) {
    acc += p;
    if (r < acc) {
      setWeather(world, to, 'natural');
      return;
    }
  }
}

/** 雨が止んでから(または降り出してから)の経過分 */
export function minutesSinceWeatherChange(world: World): number {
  return world.tick - world.weather.changedAt;
}
