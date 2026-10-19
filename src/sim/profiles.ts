// キャラクターの個性。ここの数値が、行動の選び方・状態変化・口調の元になる。

import type { CharId } from './types';
import type { PlaceKind } from './map';

export interface Profile {
  id: CharId;
  name: string;
  /** 性格(UIにも表示) */
  personality: string;
  /** 特徴 */
  trait: string;
  /** 仕事を優先する度合い (0.8〜1.2) */
  diligence: number;
  /** 人と話したい度合い (0〜1) */
  sociability: number;
  /** 予定外のことをしやすい度合い (0〜1) */
  spontaneity: number;
  /** いまの行動を変えることへの抵抗(大きいほど中断しにくい) */
  stubbornness: number;
  /** 出勤の余裕(分)。負なら遅れ気味 */
  slack: number;
  /** 起床時刻のずれ(分) */
  wakeOffset: number;
  /** 空腹・疲労の進みやすさ(1が標準) */
  hungerRate: number;
  fatigueRate: number;
  /** 気分が落ち着く先 */
  baseMood: number;
  /** 食事をする場所の好み */
  meal: Record<PlaceKind, number>;
  /** 休憩・自由時間を過ごす場所の好み */
  leisure: Record<PlaceKind, number>;
  /** 傘を持ち歩くか(雨で気分が下がりにくい) */
  umbrella: boolean;
  /** 同じ相手との会話の間隔(分) */
  chatCooldown: number;
  /** 仕事中の気分の変化(分あたり) */
  workMood: number;
  /** 初期の関係値 */
  initialRelations: Record<CharId, number>;
  /** 見た目 */
  look: {
    hair: string;
    hairDark: string;
    top: string;
    topDark: string;
    bottom: string;
    accent: string;
    ui: string;
  };
}

export const PROFILES: Record<CharId, Profile> = {
  aoi: {
    id: 'aoi',
    name: 'アオイ',
    personality: '真面目で几帳面',
    trait: '予定通りに動く。仕事を優先し、中断するのが苦手。',
    diligence: 1.2,
    sociability: 0.35,
    spontaneity: 0.08,
    stubbornness: 0.45,
    slack: 14,
    wakeOffset: 0,
    hungerRate: 1.0,
    fatigueRate: 0.95,
    baseMood: 55,
    meal: { home: 0.5, office: 1.0, cafe: 0.5, park: 0.1, plaza: 0.08 },
    leisure: { home: 0.9, office: 0.4, cafe: 0.55, park: 0.35, plaza: 0.3 },
    umbrella: true,
    chatCooldown: 120,
    workMood: 0.012,
    initialRelations: { aoi: 0, mina: 42, ren: 34 },
    look: {
      hair: '#2f3f6b',
      hairDark: '#222e52',
      top: '#f4f1ea',
      topDark: '#d8d2c4',
      bottom: '#34497a',
      accent: '#34497a',
      ui: '#4a6aa8',
    },
  },
  mina: {
    id: 'mina',
    name: 'ミナ',
    personality: '明るく社交的',
    trait: '人と話すのが大好き。会話や休憩を積極的にとる。',
    diligence: 0.95,
    sociability: 1.0,
    spontaneity: 0.5,
    stubbornness: 0.2,
    slack: 6,
    wakeOffset: 5,
    hungerRate: 1.05,
    fatigueRate: 1.0,
    baseMood: 68,
    meal: { home: 0.35, office: 0.25, cafe: 1.0, park: 0.4, plaza: 0.5 },
    leisure: { home: 0.3, office: 0.3, cafe: 1.0, park: 0.55, plaza: 0.9 },
    umbrella: false,
    chatCooldown: 55,
    workMood: -0.004,
    initialRelations: { aoi: 46, mina: 0, ren: 50 },
    look: {
      hair: '#e8893a',
      hairDark: '#c46a22',
      top: '#ffd25a',
      topDark: '#e0b03a',
      bottom: '#e76f6f',
      accent: '#e76f6f',
      ui: '#ee8a3c',
    },
  },
  ren: {
    id: 'ren',
    name: 'レン',
    personality: 'マイペースで好奇心旺盛',
    trait: '予定外の寄り道をしがち。公園やカフェが好き。',
    diligence: 0.8,
    sociability: 0.55,
    spontaneity: 1.0,
    stubbornness: 0.1,
    slack: -2,
    wakeOffset: 20,
    hungerRate: 1.1,
    fatigueRate: 0.9,
    baseMood: 62,
    meal: { home: 0.3, office: 0.2, cafe: 0.7, park: 0.95, plaza: 0.5 },
    leisure: { home: 0.3, office: 0.2, cafe: 0.8, park: 1.0, plaza: 0.6 },
    umbrella: false,
    chatCooldown: 80,
    workMood: -0.025,
    initialRelations: { aoi: 36, mina: 52, ren: 0 },
    look: {
      hair: '#3fae86',
      hairDark: '#2a8a68',
      top: '#47b6c8',
      topDark: '#2f94a6',
      bottom: '#5a5f78',
      accent: '#f4c542',
      ui: '#3aa383',
    },
  },
};

export function profileOf(id: CharId): Profile {
  return PROFILES[id];
}
