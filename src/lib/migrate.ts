/**
 * 保存済みのデータを現在の形に揃える。
 *
 * IndexedDB には昔の版が書いたオブジェクトがそのまま残る。読むたびに
 * `set.note ?? ''` のような防御を各所に散らすと必ずどこかで漏れるので、
 * 入口をここ 1 箇所にして、以降のコードは全項目が揃っている前提で書く。
 * バックアップの読み込みも同じ関数を通す。
 */

import { presetExercises } from './presets.ts';
import {
  isLoadMode,
  isMuscleGroup,
  type Exercise,
  type ExerciseId,
  type IsoDate,
  type LoadMode,
  type Session,
  type SessionEntry,
  type SetRecord,
} from './types.ts';

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function normalizeSet(raw: unknown): SetRecord {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    weight: num(o['weight'], 0),
    reps: num(o['reps'], 0),
    done: o['done'] === true,
    note: str(o['note']),
  };
}

export function normalizeEntry(raw: unknown): SessionEntry {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    exerciseId: str(o['exerciseId']) as ExerciseId,
    sets: Array.isArray(o['sets']) ? o['sets'].map(normalizeSet) : [],
    note: str(o['note']),
    startedAt: num(o['startedAt'], 0),
  };
}

export function normalizeSession(raw: unknown): Session {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    date: str(o['date']) as IsoDate,
    entries: Array.isArray(o['entries']) ? o['entries'].map(normalizeEntry) : [],
    note: str(o['note']),
    bodyWeight: num(o['bodyWeight'], 0),
    bodyWeightAt: num(o['bodyWeightAt'], 0),
    finishedAt: num(o['finishedAt'], 0),
    updatedAt: num(o['updatedAt'], 0),
  };
}

/**
 * プリセットの引き当て。
 *
 * normalizeExercise は保存済みの全種目とリモートの全 doc に対して呼ばれる。
 * その中で presetExercises() を呼ぶと、1 件ごとに 40 件ぶんの配列と説明文を
 * 作り直すことになるので、一度だけ作って使い回す。
 */
let presetsById: Map<string, Exercise> | null = null;

function preset(id: string): Exercise | undefined {
  presetsById ??= new Map(presetExercises().map((e) => [e.id as string, e]));
  return presetsById.get(id);
}

/** 種目の初期値はプリセットから借りる。プリセットに無い種目は無害な既定値。 */
const FALLBACK = {
  increment: 2.5,
  repMin: 8,
  repMax: 12,
  sets: 3,
  restSec: 90,
} as const;

/**
 * 負荷のかけ方。v0.2 までは真偽値の `bodyweight` だったので、それも読む。
 * アシストマシンを足したことで 2 値では足りなくなった。
 */
function normalizeLoadMode(raw: Record<string, unknown>, preset: Exercise | undefined): LoadMode {
  const mode = raw['loadMode'];
  if (isLoadMode(mode)) return mode;
  if (raw['bodyweight'] === true) return 'bodyweight';
  return preset?.loadMode ?? 'weight';
}

export function normalizeExercise(raw: unknown): Exercise {
  const o = (raw ?? {}) as Record<string, unknown>;
  const id = str(o['id']) as ExerciseId;
  const base = preset(id);
  const group = o['group'];
  return {
    id,
    name: str(o['name']) || base?.name || id,
    group: isMuscleGroup(group) ? group : (base?.group ?? 'chest'),
    loadMode: normalizeLoadMode(o, base),
    tips: str(o['tips']),
    increment: num(o['increment'], base?.increment ?? FALLBACK.increment),
    repMin: num(o['repMin'], base?.repMin ?? FALLBACK.repMin),
    repMax: num(o['repMax'], base?.repMax ?? FALLBACK.repMax),
    sets: num(o['sets'], base?.sets ?? FALLBACK.sets),
    restSec: num(o['restSec'], base?.restSec ?? FALLBACK.restSec),
    archived: o['archived'] === true,
    updatedAt: num(o['updatedAt'], 0),
  };
}
