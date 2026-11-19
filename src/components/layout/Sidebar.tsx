import { HardDrive, KeyRound, CircleCheck, CircleAlert } from 'lucide-react';
import { NAV } from './nav';
import { useStore } from '../../state/store';
import type { SectionId } from '../../types';

export function Sidebar({ section, onNavigate }: { section: SectionId; onNavigate: (s: SectionId) => void }) {
  const { state } = useStore();
  const hasKey = Boolean(state.settings.apiKey.trim());

  return (
    <aside className="sidebar glass">
      <div className="brand" onClick={() => onNavigate('dashboard')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onNavigate('dashboard')}>
        <svg viewBox="0 0 48 48" className="brand__mark" aria-hidden="true">
          <defs><linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#6ee7ff" /><stop offset=".5" stopColor="#a78bfa" /><stop offset="1" stopColor="#5b9cff" /></linearGradient></defs>
          <path d="M24 4 44 19 38 41H10L4 19Z" fill="none" stroke="url(#brandGrad)" strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M24 13 35 21 32 34H16L13 21Z" fill="url(#brandGrad)" opacity=".35" />
          <circle cx="24" cy="24" r="3.4" fill="#e9f6ff" />
        </svg>
        <div className="brand__text"><strong>My Study Center</strong><span>Tu centro de estudio</span></div>
      </div>

      <nav className="sidebar__nav" aria-label="Navegación principal">
        <span className="sidebar__label">Espacios</span>
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={`nav-item ${section === item.id ? 'is-active' : ''}`} onClick={() => onNavigate(item.id)} title={item.hint}>
              <Icon size={18} strokeWidth={1.9} />
              <span>{item.label}</span>
              {section === item.id && <i className="nav-item__glow" />}
            </button>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <div className="status-pill">
          <HardDrive size={14} /><span>Guardado en este navegador</span>
        </div>
        <div className={`status-pill ${hasKey ? 'status-pill--ok' : 'status-pill--warn'}`}>
          {hasKey ? <CircleCheck size={14} /> : <CircleAlert size={14} />}
          <span>{hasKey ? `IA lista · ${state.settings.model}` : 'Falta la API Key'}</span>
        </div>
        <p className="sidebar__tip"><KeyRound size={12} /> Tu clave nunca se envía a nuestros servidores: no hay servidor.</p>
      </div>
    </aside>
  );
}
