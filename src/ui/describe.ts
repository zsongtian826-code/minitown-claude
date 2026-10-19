import type { CharState, GoalKind, Plan } from '../sim/types';
import { placeAt } from '../sim/map';
import { PROFILES } from '../sim/profiles';
import { chatPlaceName } from '../sim/chat';
import type { Option } from '../sim/behavior';

export const KIND_LABEL: Record<GoalKind, string> = {
  sleep: '就寝',
  morning: '朝の準備',
  work: '仕事',
  eat: '食事',
  rest: '休憩',
  leisure: '自由時間',
  chat: '会話',
  gather: 'お茶会',
};

export function locationName(c: CharState): string {
  return placeAt(c.pos)?.name ?? '街の通り';
}

export function planText(p: Plan): string {
  const place = chatPlaceName(p.placeId);
  if (p.kind === 'chat' && p.partner) return `${PROFILES[p.partner].name}と会話(${place})`;
  return `${KIND_LABEL[p.kind]}(${place})`;
}

export function optionText(o: Option): string {
  const place = chatPlaceName(o.placeId);
  if (o.kind === 'chat' && o.partner) return `${PROFILES[o.partner].name}と会話(${place})`;
  return `${KIND_LABEL[o.kind]}(${place})`;
}
