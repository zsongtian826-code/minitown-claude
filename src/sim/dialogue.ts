// ルールベースの会話生成(外部AIは使わない)。
// セリフの部品(テンプレート)に「使える条件」(天候・時間・体調・出来事)を付けておき、
// いまの状況に合うものだけを候補にして、重み付きの乱数で選ぶ。
// 天候に触れるセリフは必ず wx / flag で条件を付けてあり、内部の天候と矛盾する文は選ばれない。

import type { Rng } from './rng';
import { pickWeighted } from './rng';
import type { CharId, Weather, World } from './types';
import { placeAt, type PlaceKind } from './map';
import { minuteOfDay, T } from './clock';
import { smooth } from './needs';

export type Topic =
  | 'greet'
  | 'weather'
  | 'hunger'
  | 'tired'
  | 'work'
  | 'place'
  | 'mood'
  | 'chitchat'
  | 'event'
  | 'reply'
  | 'closing';

export type DialogueFlag = 'rainStopped' | 'rainStarted' | 'gift' | 'invite' | 'rainEvent';

export interface DCtx {
  m: number;
  part: 'morning' | 'day' | 'evening' | 'night';
  weather: Weather;
  prevWeather: Weather;
  sinceChange: number;
  hunger: number;
  fatigue: number;
  mood: number;
  rel: number;
  placeKind: PlaceKind | null;
  flags: Set<DialogueFlag>;
}

export interface Tpl {
  text: string;
  /** 使える天候(指定すると、その天候のときだけ) */
  wx?: Weather[];
  /** 使える出来事(指定すると、その出来事が最近あったときだけ) */
  flag?: DialogueFlag;
  when?: (d: DCtx) => boolean;
  w?: number;
}

type Pool = Partial<Record<Topic, Tpl[]>>;

const morning = (d: DCtx) => d.part === 'morning';
const day = (d: DCtx) => d.part === 'day';
const evening = (d: DCtx) => d.part === 'evening' || d.part === 'night';
const atPlace = (k: PlaceKind) => (d: DCtx) => d.placeKind === k;

/** 呼び方 */
const CALL: Record<CharId, Record<CharId, string>> = {
  aoi: { aoi: '', mina: 'ミナさん', ren: 'レンさん' },
  mina: { aoi: 'アオイちゃん', mina: '', ren: 'レンくん' },
  ren: { aoi: 'アオイさん', mina: 'ミナ', ren: '' },
};

