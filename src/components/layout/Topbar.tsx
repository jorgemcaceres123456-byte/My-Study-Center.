import { useEffect, useRef, useState } from 'react';
import { Bell, Menu, Plus, ChevronDown, CalendarClock, Check, CircleAlert, X } from 'lucide-react';
import { NAV } from './nav';
import { useStore } from '../../state/store';
import { alertsFor, requestNotifications } from '../../lib/reminders';
import { useToast } from '../../state/toast';
import { parseLocal, relativeDue, fmtTime } from '../../lib/utils';
import { Button, IconButton } from '../ui';
import type { SectionId } from '../../types';

const QUICK_ADD: Array<{ type: string; label: string; section: SectionId; icon: string }> = [
  { type: 'task', label: 'Nueva tarea', section: 'subjects', icon: '✓' },
  { type: 'event', label: 'Nueva entrega', section: 'calendar', icon: '📅' },
  { type: 'image', label: 'Subir apuntes', section: 'library', icon: '🖼️' },
  { type: 'habit', label: 'Nuevo hábito', section: 'habits', icon: '🔥' },
  { type: 'session', label: 'Registrar sesión', section: 'sessions', icon: '⏱️' },
];

export function Topbar({ section, onNavigate, onOpenDrawer }: { section: SectionId; onNavigate: (s: SectionId) => void; onOpenDrawer: () => void }) {
  const { state, update } = useStore();
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);
  const alerts = alertsFor(state.events);
  const current = NAV.find((n) => n.id === section)!;
  const Icon = current.icon;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setShowAdd(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const go = (s: SectionId, type?: string) => {
    onNavigate(s);
    setShowAdd(false);
    if (type) window.setTimeout(() => window.dispatchEvent(new CustomEvent('msc:new', { detail: type })), 60);
  };

  const enableNotifications = async () => {
    const r = await requestNotifications();
    if (r.ok) update((d) => { d.notificationsEnabled = true; });
    toast(r.ok ? 'success' : 'error', r.ok ? 'Notificaciones activadas' : 'No se pudo activar', r.message);
  };

  return (
    <header className="topbar glass">
      <div className="topbar__left">
        <IconButton label="Abrir menú" className="topbar__menu" onClick={onOpenDrawer}><Menu size={20} /></IconButton>
        <div className="topbar__title">
          <Icon size={18} />
          <div><strong>{current.label}</strong><small>{current.hint}</small></div>
        </div>
      </div>

      <div className="topbar__right">
        <span className="topbar__date">{new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}</span>

        <div className="dropdown" ref={addRef}>
          <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setShowAdd((v) => !v)}>Añadir <ChevronDown size={13} /></Button>
          {showAdd && (
            <div className="dropdown__menu glass">
              <span className="dropdown__label">Crear rápidamente</span>
              {QUICK_ADD.map((q) => (
                <button key={q.type} onClick={() => go(q.section, q.type)}><i>{q.icon}</i>{q.label}</button>
              ))}
              <button onClick={() => go('chat')}><i>✨</i>Preguntar a la IA</button>
            </div>
          )}
        </div>

        <div className="dropdown">
          <IconButton label={`Avisos (${alerts.length})`} onClick={() => setShowAlerts((v) => !v)} className="topbar__bell">
            <Bell size={18} />
            {alerts.length > 0 && <i className="badge">{alerts.length}</i>}
          </IconButton>
          {showAlerts && (
            <div className="dropdown__menu dropdown__menu--wide glass">
              <div className="dropdown__head"><strong>Próximas entregas</strong><IconButton label="Cerrar" onClick={() => setShowAlerts(false)}><X size={14} /></IconButton></div>
              {alerts.length === 0 && <p className="muted dropdown__empty">Todo al día. ¡Buen trabajo! ✨</p>}
              {alerts.slice(0, 6).map((ev) => {
                const due = relativeDue(ev.date);
                return (
                  <button key={ev.id} className="alert-row" onClick={() => { onNavigate('calendar'); setShowAlerts(false); }}>
                    <CalendarClock size={16} />
                    <span><strong>{ev.title}</strong><small>{parseLocal(ev.date).toLocaleDateString('es', { day: 'numeric', month: 'short' })} · {fmtTime(parseLocal(ev.date))} · <em className={`tone-${due.tone}`}>{due.label}</em></small></span>
                  </button>
                );
              })}
              {!state.notificationsEnabled && (
                <button className="dropdown__cta" onClick={() => void enableNotifications()}><CircleAlert size={14} /> Activar notificaciones del navegador</button>
              )}
              {state.notificationsEnabled && <p className="dropdown__foot"><Check size={12} /> Avisos del navegador activados</p>}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
