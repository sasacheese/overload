import { useMemo, useState } from 'react';
import { byRecentUse } from '../lib/query.ts';
import { Icon } from './Icon.tsx';
import { Overlay } from './Overlay.tsx';
import { MUSCLE_GROUPS, MUSCLE_GROUP_KEYS, type Exercise, type ExerciseId, type IsoDate } from '../lib/types.ts';

type Props = {
  exercises: readonly Exercise[];
  /** すでに今日に入っている種目。一覧から外す。 */
  exclude: ReadonlySet<ExerciseId>;
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
  onCreate: () => void;
  /** 種目ごとの最終実施日。最近やったものを上に出す。 */
  lastPerformed: ReadonlyMap<ExerciseId, IsoDate>;
};

export function ExercisePicker({ exercises, exclude, onPick, onClose, onCreate, lastPerformed }: Props) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim();
    const available = byRecentUse(
      exercises.filter((e) => !e.archived && !exclude.has(e.id) && (q === '' || e.name.includes(q))),
      lastPerformed,
    );
    return MUSCLE_GROUP_KEYS.map((key) => ({ key, items: available.filter((e) => e.group === key) })).filter(
      (g) => g.items.length > 0,
    );
  }, [exercises, exclude, query, lastPerformed]);

  return (
    <Overlay>
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="種目を追加">
          <header className="sheet-head">
            <strong>種目を追加</strong>
            <button type="button" className="icon-btn" aria-label="閉じる" onClick={onClose}>
              <Icon name="close" />
            </button>
          </header>
          <input className="search" type="search" placeholder="種目名で絞る" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="sheet-body">
            {groups.map(({ key, items }) => (
              <div key={key} className="picker-group">
                <h3>{MUSCLE_GROUPS[key].label}</h3>
                <div className="picker-items">
                  {items.map((e) => (
                    <button type="button" key={e.id} className="picker-item" onClick={() => onPick(e)}>
                      {e.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {groups.length === 0 ? <p className="muted center">該当する種目がない</p> : null}
          </div>
          <button type="button" className="ghost wide with-icon center-icon" onClick={onCreate}>
            <Icon name="plus" />
            新しい種目を作る
          </button>
        </div>
      </div>
    </Overlay>
  );
}
