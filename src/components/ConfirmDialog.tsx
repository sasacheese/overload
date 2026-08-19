import { useEffect, useRef } from 'react';

/**
 * 取り消せない操作の前に一段挟む問いかけ。
 *
 * 「本当によろしいですか」ではなく、**何が失われるか**を出す。数を見せれば、
 * 押し間違いなら止まるし、意図した削除なら迷わず進める。
 *
 * 中央に出しているのは、下から出るシート（種目の追加・設定）と役割が違うため。
 * シートは作業の続き、これは進行を止める問い。
 */
export function ConfirmDialog({
  title,
  detail,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** 失われるものの説明。無ければ省く。 */
  detail?: string | undefined;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancel = useRef<HTMLButtonElement | null>(null);

  // 開いた時点では取り消し側に焦点を置く。誤って確定を叩かないように
  useEffect(() => {
    cancel.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="confirm" onClick={onCancel}>
      <div
        className="confirm-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <strong className="confirm-title">{title}</strong>
        {detail ? <p className="confirm-detail">{detail}</p> : null}
        <div className="confirm-actions">
          <button type="button" className="ghost" ref={cancel} onClick={onCancel}>
            やめる
          </button>
          <button type="button" className="ghost danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
