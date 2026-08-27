/**
 * 種目の管理。一覧の各行には到達点の推移を小さな線で添え、開いたシートは
 * 「設定」（編集できる項目）と「記録」（推移の詳細と履歴）の 2 面に分かれる。
 */

import { useEffect, useMemo, useState } from 'react';
import { mergeImpact } from '../lib/merge.ts';
import { bestSeries, byRecentUse, exerciseHistory, lastPerformed } from '../lib/query.ts';
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
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { ExerciseRecords } from './ExerciseRecords.tsx';
import { Icon } from './Icon.tsx';
import { Overlay } from './Overlay.tsx';
import { Sparkline } from './Sparkline.tsx';

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
  const { exercises, sessions, upsertExercise, removeExercise, mergeExercise } = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /*
   * まとめ先の種目 id。null は「まとめる操作を開いていない」、'' は「開いたがまだ選んでいない」。
   *
   * 主たる操作（保存・非表示）と並べず、押す前に一段挟む。取り消せない操作なので、
   * 確認では何日ぶんの記録が動くかを数で出す。
   */
  const [mergeTo, setMergeTo] = useState<string | null>(null);
  const [confirmMerge, setConfirmMerge] = useState(false);
  /*
   * シートの面。設定（編集できる項目）と記録（推移と履歴）。
   *
   * 開くたびに「設定」へ戻す。記録を見たまま別の種目を開くと、前の種目の
   * 記録面が一瞬出て、どの種目を開いたのか分からなくなるため。
   */
  const [sheetTab, setSheetTab] = useState<'settings' | 'records'>('settings');

  const openDraft = (next: Draft) => {
    setDraft(next);
    setSheetTab('settings');
  };

  useEffect(() => {
    if (!startNew) return;
    openDraft(blankDraft());
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
    closeDraft();
    setMessage(null);
  };

  /** まとめ先の候補。自分自身と、非表示の種目は出さない。 */
  const mergeTargets = useMemo(
    () => exercises.filter((e) => !e.archived && e.id !== draft?.id).sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [exercises, draft?.id],
  );

  const impact = useMemo(
    () =>
      draft?.id && mergeTo
        ? mergeImpact(sessions, exerciseId(draft.id), exerciseId(mergeTo))
        : null,
    [sessions, draft?.id, mergeTo],
  );

  const closeDraft = () => {
    setDraft(null);
    setMergeTo(null);
    setConfirmMerge(false);
  };

  const last = useMemo(() => lastPerformed(sessions), [sessions]);
  const shown = useMemo(
    () => byRecentUse(exercises.filter((e) => showArchived || !e.archived), last),
    [exercises, showArchived, last],
  );

  /*
   * 行の右に添える推移。到達点の並びと、直近が自己ベストかどうか。
   *
   * 2 日ぶん無い種目は線にならないので持たない（行には何も出ない）。
   * exerciseHistory は sortedSessions のメモ化に乗るので、種目の数だけ回しても
   * 並べ替えは 1 回で済む。
   */
  const trends = useMemo(() => {
    const map = new Map<string, { values: number[]; atBest: boolean }>();
    for (const e of exercises) {
      const series = bestSeries(e, exerciseHistory(sessions, e.id));
      if (series.length < 2) continue;
      const values = series.map((p) => p.best);
      map.set(e.id, { values, atBest: values.at(-1)! >= Math.max(...values) });
    }
    return map;
  }, [exercises, sessions]);

  return (
    <>
      <header className="view-head">
        <h1 className="view-title">種目</h1>
        <button type="button" className="ghost small with-icon" onClick={() => openDraft(blankDraft())}>
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
              {items.map((e) => {
                const trend = trends.get(e.id);
                return (
                  <li key={e.id}>
                    <button type="button" className="ex-item" onClick={() => openDraft({ ...e, id: e.id })}>
                      <span className="ex-text">
                        <span className="ex-name">
                          {e.name}
                          {e.archived ? <span className="chip subtle">非表示</span> : null}
                        </span>
                        <span className="muted">
                          {LOAD_MODES[e.loadMode].label} · {e.repMin}〜{e.repMax}レップ × {e.sets}セット
                        </span>
                      </span>
                      {/* 到達点の推移。形だけを見せる（数字は開いた先の記録の面にある） */}
                      {trend ? <Sparkline values={trend.values} atBest={trend.atBest} /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <button type="button" className="ghost wide" onClick={() => setShowArchived((v) => !v)}>
        {showArchived ? '非表示の種目を隠す' : '非表示の種目も出す'}
      </button>

      {draft ? (
        <Overlay>
          <div className="sheet-backdrop" onClick={closeDraft}>
            <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="種目の設定">
              <header className="sheet-head">
                <strong>{draft.id === null ? '新しい種目' : draft.name || '種目'}</strong>
                <button type="button" className="icon-btn" aria-label="閉じる" onClick={closeDraft}>
                  <Icon name="close" />
                </button>
              </header>

              {/*
                設定と記録の面。新しい種目にはまだ記録が無いので、面を分けずに設定だけ出す。
                一覧のスパークラインを押した先がこの「記録」——小さい線で形だけ見せて、
                数字と予想はここで読む。
              */}
              {draft.id !== null ? (
                <div className="sheet-tabs" role="tablist" aria-label="種目の面">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sheetTab === 'settings'}
                    className={`sheet-tab ${sheetTab === 'settings' ? 'is-active' : ''}`}
                    onClick={() => setSheetTab('settings')}
                  >
                    設定
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sheetTab === 'records'}
                    className={`sheet-tab ${sheetTab === 'records' ? 'is-active' : ''}`}
                    onClick={() => setSheetTab('records')}
                  >
                    記録
                  </button>
                </div>
              ) : null}

              {sheetTab === 'records' && draft.id !== null ? (
                <div className="sheet-body">
                  {(() => {
                    /* 記録は保存済みの実体で引く。編集途中の名前や設定は記録に効かない */
                    const saved = exercises.find((e) => e.id === draft.id);
                    return saved ? <ExerciseRecords exercise={saved} /> : null;
                  })()}
                </div>
              ) : (
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
                {/*
                  記録を別の種目にまとめる。

                  自分で作った種目とプリセットが同じものを指しているとき
                  （あとからプリセットが増えた場合など）に、記録を捨てずに片方へ寄せる。
                  保存・非表示と並べず、文字だけの静かな操作にして一段挟む。
                */}
                {draft.id !== null && mergeTargets.length > 0 ? (
                  mergeTo === null ? (
                    <button type="button" className="quiet-action" onClick={() => setMergeTo('')}>
                      記録を別の種目にまとめる
                    </button>
                  ) : (
                    <div className="merge">
                      <label>
                        <span>まとめ先</span>
                        <select value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}>
                          <option value="">選ぶ</option>
                          {/*
                            負荷のかけ方を名前に添える。この操作が要る場面は、たいてい
                            同じ名前の種目が 2 つある場面（自分で作った側とプリセット）なので、
                            名前だけでは選び分けられない。
                          */}
                          {mergeTargets.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}（{LOAD_MODES[e.loadMode].label}）
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="footnote">
                        この種目の記録がまとめ先に移り、この種目は非表示になる。設定（名前・レップの目安・
                        コツ）は移らないので、残したいものはまとめ先の側で直す。
                      </p>
                      <div className="btn-row">
                        <button type="button" className="ghost" onClick={() => setMergeTo(null)}>
                          やめる
                        </button>
                        <button
                          type="button"
                          className="ghost danger"
                          disabled={mergeTo === '' || impact === null || impact.days === 0}
                          onClick={() => setConfirmMerge(true)}
                        >
                          まとめる
                        </button>
                      </div>
                      {impact && mergeTo !== '' && impact.days === 0 ? (
                        <p className="footnote">この種目にはまだ移す記録が無い。そのまま非表示にすれば済む。</p>
                      ) : null}
                    </div>
                  )
                ) : null}

                {message ? <p className="gate-error">{message}</p> : null}
              </div>
              )}

              {sheetTab === 'records' && draft.id !== null ? null : (
              <div className="sheet-actions">
                {draft.id !== null ? (
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => {
                      removeExercise(exerciseId(draft.id!));
                      closeDraft();
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
              )}
            </div>
          </div>
        </Overlay>
      ) : null}

      {/*
        取り消せない操作なので、押す前に何が動くかを数で出す
        （「よろしいですか」ではなく「12 日ぶん・36 セットが移る」）。
      */}
      {confirmMerge && draft?.id && mergeTo && impact ? (
        <ConfirmDialog
          title={`${draft.name || 'この種目'}の記録を${
            mergeTargets.find((e) => e.id === mergeTo)?.name ?? ''
          }にまとめる`}
          detail={`${impact.days} 日ぶん・${impact.sets} セットの記録が移る。${
            impact.collisions > 0 ? `うち ${impact.collisions} 日は同じ日に両方あるので、セットが続けて並ぶ。` : ''
          }この種目は非表示になる（一覧の下から戻せる）。`}
          confirmLabel="まとめる"
          onConfirm={() => {
            const name = mergeTargets.find((e) => e.id === mergeTo)?.name ?? '';
            const moved = impact.days;
            mergeExercise(exerciseId(draft.id!), exerciseId(mergeTo))
              .then(() => setMessage(`${moved} 日ぶんの記録を${name}にまとめた`))
              .catch(() => undefined);
            closeDraft();
          }}
          onCancel={() => setConfirmMerge(false)}
        />
      ) : null}

      {message && !draft ? <p className="hint">{message}</p> : null}
    </>
  );
}
