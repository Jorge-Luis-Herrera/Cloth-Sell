import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { STORE_CURRENCY, STORE_LOCALE } from '../api';

type Toast = { id: number; message: string; kind: 'info' | 'success' | 'error' };
type ToastApi = { push: (message: string, kind?: Toast['kind']) => void; success: (m: string) => void; error: (m: string) => void };

const ToastContext = createContext<ToastApi>({ push: () => {}, success: () => {}, error: () => {} });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (message: string, kind: Toast['kind'] = 'info') => {
      const id = ++seq.current;
      setToasts((t) => [...t, { id, message, kind }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({ push, success: (m: string) => push(m, 'success'), error: (m: string) => push(m, 'error') }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="adm-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="adm-toast" data-kind={t.kind}>
            <span>{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Diálogo de confirmación reutilizable para borrar productos, fotos y pedidos. */
export function Confirm({
  open,
  title,
  body,
  summary,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  summary?: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="adm-modal-wrap" onClick={onCancel} role="presentation">
      <div
        className="adm-confirm"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2>{title}</h2>
        <p>{body}</p>
        {summary && <div className="adm-confirm-box">{summary}</div>}
        <div className="adm-confirm-actions">
          <button type="button" className="adm-btn" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={`adm-btn ${danger ? 'adm-btn-danger' : 'adm-btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? 'Un momento…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Formato de dinero del panel. Antes era `es-MX`/MXN mientras que la tienda usaba `es-ES`/EUR:
 * el mismo producto salia en pesos en el panel y en euros en la tienda.
 * La fuente de verdad esta en `api.ts` (`STORE_CURRENCY`); aqui se reutiliza para que no puedan divergir.
 */
export const money = (value: number) =>
  new Intl.NumberFormat(STORE_LOCALE, { style: 'currency', currency: STORE_CURRENCY }).format(Number.isFinite(value) ? value : 0);

export const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(STORE_LOCALE, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};