const POOLS: Record<CharId, Pool> = {
  // ---- アオイ: 丁寧で落ち着いた敬語 ----
  aoi: {
    greet: [
      { text: 'おはようございます、{L}。今日もよろしくお願いします。', when: morning },
      { text: '{L}、おはようございます。今日の予定は確認しましたか？', when: morning },
      { text: 'お疲れさまです、{L}。', when: day },
      { text: '{L}、こんにちは。調子はいかがですか。', when: day },
      { text: 'お疲れさまでした、{L}。今日も無事に一日が終わりそうですね。', when: evening },
      { text: '{L}、こんばんは。この時間にお会いするのは珍しいですね。', when: evening },
      { text: 'あの、{L}。少しだけ、お話ししてもよろしいですか？', when: (d) => d.rel < 40 },
      { text: '{L}と話していると、不思議と肩の力が抜けます。', when: (d) => d.rel >= 70 },
    ],
    weather: [
      { text: '今日は晴れていて、洗濯物がよく乾きそうです。', wx: ['sunny'] },
      { text: 'いい天気ですね。気持ちが落ち着きます。', wx: ['sunny'] },
      { text: '少し曇ってきましたね。折りたたみ傘は持っていますが。', wx: ['cloudy'] },
      { text: '曇り空ですが、過ごしやすい気温です。', wx: ['cloudy'] },
      { text: '雨ですね。傘を持ってきて正解でした。', wx: ['rainy'] },
      { text: '雨の日は、足元に気をつけてくださいね。', wx: ['rainy'] },
      { text: '雨、止みましたね。傘を畳めます。', flag: 'rainStopped', w: 3 },
      { text: 'さっきまで降っていた雨が上がりましたね。', flag: 'rainStopped', w: 3 },
      { text: '雨が降り出しましたね。傘はお持ちですか？', flag: 'rainStarted', w: 3 },
    ],
    hunger: [
      { text: '少しお腹が空いてきました。食事の時間は、きちんと取らないといけませんね。' },
      { text: '空腹だと集中できないので、早めに何か食べます。' },
    ],
    tired: [
      { text: '少し疲れが出てきました。休憩も仕事のうち、ですね。' },
      { text: '肩が凝ってきました。姿勢を直さないと。' },
    ],
    work: [
      { text: '午後までに、資料を仕上げる予定です。', when: (d) => d.m >= 480 && d.m < T.workEnd },
      { text: '今日の進捗は、ほぼ予定通りです。', when: (d) => d.m >= 480 && d.m < 20 * 60 },
      { text: '優先順位を整理すると、作業が捗りますよ。' },
      { text: '明日の段取りも、今日のうちに確認しておきたいです。', when: evening },
    ],
    place: [
      { text: 'このオフィスは整理整頓されていて、好きです。', when: atPlace('office') },
      { text: 'このカフェは静かで、考え事に向いていますね。', when: atPlace('cafe') },
      { text: '公園を歩くのは、いい気分転換になりますね。', when: atPlace('park') },
      { text: '噴水の音を聞いていると、落ち着きます。', when: atPlace('plaza') },
    ],
    mood: [
      { text: '今日は調子がいいです。', when: (d) => d.mood > 62 },
      { text: '今日は少し気が重いですが、頑張ります。', when: (d) => d.mood < 38 },
    ],
    chitchat: [
      { text: 'そういえば、最近、本棚を整理したんです。' },
      { text: '手帳の予定通りに進むと、気持ちがいいですよね。' },
      { text: '明日の準備は、前の晩に済ませるようにしています。' },
      { text: '最近、お茶を丁寧に淹れるのに凝っているんです。' },
    ],
    event: [
      { text: '差し入れ、ありがとうございました。おかげで午後も頑張れそうです。', flag: 'gift' },
      { text: 'お誘いありがとうございます。たまには寄り道も悪くないですね。', flag: 'invite' },
      { text: '急な雨には驚きましたが、傘があって助かりました。', flag: 'rainEvent', wx: ['rainy'] },
    ],
    reply: [
      { text: 'そうですね。' },
      { text: 'なるほど、参考になります。' },
      { text: 'ええ、わたしもそう思います。' },
      { text: '確かに、そうかもしれませんね。' },
    ],
    closing: [
      { text: 'では、そろそろ失礼します。' },
      { text: 'それでは、また。' },
      { text: 'お話しできてよかったです。' },
      { text: 'それでは、おやすみなさい。', when: (d) => d.m >= 21 * 60 },
    ],
  },

  // ---- ミナ: 明るくてフランク ----
  mina: {
    greet: [
      { text: 'おはよー、{L}！今日もいい一日にしようね！', when: morning },
      { text: '{L}、おはよう！朝ごはん食べた？', when: morning },
      { text: 'あっ、{L}！ちょうどよかった〜！', when: day },
      { text: '{L}、お疲れさま〜！', when: day },
      { text: '{L}〜！お疲れさま！今日もがんばったね！', when: evening },
      { text: 'こんばんは、{L}！まだ元気？', when: evening },
      { text: 'あ、{L}！あんまりちゃんと話したことなかったよね。よろしくね！', when: (d) => d.rel < 40 },
      { text: '{L}と話してるのが、いちばん落ち着くかも〜。', when: (d) => d.rel >= 70 },
    ],
    weather: [
      { text: '見て見て、すっごくいい天気！', wx: ['sunny'] },
      { text: '晴れてると、それだけでテンション上がるよね〜。', wx: ['sunny'] },
      { text: 'ちょっと曇ってきたね。雨、降らないといいなあ。', wx: ['cloudy'] },
      { text: '曇りの日って、なんだかのんびりしたくなるよね。', wx: ['cloudy'] },
      { text: '雨かあ…でも、雨の音ってちょっと好きかも。', wx: ['rainy'] },
      { text: '雨だと髪がまとまらないんだよね〜。', wx: ['rainy'] },
      { text: 'あっ、雨やんだ！虹とか出ないかな〜。', flag: 'rainStopped', w: 3 },
      { text: 'やっと雨が上がったね！外に出たくなっちゃう！', flag: 'rainStopped', w: 3 },
      { text: 'あれ、雨降ってきた？！', flag: 'rainStarted', w: 3 },
    ],
    hunger: [
      { text: 'お腹すいたぁ…何か食べに行こうよ！' },
      { text: 'ぐぅ〜ってお腹鳴りそう。' },
    ],
    tired: [
      { text: 'ちょっと疲れちゃった〜。甘いものでも食べて回復したい！' },
      { text: '今日はなんだか体が重いなあ。' },
    ],
    work: [
      { text: '今日の仕事、ちゃんと終わるかなあ。', when: (d) => d.m >= 480 && d.m < T.workEnd },
      { text: 'お昼までに終わらせて、ゆっくりしたいな〜。', when: (d) => d.m >= 480 && d.m < T.lunch },
      { text: '今日もお仕事おつかれさま！えらい！', when: evening },
    ],
    place: [
      { text: 'ここの休憩スペース、けっこう好きなんだ〜。', when: atPlace('office') },
      { text: 'このカフェ、ケーキがおいしいんだよね！', when: atPlace('cafe') },
      { text: 'いつもの席が空いてて、ラッキー！', when: atPlace('cafe') },
      { text: '公園って、歩いてるだけで元気が出るよね。', when: atPlace('park') },
      { text: '噴水のそばって、なんだかワクワクする！', when: atPlace('plaza') },
    ],
    mood: [
      { text: '今日はなんだか、いいことありそうな気がする！', when: (d) => d.mood > 65 },
      { text: 'ちょっとだけ元気ないかも…話、聞いてくれる？', when: (d) => d.mood < 40 },
    ],
    chitchat: [
      { text: 'そうだ、この前おもしろいお店を見つけたんだよ！' },
      { text: 'ねえねえ、今度みんなでどこか行かない？' },
      { text: '最近ね、ハマってる曲があるんだ〜。' },
      { text: '新しいヘアゴム買っちゃった。どう？似合う？' },
    ],
    event: [
      { text: '差し入れ、おいしかった〜！ごちそうさま！', flag: 'gift' },
      { text: 'お茶に誘ってもらえて、うれしい！', flag: 'invite' },
      { text: '急に降ってきてびっくりしたよね〜！', flag: 'rainEvent', wx: ['rainy'] },
    ],
    reply: [
      { text: 'うんうん、わかる〜！' },
      { text: 'へえ〜、そうなんだ！' },
      { text: 'あはは、それいいね！' },
      { text: 'ほんとに？もっと聞かせて！' },
    ],
    closing: [
      { text: 'じゃあまたね！' },
      { text: '話せてよかった〜！またお話ししようね！' },
      { text: 'おやすみ〜！また明日ね！', when: (d) => d.m >= 21 * 60 },
    ],
  },

  // ---- レン: ゆるくて好奇心いっぱい ----
  ren: {
    greet: [
      { text: 'ふあぁ…おはよ、{L}。まだちょっと眠いや。', when: morning },
      { text: 'おはよ。朝の空気って、なんか好きなんだよな。', when: morning },
      { text: 'やあ、{L}。ちょうど散歩してたところ。', when: day },
      { text: '{L}、どうも。なんか面白いことあった？', when: day },
      { text: 'お、{L}。まだ起きてたんだ。', when: evening },
      { text: 'こんばんは、{L}。夜の街もいいよね。', when: evening },
      { text: 'あ、{L}。えっと、こうして話すの、あんまりないよね。', when: (d) => d.rel < 40 },
      { text: '{L}といると、なんか気楽でいいや。', when: (d) => d.rel >= 70 },
    ],
    weather: [
      { text: 'いい天気だなあ。仕事サボって昼寝したくなる。', wx: ['sunny'] },
      { text: '空、真っ青だね。さっきまで雲の形を見てたんだ。', wx: ['sunny'] },
      { text: '曇ってるね。こういう日は、散歩にちょうどいいかも。', wx: ['cloudy'] },
      { text: '空が白いなあ。ひと雨きそうな匂いがする。', wx: ['cloudy'] },
      { text: '雨かあ。雨音って、聞いてると時間を忘れるよね。', wx: ['rainy'] },
      { text: '雨の日の街って、色が濃くなる気がしない？', wx: ['rainy'] },
      { text: 'あ、雨上がった。水たまり、ちょっと見に行ってこようかな。', flag: 'rainStopped', w: 3 },
      { text: '雨が上がると、空気が澄んでて気持ちいいよね。', flag: 'rainStopped', w: 3 },
      { text: 'お、降ってきた。…雨の前の匂いって、ちょっと面白いよね。', flag: 'rainStarted', w: 3 },
    ],
    hunger: [
      { text: 'お腹空いたなあ。何か変わったもの食べたい。' },
      { text: 'ぐう…やばい、思考が止まる。' },
    ],
    tired: [
      { text: 'なんか眠いなあ。ここでちょっとだけ目を閉じてもいい？' },
      { text: '今日は歩きすぎたかな。足が重い。' },
    ],
    work: [
      { text: '仕事かあ…まあ、なんとかなるでしょ。', when: (d) => d.m >= 480 && d.m < T.workEnd },
      { text: 'ちょっと息抜きしたら、ちゃんとやるよ。', when: (d) => d.m >= 480 && d.m < T.workEnd },
      { text: '今日の仕事はおしまい。さて、どこに寄り道しよう。', when: evening },
    ],
    place: [
      { text: 'このオフィスの窓からの景色、実は好きなんだ。', when: atPlace('office') },
      { text: 'ここの新作メニュー、気になってたんだよね。', when: atPlace('cafe') },
      { text: 'あの木の下、猫がよくいるんだ。見たことある？', when: atPlace('park') },
      { text: '公園って、いいよね。何もしなくていいから。', when: atPlace('park') },
      { text: '噴水の水、光の加減で色が変わるんだよ。', when: atPlace('plaza') },
    ],
    mood: [
      { text: '今日はなんか、いい感じ。理由はないけど。', when: (d) => d.mood > 65 },
      { text: 'ちょっとモヤモヤしてる。…まあ、そのうち晴れるよ。', when: (d) => d.mood < 40 },
    ],
    chitchat: [
      { text: 'そういえばさ、昨日変な雲を見たんだ。ウサギみたいなやつ。' },
      { text: 'ねえ、世界ってさ、思ってるより面白いと思わない？' },
      { text: 'この前、知らない路地に迷い込んでさ。意外と楽しかった。' },
      { text: '最近、いろんな形の石を集めてるんだ。' },
    ],
    event: [
      { text: '差し入れ、ラッキーだったなあ。', flag: 'gift' },
      { text: 'お茶のお誘い？いいね、行く行く。', flag: 'invite' },
      { text: 'いきなり降ってきたね。びっくりした。', flag: 'rainEvent', wx: ['rainy'] },
    ],
    reply: [
      { text: 'へえ〜、それは知らなかった。' },
      { text: 'ふーん、いいね、それ。' },
      { text: 'あはは、確かに。' },
      { text: 'なるほどね。面白いな。' },
    ],
    closing: [
      { text: 'じゃ、またね。' },
      { text: 'じゃあ、ぼくはもうちょっとぶらぶらしてくるよ。', when: (d) => d.m < 21 * 60 },
      { text: 'そろそろ寝ようかな。おやすみ。', when: (d) => d.m >= 21 * 60 },
    ],
  },
};

