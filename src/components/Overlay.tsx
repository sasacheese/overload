/**
 * 画面ぜんぶを覆うもの（シート・確認・祝福・締め）を、面の外へ出す入れもの。
 *
 * 中身は position: fixed で画面基準に置いているが、置き場所が面（.page）の中だと、
 * 下の帯（タブバー）と重なり順を争うことになる。帯は backdrop-filter を持つので
 * それだけで合成の層になり、iOS Safari では z-index を上に積んでいても帯のほうが
 * 手前に出た——シートの「保存」の下半分が帯に隠れて押せない、という形で出た。
 *
 * body の直下へ出せば、帯と同じ土俵（root の重なり）で順番が決まる。帯には
 * 明示の z-index を渡してあるので（styles.css の .tabbar）、どちらが手前かが
 * 環境の解釈ではなく数字で決まる。
 *
 * React の木の上では元の場所に居るままなので、イベントはこれまで通り親へ上がる
 * （面の横払いの判定が .sheet などを見て降りているのは、その前提のまま動く）。
 */
import { createPortal } from 'react-dom';

export function Overlay({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}
