/**
 * 種目 1 つぶんのカード。
 *
 * 目標は出さない。以前は前回から計算した「今日の目標」を入力欄に流し込んでいたが、
 * 達成できなかった日に必ず未達が表示される作りになるため外した。いまは前回と同じ
 * 数字が入っているだけで、上げても下げてもただの記録として残る。
 * 前進があったときにだけ祝う（判定は lib/records.ts、表示は Celebration）。
 *
 * 残している仕掛けは 4 つ。
 *  1. 入力欄に前回の数字が入っている。ゼロから打ち込ませない
 *  2. 未入力のセット行の下に前回の同セットを薄く出す。遡らせない
 *  3. ✓ を付けると前回との差だけが出る。伸びたときだけ色が付く
 *  4. 機材の設定とコツを常に上に出す。毎回思い出す手間を消す
 */

import { useEffect, useMemo, useState } from 'react';
import { relativeLabel } from '../lib/calendar.ts';
import { guideFor } from '../lib/presets.ts';
import {
  compareToPrev,
  format,
  formatEstimate,
  loadOf,
  metrics,
  sessionsSinceBest,
} from '../lib/progression.ts';
import { bestSeries, exerciseHistory, previousEntry } from '../lib/query.ts';
import {
  LOAD_MODES,
  MUSCLES,
  MUSCLE_GROUPS,
  doneSets,
  type Exercise,
  type IsoDate,
  type SessionEntry,
  type SetRecord,
} from '../lib/types.ts';
import { useStore } from '../store.tsx';
import { BodyMap } from './BodyMap.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { Sparkline } from './Sparkline.tsx';
import { Stepper } from './Stepper.tsx';

type Props = {
  exercise: Exercise;
  date: IsoDate;
  today: IsoDate;
  entry: SessionEntry;
  /** その日の体重。アシスト種目の実効負荷に使う。0 は未記録。 */
  bodyWeight: number;
  onChange: (entry: SessionEntry) => void;
  onRemove: () => void;
  onSetCompleted: (exercise: Exercise, entry: SessionEntry, index: number) => void;
  onSetUndone: (exercise: Exercise, index: number) => void;
};

/** 履歴に出す過去セッション数。これ以上並べても遡って読まない。 */
const HISTORY_ROWS = 5;

/** 中身のあるメモの行番号。開いた状態の初期値に使う。 */
function notedRows(sets: readonly SetRecord[]): Set<number> {
  return new Set(sets.flatMap((set, i) => (set.note.trim() === '' ? [] : [i])));
}

type Section = 'guide' | 'history' | 'trend' | 'note';

/**
 * 開閉する 1 節。見出し自体がボタンなので、開いたあと同じ場所を押せば閉じられる。
 *
 * @param count 中身の件数。開く前に量が分かると、開くかどうかを決められる
 * @param marked 中身があることだけを示す印（メモのように件数が意味を持たない節で使う）
 */
function Disclosure({
  label,
  icon,
  count,
  marked,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon: IconName;
  count?: number;
  marked?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`disclosure ${open ? 'is-open' : ''}`}>
      <button type="button" className="disclosure-head" aria-expanded={open} onClick={onToggle}>
        <Icon name={icon} className="disclosure-icon" />
        <span className="disclosure-label">{label}</span>
        {count !== undefined ? <span className="disclosure-count">{count}</span> : null}
        {marked ? <span className="disclosure-mark" aria-hidden="true" /> : null}
        <Icon name="down" className="disclosure-chevron" />
      </button>
      {open ? <div className="disclosure-body">{children}</div> : null}
    </div>
  );
}

function setsLabel(ex: Exercise, sets: readonly SetRecord[]): string {
  if (sets.length === 0) return '記録なし';
  const reps = sets.map((s) => s.reps).join('・');
  if (ex.loadMode === 'bodyweight' && sets.every((s) => s.weight === 0)) return `${reps} レップ`;
  const prefix = ex.loadMode === 'assist' ? '補助 ' : '';
  const weights = [...new Set(sets.map((s) => s.weight))];
  // 重量が揃っている日は「60kg × 8・8・8」、混ざっている日はセットごとに出す
  return weights.length === 1
    ? `${prefix}${format(weights[0]!)}kg × ${reps}`
    : sets.map((s) => `${prefix}${format(s.weight)}×${s.reps}`).join(' / ');
}