/** 直前の話題に合わせた相づち(あれば優先) */
const REACTIONS: Record<CharId, Partial<Record<Topic, Tpl[]>>> = {
  aoi: {
    weather: [{ text: '本当に。天気には気を配っておきたいですね。' }],
    hunger: [{ text: 'ちゃんと食べないと、あとに響きますよ。' }],
    tired: [{ text: '無理は禁物です。少し休んでください。' }],
    work: [{ text: 'お互い、無理のない範囲で頑張りましょう。' }],
    greet: [{ text: 'ええ、こちらこそ。' }],
    mood: [{ text: 'それはよかったです。' }],
    event: [{ text: 'ええ、ありがたいことですね。' }],
  },
  mina: {
    weather: [{ text: 'ね〜！天気で気分って変わるよね！' }],
    hunger: [{ text: 'だよね！あとでおいしいもの食べよ！' }],
    tired: [{ text: '大丈夫？甘いもの、わけてあげる！' }],
    work: [{ text: 'お互いがんばろうね！ファイト！' }],
    greet: [{ text: 'えへへ、よろしくね！' }],
    mood: [{ text: 'そっかそっか。聞かせてくれてありがと！' }],
    event: [{ text: 'ほんと、うれしいよね！' }],
  },
  ren: {
    weather: [{ text: '空ってずっと見てても飽きないよな。' }],
    hunger: [{ text: '何食べよっか。迷うのも楽しいよね。' }],
    tired: [{ text: '無理しないで、のんびりいこ。' }],
    work: [{ text: 'まあ、ぼちぼちやろうよ。' }],
    greet: [{ text: 'うん、どうも。' }],
    mood: [{ text: 'そっか。話してくれてありがと。' }],
    event: [{ text: 'いいことあると、世界が少し明るく見えるよね。' }],
  },
};

