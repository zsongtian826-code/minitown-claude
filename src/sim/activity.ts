import type { Activity, GoalKind } from './types';

/** 計画の種類 → 実際の行動(そこに着いて「している」とき) */
export function activityFor(kind: GoalKind): Activity {
  switch (kind) {
    case 'sleep':
      return 'sleeping';
    case 'morning':
      return 'morning';
    case 'work':
      return 'working';
    case 'eat':
      return 'eating';
    case 'rest':
      return 'resting';
    case 'leisure':
      return 'leisure';
    case 'chat':
      return 'chatting';
    case 'gather':
      return 'gathering';
  }
}

export const ACTIVITY_LABEL: Record<Activity, string> = {
  sleeping: '就寝中',
  morning: '朝の準備中',
  walking: '移動中',
  working: '仕事中',
  eating: '食事中',
  resting: '休憩中',
  leisure: '自由時間',
  chatting: '会話中',
  gathering: 'お茶会',
};

export const ACTIVITY_ICON: Record<Activity, string> = {
  sleeping: '💤',
  morning: '☀️',
  walking: '🚶',
  working: '💼',
  eating: '🍙',
  resting: '☕',
  leisure: '🌿',
  chatting: '💬',
  gathering: '🍰',
};
