import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, AlertTriangle } from 'lucide-react';
import { uid } from '../lib/utils';

type ToastKind = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: string; kind: ToastKind; title: string; message?: string; }

interface ToastValue { push: (kind: ToastKind, title: string, message?: string) => void; }
const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = useCallback((id: string) => setItems((p) => p.filter((t) => t.id !== id)), []);
  const push = useCallback((kind: ToastKind, title: string, message?: string) => {
    const id = uid();
    setItems((p) => [...p.slice(-4), { id, kind, title, message }]);
    window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 5500);
  }, [dismiss]);
  const value = useMemo(() => ({ push }), [push]);

  const icons = { success: CheckCircle2, error: AlertTriangle, info: Info, warning: AlertTriangle };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="region" aria-live="polite" aria-label="Notificaciones">
        {items.map((t) => {
          const Icon = icons[t.kind];
          return (
            <div key={t.id} className={`toast toast--${t.kind} glass`}>
              <Icon size={18} className={`toast__icon toast__icon--${t.kind}`} />
              <div className="toast__body">
                <strong>{t.title}</strong>
                {t.message && <span>{t.message}</span>}
              </div>
              <button className="icon-btn icon-btn--sm" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso"><X size={15} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.push;
}