export const ALL_POOLS = POOLS;
export const ALL_REACTIONS = REACTIONS;

function partOf(m: number): DCtx['part'] {
  if (m >= 5 * 60 && m < 11 * 60) return 'morning';
  if (m >= 11 * 60 && m < 17 * 60) return 'day';
  if (m >= 17 * 60 && m < 23 * 60) return 'evening';
  return 'night';
}

/** 最近(within分以内)のユーザー介入イベントがあったか。ログの内容をそのまま見る */
function recentEvent(world: World, tag: string, within: number): boolean {
  for (let i = world.log.length - 1; i >= 0; i--) {
    const e = world.log[i];
    if (world.tick - e.tick > within) break;
    if (e.type === 'event' && e.text.startsWith(tag)) return true;
  }
  return false;
}

export function buildDCtx(world: World, speaker: CharId, listener: CharId): DCtx {
  const s = world.chars[speaker];
  const m = minuteOfDay(world.tick);
  const w = world.weather;
  const since = world.tick - w.changedAt;
  const flags = new Set<DialogueFlag>();
  if (w.prev === 'rainy' && w.current !== 'rainy' && since <= 120) flags.add('rainStopped');
  if (w.current === 'rainy' && w.prev !== 'rainy' && since <= 90) flags.add('rainStarted');
  if (recentEvent(world, '【差し入れ】', 240)) flags.add('gift');
  if (recentEvent(world, '【お誘い】', 240)) flags.add('invite');
  if (w.current === 'rainy' && recentEvent(world, '【突然の雨】', 240)) flags.add('rainEvent');
  return {
    m,
    part: partOf(m),
    weather: w.current,
    prevWeather: w.prev,
    sinceChange: since,
    hunger: s.hunger,
    fatigue: s.fatigue,
    mood: s.mood,
    rel: s.relations[listener],
    placeKind: placeAt(s.pos)?.kind ?? null,
    flags,
  };
}

