import { MoreHorizontal, X } from 'lucide-react';
import { NAV, MOBILE_PRIMARY } from './nav';
import { useStore } from '../../state/store';
import type { SectionId } from '../../types';

export function MobileNav({ section, onNavigate }: { section: SectionId; onNavigate: (s: SectionId) => void }) {
  return (
    <nav className="mobile-nav glass" aria-label="Navegación rápida">
      {MOBILE_PRIMARY.map((id) => {
        const item = NAV.find((n) => n.id === id)!;
        const Icon = item.icon;
        return (
          <button key={id} className={section === id ? 'is-active' : ''} onClick={() => onNavigate(id)} aria-label={item.label}>
            <Icon size={20} strokeWidth={1.9} /><span>{item.label === 'Materias y tareas' ? 'Materias' : item.label}</span>
          </button>
        );
      })}
      <button aria-label="Más secciones" onClick={() => window.dispatchEvent(new CustomEvent('msc:drawer'))}><MoreHorizontal size={20} /><span>Más</span></button>
    </nav>
  );
}

export function MobileDrawer({ open, onClose, section, onNavigate }: { open: boolean; onClose: () => void; section: SectionId; onNavigate: (s: SectionId) => void }) {
  const { state } = useStore();
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer glass">
        <div className="drawer__head">
          <div className="brand"><svg viewBox="0 0 48 48" className="brand__mark" aria-hidden="true"><path d="M24 4 44 19 38 41H10L4 19Z" fill="none" stroke="#6ee7ff" strokeWidth="3" strokeLinejoin="round" /><circle cx="24" cy="24" r="4" fill="#a78bfa" /></svg><div className="brand__text"><strong>My Study Center</strong><span>Menú completo</span></div></div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar menú"><X size={18} /></button>
        </div>
        <div className="drawer__nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={section === item.id ? 'is-active' : ''} onClick={() => { onNavigate(item.id); onClose(); }}>
                <Icon size={19} /><span><strong>{item.label}</strong><small>{item.hint}</small></span>
              </button>
            );
          })}
        </div>
        <p className="drawer__foot">{state.settings.apiKey ? `IA configurada · ${state.settings.model}` : 'Configura tu API Key en Ajustes'} · Datos guardados localmente</p>
      </div>
    </div>
  );
}
