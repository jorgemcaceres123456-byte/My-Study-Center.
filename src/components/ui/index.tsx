import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, LoaderCircle } from 'lucide-react';
import { getBlob } from '../../lib/imageStore';

export function GlassCard({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`glass card ${className}`} {...rest}>{children}</div>;
}

export function SectionHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="section-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="section-header__actions">{actions}</div>}
    </header>
  );
}

type ButtonVariant = 'primary' | 'glass' | 'ghost' | 'danger' | 'soft';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
}
export function Button({ variant = 'glass', size = 'md', icon, loading, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button className={`btn btn--${variant} btn--${size} ${className}`} disabled={disabled || loading} {...rest}>
      {loading ? <LoaderCircle size={16} className="spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className = '', ...rest }: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>{children}</button>;
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle" aria-hidden="true" />
    </label>
  );
}

export function ProgressBar({ value, color, height = 8 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="progress" style={{ height }}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color || 'var(--grad)' }} />
    </div>
  );
}

export function Chip({ children, color, active, onClick, title }: { children: ReactNode; color?: string; active?: boolean; onClick?: () => void; title?: string }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag className={`chip ${active ? 'chip--active' : ''} ${onClick ? 'chip--clickable' : ''}`} onClick={onClick} title={title} style={color ? { '--chip-color': color } as React.CSSProperties : undefined}>
      {color && <i className="chip__dot" />}
      {children}
    </Tag>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function Dots({ label = 'Pensando' }: { label?: string }) {
  return <span className="dots" role="status"><i /><i /><i /><span className="sr-only">{label}</span></span>;
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal glass modal--${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton label="Cerrar" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Eliminar' }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button variant="danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
    </>}>
      <p className="muted">{message}</p>
    </Modal>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; icon?: ReactNode }> }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'is-active' : ''} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

/** Loads a blob from IndexedDB and exposes a revocable object URL. */
export function useBlobUrl(key: string | undefined) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(Boolean(key));
  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    if (!key) { setUrl(''); setLoading(false); return; }
    setLoading(true);
    void (async () => {
      try {
        const blob = await getBlob(key);
        if (blob && !cancelled) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
      } catch (e) { console.warn('No se pudo leer la imagen', e); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [key]);
  return { url, loading };
}

export function BlobImage({ blobKey, alt, className = '' }: { blobKey: string; alt: string; className?: string }) {
  const { url, loading } = useBlobUrl(blobKey);
  if (loading) return <div className={`blob-image blob-image--loading ${className}`}><LoaderCircle size={20} className="spin" /></div>;
  if (!url) return <div className={`blob-image blob-image--missing ${className}`}>Sin vista previa</div>;
  return <img className={`blob-image ${className}`} src={url} alt={alt} loading="lazy" />;
}

/** Tiny markdown renderer (escaped first, so model output can never inject markup). */
export function Markdown({ text }: { text: string }) {
  const [html, setHtml] = useState('');
  useEffect(() => {
    let s = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => {
        const safeUrl = String(url).replace(/&amp;/g, '&').replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E');
        return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\n)###\s+([^\n]+)/g, '$1<h4>$2</h4>')
      .replace(/(^|\n)##\s+([^\n]+)/g, '$1<h3>$2</h3>')
      .replace(/(^|\n)#\s+([^\n]+)/g, '$1<h2>$2</h2>')
      .replace(/(^|\n)>\s?([^\n]+)/g, '$1<blockquote>$2</blockquote>')
      .replace(/(^|\n)([-*])\s+([^\n]+)/g, '$1<li>$3</li>')
      .replace(/(^|\n)(\d+)\.\s+([^\n]+)/g, '$1<li>$3</li>')
      .replace(/(<li>[\s\S]*?<\/li>)(?!\n<li>)/g, (m) => `<ul>${m.replace(/\n/g, '')}</ul>`)
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br />');
    s = `<p>${s}</p>`.replace(/<p>\s*(<h[2-4]>|<ul>|<blockquote>)/g, '$1').replace(/(<\/h[2-4]>|<\/ul>|<\/blockquote>)\s*<\/p>/g, '$1');
    setHtml(s);
  }, [text]);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Skeleton({ height = 14, width = '100%' }: { height?: number; width?: string }) {
  return <span className="skeleton" style={{ height, width }} />;
}
