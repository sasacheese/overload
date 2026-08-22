/**
 * ドメインの型。ID は素の string と混ざらないようにブランドを付ける。
 * 部位・筋肉・負荷のかけ方は、それぞれ 1 箇所のレジストリから型を導出する。
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** 種目の識別子。表示名は変わりうるので、名前ではなくこれで参照する。 */
export type ExerciseId = Brand<string, 'ExerciseId'>;
/** ローカルタイムの 'YYYY-MM-DD'。UTC 変換を挟むと日付が前後するので文字列で持つ。 */
export type IsoDate = Brand<string, 'IsoDate'>;

export function exerciseId(raw: string): ExerciseId {
  return raw as ExerciseId;
}

/** 'YYYY-MM-DD' の形だけを検査する。存在しない日付（2 月 31 日）は通る。 */
export function isoDate(raw: string): IsoDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`日付の形式が不正: ${raw}`);
  return raw as IsoDate;
}

/** 種目のまとまり。画面の並びと絞り込みに使う粒度。 */
export const MUSCLE_GROUPS = {
  chest: { label: '胸', short: '胸' },
  back: { label: '背中', short: '背' },
  shoulders: { label: '肩', short: '肩' },
  arms: { label: '腕', short: '腕' },
  legs: { label: '脚', short: '脚' },
  core: { label: '体幹', short: '体' },
} as const;

export type MuscleGroup = keyof typeof MUSCLE_GROUPS;

export const MUSCLE_GROUP_KEYS = Object.keys(MUSCLE_GROUPS) as readonly MuscleGroup[];

export function isMuscleGroup(raw: unknown): raw is MuscleGroup {
  return typeof raw === 'string' && raw in MUSCLE_GROUPS;
}

/**
 * 効く筋肉。グループより細かい単位で、体の図の塗り分けに対応する。
 * ここの key が BodyMap の path の id と 1 対 1 になっている。
 */
export const MUSCLES = {
  chest: '大胸筋',
  frontDelt: '三角筋・前部',
  sideDelt: '三角筋・中部',
  rearDelt: '三角筋・後部',
  lats: '広背筋',
  traps: '僧帽筋',
  midBack: '菱形筋・中背部',
  biceps: '上腕二頭筋',
  triceps: '上腕三頭筋',
  forearm: '前腕',
  abs: '腹直筋',
  obliques: '腹斜筋',
  lowerBack: '脊柱起立筋',
  glutes: '大臀筋',
  quads: '大腿四頭筋',
  hams: 'ハムストリングス',
  calves: '下腿三頭筋',
} as const;

export type Muscle = keyof typeof MUSCLES;

/**
 * 負荷のかけ方。入力した数字の意味と、進める向きがこれで変わる。
 *
 * assist（アシストマシン）は数字を**下げる**ほど負荷が上がる。
 * 実際に持ち上げているのは「体重 − アシスト重量」なので、集計も進め方も
 * その実効負荷で行う。ここを重量と同じ扱いにすると、進歩と後退が逆に出る。
 */
export const LOAD_MODES = {
  weight: { label: '重量', unit: 'kg', hint: '持ち上げる重量' },
  bodyweight: { label: '自重', unit: 'kg', hint: '重さを設定しない種目。加重した日だけ入力する' },
  assist: { label: 'アシスト', unit: 'kg', hint: 'マシンに設定する補助重量。下げるほど負荷が上がる' },
} as const;

export type LoadMode = keyof typeof LOAD_MODES;

export const LOAD_MODE_KEYS = Object.keys(LOAD_MODES) as readonly LoadMode[];

export function isLoadMode(raw: unknown): raw is LoadMode {
  return typeof raw === 'string' && raw in LOAD_MODES;
}

/** 種目の説明。プリセットが持つ読み物で、利用者が書き換えるものではない。 */
export type Guide = {
  /** やり方。思い出せる程度の短さに留める。 */
  howTo: string;
  /** 効く筋肉。先頭が主働筋。 */
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  /** そこに効かせるために意識すること。 */
  cues: readonly string[];
};

