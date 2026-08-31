/**
 * その日の達成の棚。「今日」タブの記録の下に置く。
 *
 * 祝福は一瞬で消えるので、その日のぶんをここで見返せるようにする。1 枚押すと
 * 祝福のカードがもう一度開き、めくれば裏の歴代 Mr. Olympia も見返せる
 * （見返し用なので自動では閉じない）。
 *
 * 出すのは 1 枚でも引いた日だけ。0 枚の棚を置くと「今日はまだ何も無い」という
 * 表示になり、それは未達を見せないという方針に反する。
 *
 * 中身の計算は lib/cards.ts。記録から毎回引き直すので、過去の日を開いても
 * 当時のカードがそのまま並ぶ（sessionStorage の演出用の印には頼らない）。
 */

import { cardKey, type DayCard } from '../lib/cards.ts';
import { graduationShift } from '../lib/cycle.ts';
import { recordTier, type RecordTier } from '../lib/records.ts';
import { Icon, type IconName } from './Icon.tsx';

/** 棚の 1 枚に載せるもの。カードの種類の違いはここで吸収して、描画は 1 本にする。 */
type Face = {
  tier: RecordTier;
  icon: IconName;
  title: string;
  /** どの種目か。セッション全体のカードは「この日ぜんぶ」（締めの画面と同じ語）。 */
  where: string;
  /** 数字の 1 行。祝福の detail と同じもので、棚では平たい文より数字が並ぶほうが読める。 */
  value: string;
  gain: string | null;
};

function faceOf(card: DayCard): Face {
  if (card.kind === 'graduation') {
    const shift = graduationShift(card.exercise, card.cycle);
    return {
      tier: 'legend',
      icon: 'flag',
      title: '卒業',
      where: card.exercise.name,
      value: shift.to !== null ? `次は ${shift.to}` : '加重か難度アップへ',
      gain: shift.gain,
    };
  }
  const a = card.achievement;
  return {
    tier: recordTier(a.kind),
    icon: 'rise',
    title: a.title,
    where: card.exercise?.name ?? 'この日ぜんぶ',
    value: a.detail,
    gain: a.gain,
  };
}

export function DayCards({ cards, onOpen }: { cards: readonly DayCard[]; onOpen: (card: DayCard) => void }) {
  if (cards.length === 0) return null;
  return (
    <section className="day-cards">
      <h2 className="section-title with-icon">
        <Icon name="rise" />
        達成
        <span className="day-cards-count">{cards.length}</span>
      </h2>
      <ul className="card-shelf">
        {cards.map((card) => {
          const face = faceOf(card);
          return (
            <li key={cardKey(card)}>
              <button
                type="button"
                className={`mini-card tier-${face.tier}`}
                aria-label={`${face.where}の「${face.title}」をもう一度見る`}
                onClick={() => onOpen(card)}
              >
                <span className="mini-card-crest">
                  <Icon name={face.icon} />
                  {face.title}
                </span>
                <span className="mini-card-where">{face.where}</span>
                <strong className="mini-card-value">{face.value}</strong>
                {face.gain ? <span className="mini-card-gain">{face.gain}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