/** テンプレートがいまの状況で使えるか */
export function tplUsable(t: Tpl, d: DCtx): boolean {
  if (t.wx && !t.wx.includes(d.weather)) return false;
  if (t.flag && !d.flags.has(t.flag)) return false;
  if (t.when && !t.when(d)) return false;
  return true;
}

function topicWeight(topic: Topic, speaker: CharId, d: DCtx): number {
  switch (topic) {
    case 'greet':
      return d.rel < 40 ? 1.2 : 0.7;
    case 'weather': {
      let w = 0.5;
      if (d.flags.has('rainStopped') || d.flags.has('rainStarted')) w = 2.2;
      return w;
    }
    case 'hunger':
      return 1.6 * smooth(d.hunger, 50, 85);
    case 'tired':
      return 1.4 * smooth(d.fatigue, 55, 90);
    case 'work':
      return speaker === 'aoi' ? 0.8 : 0.4;
    case 'place':
      return d.placeKind && d.placeKind !== 'home' ? 0.5 : 0;
    case 'mood':
      return Math.abs(d.mood - 52) > 14 ? 0.5 : 0;
    case 'chitchat':
      return speaker === 'ren' ? 0.8 : 0.5;
    case 'event':
      return d.flags.size > 0 ? 1.5 : 0;
    default:
      return 0;
  }
}