export type Exercise = {
  id: ExerciseId;
  name: string;
  group: MuscleGroup;
  loadMode: LoadMode;
  /**
   * 機材の設定・自分なりのコツ。日付に依らず、その種目をやるときは常に出す。
   * 一般論の cues と違い、こちらは自分の体とジムに固有のこと。
   */
  tips: string;
  /** 重量を動かすときの最小刻み（kg）。プレートやマシンの都合で種目ごとに違う。 */
  increment: number;
  /** ダブルプログレッションのレップ範囲。下限に落として負荷を上げ、上限まで伸ばす。 */
  repMin: number;
  repMax: number;
  /** 標準セット数。前回の記録が無いときの入力欄の数になる。 */
  sets: number;
  /** セット間の目標休憩（秒）。タイマーの目安線に使う。 */
  restSec: number;
  archived: boolean;
  /** 端末間の同期で新しい方を採るために使う。ローカルの編集時刻。 */
  updatedAt: number;
};

export type SetRecord = {
  /** 入力した数字。意味は種目の loadMode で決まる（重量 / 加重 / アシスト量）。 */
  weight: number;
  reps: number;
  /** 実施済みか。未チェックの行は記録にも集計にも入れない。 */
  done: boolean;
  /** そのセットだけのメモ。「3 レップ目で右肩がつまった」のような単発の気づき。 */
  note: string;
};

export type SessionEntry = {
  exerciseId: ExerciseId;
  sets: SetRecord[];
  note: string;
};

export type Session = {
  date: IsoDate;
  entries: SessionEntry[];
  note: string;
  /**
   * その日の体重（kg）。0 は未記録。
   *
   * アシスト種目の実効負荷（体重 − アシスト量）に必要なので、設定に 1 つ持つのではなく
   * セッションに持つ。過去の記録を後から計算し直しても当時の体重で出る。
   */
  bodyWeight: number;
  /**
   * その日を「終えた」と押した時刻（epoch ms）。0 は押していない。
   *
   * 記録そのものには一切効かない——集計も祝福もこの値を見ない。効くのは画面だけで、
   * 締めの画面をもう一度開けることと、終えたあとに終わりのボタンを出さないことに使う。
   * 真偽値ではなく時刻にしてあるのは、同期の突き合わせで「あとから終えた方」を
   * 残せるようにするため（updatedAt と同じ理由）。
   */
  finishedAt: number;
  updatedAt: number;
};

export function emptySession(date: IsoDate): Session {
  return { date, entries: [], note: '', bodyWeight: 0, finishedAt: 0, updatedAt: 0 };
}

/** 実施済みのセットだけ。集計はすべてこれを通す。 */
export function doneSets(entry: SessionEntry): SetRecord[] {
  return entry.sets.filter((s) => s.done && s.reps > 0);
}

/**
 * トレーニングの記録があるか。カレンダーに「やった日」として出すかの判定。
 *
 * 体重は含めない。体重だけ付けた日（休養日）をやった日として塗ると、
 * 毎日体重を入れるほどカレンダーが埋まって、実際に動いた日が分からなくなる。
 */
export function hasRecord(session: Session): boolean {
  return session.entries.some((e) => doneSets(e).length > 0) || session.note.trim() !== '';
}

/**
 * 保存する価値があるか。`hasRecord` とは別の判定。
 *
 * こちらは**体重を含める**。トレーニングをしない日に体重だけ付ける使い方が
 * 前提なので、体重しか無い日を保存しないと、入力した数字がそのまま消える。
 * 種目が空でも行が残っていれば保存するのは、✓ を付ける前に画面を閉じても
 * 入力途中が消えないようにするため。
 */
export function worthStoring(session: Session): boolean {
  return (
    session.entries.length > 0 ||
    session.note.trim() !== '' ||
    session.bodyWeight > 0 ||
    session.finishedAt > 0
  );
}
