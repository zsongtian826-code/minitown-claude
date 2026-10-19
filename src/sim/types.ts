export type CharId = 'aoi' | 'mina' | 'ren';
export const CHAR_IDS: readonly CharId[] = ['aoi', 'mina', 'ren'];

export type Weather = 'sunny' | 'cloudy' | 'rainy';
export const WEATHERS: readonly Weather[] = ['sunny', 'cloudy', 'rainy'];

export interface Point {
  x: number;
  y: number;
}

/** いま実際にしていること(表示用) */
export type Activity =
  | 'sleeping'
  | 'morning'
  | 'walking'
  | 'working'
  | 'eating'
  | 'resting'
  | 'leisure'
  | 'chatting'
  | 'gathering';

/** 計画の種類(何のために動くか) */
export type GoalKind = 'sleep' | 'morning' | 'work' | 'eat' | 'rest' | 'leisure' | 'chat' | 'gather';
export const GOAL_KINDS: readonly GoalKind[] = [
  'sleep',
  'morning',
  'work',
  'eat',
  'rest',
  'leisure',
  'chat',
  'gather',
];

export interface Plan {
  kind: GoalKind;
  placeId: string;
  /** 目的地のタイル */
  spot: Point;
  stage: 'travel' | 'doing';
  /** doing の長さ(分)。0 = 条件で終わる(睡眠・勤務) */
  duration: number;
  /** doing の終了 tick(睡眠は使わない) */
  doUntil: number;
  startedAt: number;
  /** この tick までは、緊急でない限り他の計画へ乗り換えない */
  commitUntil: number;
  /** 行動の理由(UIに表示) */
  reason: string;
  /** 会話の相手(kind = chat のとき) */
  partner?: CharId;
  /** 勤務の終わり(その日の分)。kind = work のとき */
  workUntil?: number;
  /** 会話の接近を始めたときの相手の位置(相手が動いたら経路を引き直す) */
  partnerAt?: Point;
}

export interface ChatState {
  sessionId: number;
  partner: CharId;
  startTick: number;
  endTick: number;
}

export interface Bubble {
  text: string;
  untilTick: number;
}

export interface CharMemory {
  /** 種類ごとに最後に終えた tick */
  lastDone: Record<GoalKind, number>;
  /** 直前の計画 "kind@place" と終了 tick(同じことの繰り返しを避ける) */
  lastGoalKey: string;
  lastGoalEnd: number;
  /** 相手ごとの最後の会話 tick */
  lastChatWith: Record<CharId, number>;
  /** 最近使ったセリフID */
  recentLines: string[];
  wakeTick: number;
  sleepStart: number;
  /** 「出勤」を最後にログした日 */
  commuteLoggedDay: number;
}

export interface CharState {
  id: CharId;
  pos: Point;
  /** 1tick前の位置(描画の補間用) */
  prev: Point;
  facing: 1 | -1;
  activity: Activity;
  plan: Plan | null;
  /** 残りの経路(現在地を含まない) */
  path: Point[];
  hunger: number;
  fatigue: number;
  mood: number;
  relations: Record<CharId, number>;
  chat: ChatState | null;
  bubble: Bubble | null;
  /** 強制的に計画を見直す理由(雨など) */
  replan: string | null;
  mem: CharMemory;
}

export type LogType =
  | 'wake'
  | 'sleep'
  | 'commute'
  | 'work'
  | 'rest'
  | 'eat'
  | 'leisure'
  | 'talk'
  | 'home'
  | 'weather'
  | 'event'
  | 'system';

export interface LogEntry {
  id: number;
  tick: number;
  type: LogType;
  who?: CharId;
  text: string;
}

export interface ChatLine {
  tick: number;
  speaker: CharId;
  text: string;
  /** 話題(次の相づちを選ぶのに使う) */
  topic?: string;
}

export interface ChatSession {
  id: number;
  startTick: number;
  endTick: number;
  placeId: string;
  a: CharId;
  b: CharId;
  lines: ChatLine[];
  done: boolean;
  /** 会話で変わった関係値(a側・b側) */
  relDelta?: [number, number];
}

export interface WeatherState {
  current: Weather;
  prev: Weather;
  changedAt: number;
  /** この tick までは自然な天気変化をしない(突然の雨の効果時間) */
  holdUntil: number;
}

export interface InviteState {
  startTick: number;
  endTick: number;
  participants: CharId[];
}

export interface DayStat {
  work: number;
  eat: number;
  rest: number;
  leisure: number;
  chat: number;
  walk: number;
  sleep: number;
  chats: number;
}

export type UserEventType = 'rain' | 'gift' | 'invite';

export interface World {
  version: number;
  seed: number;
  /** 初期シード指定の文字列(表示用) */
  seedText: string;
  tick: number;
  rngState: number;
  weather: WeatherState;
  chars: Record<CharId, CharState>;
  log: LogEntry[];
  nextLogId: number;
  chats: ChatSession[];
  nextChatId: number;
  invite: InviteState | null;
  lastGiftAt: number;
  /** 種類ごとに、最後にユーザーがイベントを起こした tick(二重発火の防止に使う) */
  eventAt: Record<UserEventType, number>;
  /** 日ごとの統計 { [日]: { [id]: DayStat } } */
  stats: Record<string, Record<CharId, DayStat>>;
}

export interface EventResult {
  ok: boolean;
  message: string;
}
