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
  };
}

export function normalizeSession(raw: unknown): Session {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    date: str(o['date']) as IsoDate,
    entries: Array.isArray(o['entries']) ? o['entries'].map(normalizeEntry) : [],
    note: str(o['note']),
    bodyWeight: num(o['bodyWeight'], 0),
    updatedAt: num(o['updatedAt'], 0),
  };
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
  const preset = presetExercises().find((e) => e.id === id);
  const group = o['group'];
  return {
    id,
    name: str(o['name']) || preset?.name || id,
    group: isMuscleGroup(group) ? group : (preset?.group ?? 'chest'),
    loadMode: normalizeLoadMode(o, preset),
    tips: str(o['tips']),
    increment: num(o['increment'], preset?.increment ?? FALLBACK.increment),
    repMin: num(o['repMin'], preset?.repMin ?? FALLBACK.repMin),
    repMax: num(o['repMax'], preset?.repMax ?? FALLBACK.repMax),
    sets: num(o['sets'], preset?.sets ?? FALLBACK.sets),
    restSec: num(o['restSec'], preset?.restSec ?? FALLBACK.restSec),
    archived: o['archived'] === true,
    updatedAt: num(o['updatedAt'], 0),
  };
}