const OPENER_TOPICS: Topic[] = ['greet', 'weather', 'hunger', 'tired', 'work', 'place', 'mood', 'chitchat', 'event'];
const FOLLOW_TOPICS: Topic[] = OPENER_TOPICS.filter((t) => t !== 'greet');

export interface GeneratedLine {
  text: string;
  topic: Topic;
  id: string;
}

interface Cand {
  tpl: Tpl;
  topic: Topic;
  id: string;
  w: number;
}

/**
 * 会話の index 行目(0始まり、全 total 行)のセリフを作る。
 * 0行目は話題の切り出し、1行目は相づち、中間は別の話題、最後(3行以上のとき)は締め。
 */
export function generateLine(
  world: World,
  speaker: CharId,
  listener: CharId,
  index: number,
  total: number,
  prevTopic: Topic | null,
  rng: Rng,
): GeneratedLine {
  const d = buildDCtx(world, speaker, listener);
  const pool = POOLS[speaker];
  const recent = world.chars[speaker].mem.recentLines;
  const cands: Cand[] = [];

  const addTopic = (topic: Topic, weight: number, source: Tpl[] | undefined) => {
    if (!source || weight <= 0) return;
    source.forEach((tpl, i) => {
      if (!tplUsable(tpl, d)) return;
      const id = `${speaker}.${topic}.${i}`;
      const repeat = recent.includes(id) ? 0.02 : 1;
      cands.push({ tpl, topic, id, w: weight * (tpl.w ?? 1) * repeat });
    });
  };

  const isClosing = total >= 3 && index === total - 1;
  if (isClosing) {
    addTopic('closing', 1, pool.closing);
  } else if (index === 1) {
    const reacts = prevTopic ? REACTIONS[speaker][prevTopic] : undefined;
    addTopic('reply', 1, pool.reply);
    if (reacts) {
      reacts.forEach((tpl, i) => {
        const id = `${speaker}.react.${prevTopic}.${i}`;
        cands.push({ tpl, topic: 'reply', id, w: (recent.includes(id) ? 0.02 : 1) * 1.6 });
      });
    }
  } else {
    const topics = index === 0 ? OPENER_TOPICS : FOLLOW_TOPICS;
    for (const t of topics) {
      if (index > 0 && t === prevTopic) continue;
      addTopic(t, topicWeight(t, speaker, d), pool[t]);
    }
  }
  if (cands.length === 0) addTopic('chitchat', 1, pool.chitchat);
  if (cands.length === 0) addTopic('reply', 1, pool.reply);

  const chosen = pickWeighted(rng, cands, (c) => c.w);
  const text = chosen.tpl.text.replace('{L}', CALL[speaker][listener]);
  const mem = world.chars[speaker].mem;
  mem.recentLines.push(chosen.id);
  if (mem.recentLines.length > 10) mem.recentLines.shift();
  return { text, topic: chosen.topic, id: chosen.id };
}
