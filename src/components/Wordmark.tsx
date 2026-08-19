/**
 * OVERLOAD のワードマーク。
 *
 * V だけを字として組み直してある。肩幅から腰へ絞る逆三角形のシルエットが
 * そのまま V の形なので、目指す体型を字の中に置ける。上端の太いところから
 * 下の一点へ細っていく形にして、単なる ▽ ではなく字として読めるようにした。
 *
 * 印（上向きの三角＝積み上げる負荷）と V（下向き＝目指す体型）で向きが逆になる。
 * これは意図したもので、やることと目指すものを 1 組で示している。
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`wordmark ${className ?? ''}`} aria-label="OVERLOAD" role="img">
      <span aria-hidden="true">O</span>
      {/*
        viewBox は前後の字の実測に合わせてある（字幅 0.663em / キャップハイト 0.705em を
        66 × 70 に写した）。肩の側を実際の V より太らせ、腰へ向けて一点に絞っている。
      */}
      <svg className="wordmark-v" viewBox="0 0 66 70" aria-hidden="true">
        <path d="M0 0 33 70 66 0 51 0 33 42 15 0Z" fill="currentColor" />
      </svg>
      <span aria-hidden="true">ERLOAD</span>
    </span>
  );
}
