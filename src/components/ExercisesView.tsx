/**
 * 種目の管理。刻み・レップ範囲・セット数は「目標」の計算に直接効くので、
 * ここを触ると次回の目標が変わることが分かる文言にしてある。
 */

import { useEffect, useMemo, useState } from 'react';
import { byRecentUse, lastPerformed } from '../lib/query.ts';
import {
  LOAD_MODES,
  LOAD_MODE_KEYS,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_KEYS,
  exerciseId,
  isLoadMode,
  isMuscleGroup,
  type Exercise,
} from '../lib/types.ts';
import { useStore } from '../store.tsx';
import { Icon } from './Icon.tsx';

type Draft = Omit<Exercise, 'id'> & { id: string | null };

function blankDraft(): Draft {
  return {
    id: null,
    name: '',
    group: 'chest',
    loadMode: 'weight',
    tips: '',
    increment: 2.5,
    repMin: 8,
    repMax: 12,
    sets: 3,
    restSec: 120,
    archived: false,
    updatedAt: 0,
  };
}

type Props = {
  startNew: boolean;
  onStartNewHandled: () => void;
};

export function ExercisesView({ startNew, onStartNewHandled }: Props) {
  const { exercises, sessions, upsertExercise, removeExercise } = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!startNew) return;
    setDraft(blankDraft());
    onStartNewHandled();
  }, [startNew, onStartNewHandled]);

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (name === '') return setMessage('種目名を入れる');
    if (draft.repMin > draft.repMax) return setMessage('レップの目安の下限が上限を超えている');
    if (draft.increment <= 0) return setMessage('重量の刻みは 0 より大きくする');
    upsertExercise({
      ...draft,
      name,
      id: draft.id === null ? exerciseId(`custom-${crypto.randomUUID()}`) : exerciseId(draft.id),
    });
    setDraft(null);
    setMessage(null);
  };

  const last = useMemo(() => lastPerformed(sessions), [sessions]);
  const shown = useMemo(
    () => byRecentUse(exercises.filter((e) => showArchived || !e.archived), last),
    [exercises, showArchived, last],
  );

  return (
    <>
      <header className="view-head">
        <h1 className="view-title">種目</h1>
        <button type="button" className="ghost small with-icon" onClick={() => setDraft(blankDraft())}>
          <Icon name="plus" />
          追加
        </button>
      </header>

      {MUSCLE_GROUP_KEYS.map((key) => {
        const items = shown.filter((e) => e.group === key);
        if (items.length === 0) return null;
        return (
          <div key={key} className="ex-group">
            {/* 記号は名前が出ない場所（種目カードの見出し）専用。ここは文字があるので置かない */}
            <h2 className="section-title">{MUSCLE_GROUPS[key].label}</h2>
            <ul className="ex-list">
              {items.map((e) => (
                <li key={e.id}>
                  <button type="button" className="ex-item" onClick={() => setDraft({ ...e, id: e.id })}>
                    <span className="ex-name">
                      {e.name}
                      {e.archived ? <span className="chip subtle">非表示</span> : null}
                    </span>
                    <span className="muted">
                      {LOAD_MODES[e.loadMode].label} · {e.repMin}〜{e.repMax}レップ × {e.sets}セット
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <button type="button" className="ghost wide" onClick={() => setShowArchived((v) => !v)}>
        {showArchived ? '非表示の種目を隠す' : '非表示の種目も出す'}
      </button>

      {draft ? (
        <div className="sheet-backdrop" onClick={() => setDraft(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="種目の設定">
            <header className="sheet-head">
              <strong>{draft.id === null ? '新しい種目' : draft.name || '種目'}</strong>
              <button type="button" className="icon-btn" aria-label="閉じる" onClick={() => setDraft(null)}>
                <Icon name="close" />
              </button>
            </header>
            <div className="sheet-body form">
              <label>
                <span>種目名</span>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label>
                <span>部位</span>
                <select
                  value={draft.group}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isMuscleGroup(v)) setDraft({ ...draft, group: v });
                  }}
                >
                  {MUSCLE_GROUP_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {MUSCLE_GROUPS[key].label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>負荷のかけ方</span>
                <select
                  value={draft.loadMode}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isLoadMode(v)) setDraft({ ...draft, loadMode: v });
                  }}
                >
                  {LOAD_MODE_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {LOAD_MODES[key].label} — {LOAD_MODES[key].hint}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>重量の刻み（kg）</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  value={draft.increment}
                  onChange={(e) => setDraft({ ...draft, increment: Number(e.target.value) })}
                />
              </label>
              <div className="pair">
                <label>
                  <span>レップの目安 下限</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={draft.repMin}
                    onChange={(e) => setDraft({ ...draft, repMin: Number(e.target.value) })}
                  />
                </label>
                <label>
                  <span>レップの目安 上限</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={draft.repMax}
                    onChange={(e) => setDraft({ ...draft, repMax: Number(e.target.value) })}
                  />
                </label>
              </div>
              <div className="pair">
                <label>
                  <span>初回のセット数</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={draft.sets}
                    onChange={(e) => setDraft({ ...draft, sets: Number(e.target.value) })}
                  />
                </label>
                <label>
                  <span>休憩（秒）</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="15"
                    value={draft.restSec}
                    onChange={(e) => setDraft({ ...draft, restSec: Number(e.target.value) })}
                  />
                </label>
              </div>
              <p className="hint">
                {`初めてこの種目をやる日は ${draft.repMin} レップ × ${draft.sets} セットの空欄が並ぶ。2 回目以降は前回と同じ数字が入るので、この目安は使わない。`}
                {draft.loadMode === 'assist' ? ' 補助は下げるほど負荷が上がる。' : ''}
                {` 重量の刻みは入力欄の増減には使わない（マシンごとに違うため）。Claude に相談するときの参考値として渡している。`}
              </p>
              {message ? <p className="gate-error">{message}</p> : null}
            </div>
            <div className="sheet-actions">
              {draft.id !== null ? (
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => {
                    removeExercise(exerciseId(draft.id!));
                    setDraft(null);
                    setMessage('非表示にした（記録は残る。一覧の下から戻せる）');
                  }}
                >
                  非表示にする
                </button>
              ) : null}
              <button type="button" className="primary" onClick={save}>
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {message && !draft ? <p className="hint">{message}</p> : null}
    </>
  );
}