export function ExerciseCard({
  exercise,
  date,
  today,
  entry,
  bodyWeight,
  onChange,
  onRemove,
  onSetCompleted,
  onSetUndone,
}: Props) {
  const { sessions, upsertExercise } = useStore();
  const [editingTips, setEditingTips] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  /*
   * どのメモ欄を開いているか。
   *
   * 「中身があれば開く」を毎回の描画で判定していたときは、文字が入っている行の
   * ボタンを押しても閉じられなかった（判定が状態を上書きしていた）。
   * 初期値としてだけ中身を見て、以降はボタンの操作を正とする。
   */
  const [openNotes, setOpenNotes] = useState<ReadonlySet<number>>(() => notedRows(entry.sets));
  /*
   * 節ごとに開閉する。1 つのまとまりにしていたときは、開いたあと閉じる場所が
   * カードの見出ししか無く（そこも長い節を開くと画面外に出る）、閉じられなかった。
   * メモは中身があるときだけ最初から開いた状態にする。
   */
  const [openSections, setOpenSections] = useState<ReadonlySet<Section>>(() =>
    entry.note.trim() === '' ? new Set() : new Set<Section>(['note']),
  );

  /*
   * 日付が変わると同じカードに別の日の記録が入るので、開閉の状態を引き継がない。
   *
   * 依存を date だけにしているのは意図的。entry を入れると、メモに 1 文字打つたびに
   * 開閉が組み直されて操作を奪ってしまう。
   */
  useEffect(() => {
    setOpenNotes(notedRows(entry.sets));
    setOpenSections(entry.note.trim() === '' ? new Set() : new Set<Section>(['note']));
    setEditingTips(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const toggleSection = (section: Section) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });

  const prev = useMemo(() => previousEntry(sessions, exercise.id, date), [sessions, exercise.id, date]);
  const performance = useMemo(() => ({ entry, bodyWeight }), [entry, bodyWeight]);

  const history = useMemo(() => exerciseHistory(sessions, exercise.id), [sessions, exercise.id]);
  const past = useMemo(() => history.filter((h) => h.date < date).slice(0, HISTORY_ROWS), [history, date]);
  const series = useMemo(() => bestSeries(exercise, history), [exercise, history]);
  const bestsNewestFirst = useMemo(() => [...series].reverse().map((s) => s.best), [series]);

  const todayMetrics = metrics(exercise, performance);
  const stale = sessionsSinceBest(bestsNewestFirst);
  const group = MUSCLE_GROUPS[exercise.group];
  const guide = guideFor(exercise.id);
  const isAssist = exercise.loadMode === 'assist';
  const prevSets = prev ? doneSets(prev.entry) : [];

  const updateSets = (sets: SetRecord[]) => onChange({ ...entry, sets });

  const patchSet = (index: number, patch: Partial<SetRecord>) => {
    updateSets(entry.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const toggleDone = (index: number) => {
    const set = entry.sets[index];
    if (!set) return;
    const nextEntry: SessionEntry = {
      ...entry,
      sets: entry.sets.map((s, i) => (i === index ? { ...s, done: !s.done } : s)),
    };
    onChange(nextEntry);
    if (set.done) onSetUndone(exercise, index);
    else onSetCompleted(exercise, nextEntry, index);
  };

  const toggleNote = (index: number) => {
    setOpenNotes((prevOpen) => {
      const next = new Set(prevOpen);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const addSet = () => {
    const last = entry.sets.at(-1);
    updateSets([
      ...entry.sets,
      { weight: last?.weight ?? 0, reps: last?.reps ?? exercise.repMin, done: false, note: '' },
    ]);
  };

  return (
    <section className="card">
      <header className="card-head">
        <span className="card-title">
          <span className="glyph" aria-hidden="true">
            {group.short}
          </span>
          <span className="card-name">{exercise.name}</span>
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label={`${exercise.name}を今日から外す`}
          onClick={() => setConfirmRemove(true)}
        >
          <Icon name="close" />
        </button>
      </header>

      {/* 機材の設定とコツ。セットに入る前に目に入る位置に置く */}
      {editingTips ? (
        <label className="note tips-edit">
          <span className="muted">コツ・機材の設定（この種目をやるときは常に出る）</span>
          <textarea
            rows={3}
            autoFocus
            value={exercise.tips}
            placeholder="ラックは8段目 / シートは4段目 / 肩を落としてから引く"
            onChange={(e) => upsertExercise({ ...exercise, tips: e.target.value })}
          />
          <button type="button" className="ghost small" onClick={() => setEditingTips(false)}>
            閉じる
          </button>
        </label>
      ) : exercise.tips.trim() !== '' ? (
        <button type="button" className="tips" onClick={() => setEditingTips(true)}>
          {exercise.tips}
        </button>
      ) : (
        <button type="button" className="tips-empty with-icon" onClick={() => setEditingTips(true)}>
          <Icon name="plus" />
          コツ・機材の設定
        </button>
      )}

      {prev ? (
        <p className="prev-line with-icon">
          <Icon name="history" />
          {relativeLabel(prev.date, today)} · {setsLabel(exercise, prevSets)}
        </p>
      ) : null}

      <ol className="sets">
        {entry.sets.map((set, i) => {
          const delta = set.done ? compareToPrev(exercise, set, prevSets[i]) : null;
          const noteOpen = openNotes.has(i);
          const prevSet = prevSets[i];
          const effective = isAssist ? loadOf(exercise, set, bodyWeight) : 0;
          return (
            <li key={i} className={`set-item ${set.done ? 'is-done' : ''}`}>
              <div className="set-main">
                <span className="set-index">{i + 1}</span>
                <Stepper
                  value={set.weight}
                  step={exercise.increment}
                  min={0}
                  label={`${i + 1}セット目の${LOAD_MODES[exercise.loadMode].label}`}
                  suffix="kg"
                  zeroLabel={exercise.loadMode === 'bodyweight' ? '自重' : undefined}
                  /* マシンごとに刻みが違うので、決まった量ずつ動かすボタンは役に立たない */
                  showSteps={false}
                  onChange={(weight) => patchSet(i, { weight })}
                />
                <Stepper
                  value={set.reps}
                  step={1}
                  min={0}
                  label={`${i + 1}セット目のレップ`}
                  suffix="回"
                  onChange={(reps) => patchSet(i, { reps })}
                />
                <button
                  type="button"
                  className={`check ${set.done ? 'is-on' : ''}`}
                  aria-label={`${i + 1}セット目を${set.done ? '未実施に戻す' : '実施済みにする'}`}
                  aria-pressed={set.done}
                  onClick={() => toggleDone(i)}
                >
                  <Icon name="check" />
                </button>
              </div>

              {isAssist && bodyWeight > 0 ? (
                <p className="effective">
                  → 実際に引く重さ <strong>{format(effective)}kg</strong>
                </p>
              ) : null}

              <div className="set-extra">
                {delta && delta.label !== '' ? (
                  <span className={`delta delta-${delta.kind}`}>{delta.label}</span>
                ) : !set.done && prevSet ? (
                  <span className="delta ghost-prev with-icon">
                    <Icon name="history" />
                    {setsLabel(exercise, [prevSet])}
                  </span>
                ) : (
                  <span className="delta" />
                )}
                <button
                  type="button"
                  className={`icon-chip ${set.note.trim() !== '' ? 'is-on' : ''}`}
                  aria-label={`${i + 1}セット目のメモ`}
                  aria-expanded={noteOpen}
                  onClick={() => toggleNote(i)}
                >
                  <Icon name="note" />
                </button>
              </div>

              {noteOpen ? (
                <input
                  className="set-note"
                  value={set.note}
                  placeholder="気づいたこと"
                  onChange={(e) => patchSet(i, { note: e.target.value })}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="set-actions">
        <button type="button" className="ghost" aria-label="セットを増やす" onClick={addSet}>
          <Icon name="plus" />
        </button>
        {entry.sets.length > 0 ? (
          <button
            type="button"
            className="ghost"
            aria-label="セットを減らす"
            onClick={() => updateSets(entry.sets.slice(0, -1))}
          >
            <Icon name="minus" />
          </button>
        ) : null}
      </div>

      {/* 停滞は開かなくても見えるところに出す。開くまで気づけないと意味がない */}
      {stale >= 3 ? (
        <p className="hint">
          自己ベストから {stale} セッション。負荷を 10% ほど落として組み直すか、いつもと違う角度・
          グリップに変えると動き出すことがある。
        </p>
      ) : null}

      <div className="sections">
        {guide ? (
          <Disclosure
            label="やり方と効く場所"
            icon="target"
            open={openSections.has('guide')}
            onToggle={() => toggleSection('guide')}
          >
            <p className="guide-how">{guide.howTo}</p>
            <div className="guide-body">
              <BodyMap primary={guide.primary} secondary={guide.secondary} />
              <div className="muscle-list">
                {guide.primary.map((m) => (
                  <span className="muscle-row" key={m}>
                    <span className="muscle-swatch" aria-hidden="true" />
                    {MUSCLES[m]}
                  </span>
                ))}
                {guide.secondary.map((m) => (
                  <span className="muscle-row" key={m}>
                    <span className="muscle-swatch is-secondary" aria-hidden="true" />
                    <span className="muted">{MUSCLES[m]}</span>
                  </span>
                ))}
              </div>
            </div>
            {guide.cues.length > 0 ? (
              <ul className="cues">
                {guide.cues.map((cue) => (
                  <li key={cue}>
                    <span>{cue}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Disclosure>
        ) : null}

        {past.length > 0 ? (
          <Disclosure
            label="これまでの記録"
            icon="history"
            count={past.length}
            open={openSections.has('history')}
            onToggle={() => toggleSection('history')}
          >
            <ul className="past-list">
              {past.map((h) => (
                <li key={h.date}>
                  <span className="past-date">
                    {h.date.slice(5).replace('-', '/')}
                    <span className="muted"> {relativeLabel(h.date, today)}</span>
                  </span>
                  <span className="past-sets">{setsLabel(exercise, doneSets(h.entry))}</span>
                  {h.entry.note.trim() !== '' ? <span className="past-note">{h.entry.note}</span> : null}
                  {doneSets(h.entry)
                    .map((s, i) => (s.note.trim() !== '' ? `${i + 1}セット目: ${s.note}` : null))
                    .filter((v): v is string => v !== null)
                    .map((line) => (
                      <span key={line} className="past-note">
                        {line}
                      </span>
                    ))}
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}

        {series.length >= 2 ? (
          <Disclosure
            label={todayMetrics.byLoad ? '推定 1RM の推移' : '最高レップの推移'}
            icon="trend"
            open={openSections.has('trend')}
            onToggle={() => toggleSection('trend')}
          >
            <div className="trend-head">
              <span className="muted">直近</span>
              <strong>
                {todayMetrics.byLoad
                  ? `${formatEstimate(series.at(-1)?.best ?? 0)} kg`
                  : `${series.at(-1)?.best ?? 0} レップ`}
              </strong>
            </div>
            <Sparkline values={series.map((s) => s.best)} highlightLast={stale === 0 ? 'best' : 'normal'} />
          </Disclosure>
        ) : null}

        <Disclosure
          label="この日のメモ"
          icon="note"
          marked={entry.note.trim() !== ''}
          open={openSections.has('note')}
          onToggle={() => toggleSection('note')}
        >
          <textarea
            className="section-textarea"
            rows={3}
            value={entry.note}
            placeholder="フォーム・体感・痛みなど"
            onChange={(e) => onChange({ ...entry, note: e.target.value })}
          />
        </Disclosure>
      </div>

      {confirmRemove ? (
        <ConfirmDialog
          title={`${exercise.name}を今日から外す`}
          detail={removalLoss(entry)}
          confirmLabel="外す"
          onConfirm={() => {
            setConfirmRemove(false);
            onRemove();
          }}
          onCancel={() => setConfirmRemove(false)}
        />
      ) : null}
    </section>
  );
}

/**
 * 外すと何が失われるか。
 *
 * 「本当によろしいですか」だけでは判断材料が無い。記録済みのセット数とメモの有無を
 * 出せば、押し間違いなら止まるし、意図した削除なら迷わず進める。
 */
function removalLoss(entry: SessionEntry): string | undefined {
  const done = doneSets(entry).length;
  const notes = entry.sets.filter((s) => s.note.trim() !== '').length + (entry.note.trim() !== '' ? 1 : 0);
  if (done === 0 && notes === 0) return 'まだ記録はない。設定（コツ・機材）は残る。';
  const parts = [done > 0 ? `${done}セットの記録` : null, notes > 0 ? `${notes}件のメモ` : null].filter(
    (v): v is string => v !== null,
  );
  return `${parts.join('と')}が消える。この種目の設定（コツ・機材）は残る。`;
}
