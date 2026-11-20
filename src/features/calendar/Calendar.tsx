import { useEffect, useMemo, useState } from 'react';
import {
  Bell, BellRing, BrainCircuit, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock,
  Pencil, Plus, Trash2, TriangleAlert,
} from 'lucide-react';
import { Button, Chip, ConfirmModal, EmptyState, Field, GlassCard, IconButton, Modal, SectionHeader } from '../../components/ui';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { useQuickAdd } from '../../lib/quickAdd';
import { requestNotifications } from '../../lib/reminders';
import {
  addDays, addMonths, dateKey, fmtTime, fromKey, monthLabel, parseLocal, plural,
  relativeDue, reminderLabel, shortDate, toLocalInput, uid,
} from '../../lib/utils';
import type { CalendarEvent, EventType } from '../../types';

const REMINDER_OPTIONS = [10080, 2880, 1440, 120, 60, 30, 15, 0];
const EVENT_TYPES: Array<{ id: EventType; label: string; icon: string; color: string }> = [
  { id: 'tarea', label: 'Tarea', icon: '📄', color: '#6ee7ff' },
  { id: 'examen', label: 'Examen', icon: '📝', color: '#ff8f8f' },
  { id: 'proyecto', label: 'Proyecto', icon: '🚀', color: '#a78bfa' },
  { id: 'recordatorio', label: 'Recordatorio', icon: '🔔', color: '#ffc978' },
  { id: 'otro', label: 'Otro', icon: '📌', color: '#7ef0c1' },
];
const typeInfo = (t: EventType) => EVENT_TYPES.find((x) => x.id === t) || EVENT_TYPES[4];

const blankEvent = (date: string): CalendarEvent => ({
  id: '', subjectId: '', title: '', description: '', date, type: 'tarea', reminders: [1440, 60], firedReminders: [], done: false,
});

export function Calendar() {
  const { state, update } = useStore();
  const toast = useToast();
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(dateKey(new Date()));
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);
  const [showAgendaAll, setShowAgendaAll] = useState(false);
  const today = dateKey(new Date());

  useQuickAdd('event', () => {
    const base = fromKey(selectedDay);
    base.setHours(18, 0, 0, 0);
    setEditing(blankEvent(toLocalInput(base)));
  });

  useEffect(() => {
    const fn = () => setCursor(new Date());
    window.addEventListener('msc:calendar-today', fn);
    return () => window.removeEventListener('msc:calendar-today', fn);
  }, []);

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = addDays(first, -((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const byDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    state.events.forEach((e) => { const k = dateKey(parseLocal(e.date)); (map[k] ||= []).push(e); });
    Object.values(map).forEach((list) => list.sort((a, b) => parseLocal(a.date).getTime() - parseLocal(b.date).getTime()));
    return map;
  }, [state.events]);

  const upcoming = useMemo(() => [...state.events].filter((e) => !e.done).sort((a, b) => parseLocal(a.date).getTime() - parseLocal(b.date).getTime()), [state.events]);
  const dayEvents = byDay[selectedDay] || [];
  const agenda = showAgendaAll ? state.events : dayEvents;

  const saveEvent = (ev: CalendarEvent) => {
    if (!ev.title.trim()) { toast('error', 'Falta el título', 'Escribe un título para la entrega.'); return; }
    const next = { ...ev, title: ev.title.trim() };
    update((d) => {
      if (next.id) { const i = d.events.findIndex((x) => x.id === next.id); if (i >= 0) d.events[i] = next; }
      else d.events.push({ ...next, id: uid() });
    });
    setEditing(null);
    toast('success', next.id ? 'Entrega actualizada' : 'Entrega agregada', `${next.title} · ${shortDate(parseLocal(next.date))}`);
  };

  const openNew = (day: Date) => {
    const d = new Date(day); d.setHours(18, 0, 0, 0);
    setSelectedDay(dateKey(d));
    setEditing(blankEvent(toLocalInput(d)));
  };

  const enableNotifications = async () => {
    const r = await requestNotifications();
    if (r.ok) update((d) => { d.notificationsEnabled = true; });
    toast(r.ok ? 'success' : 'error', r.ok ? 'Notificaciones activadas' : 'No se pudieron activar', r.message);
  };

  return (
    <div className="view">
      <SectionHeader eyebrow="Agenda académica" title="Calendario de entregas" description="Agrega manualmente trabajos, tareas, proyectos y exámenes con fecha, hora y recordatorios. Si eliges una materia, solo su tutor IA sabrá de esta entrega." actions={<>
        <Button icon={state.notificationsEnabled ? <BellRing size={16} /> : <Bell size={16} />} onClick={() => void enableNotifications()}>{state.notificationsEnabled ? 'Notificaciones activas' : 'Activar notificaciones'}</Button>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => openNew(fromKey(selectedDay))}>Nueva entrega</Button>
      </>} />

      <div className="calendar-layout">
        <GlassCard className="calendar-card">
          <div className="calendar-head">
            <div><span className="eyebrow"><CalendarDays size={13} /> {cursor.getFullYear()}</span><h3>{monthLabel(cursor)}</h3></div>
            <div className="calendar-head__nav">
              <IconButton label="Mes anterior" onClick={() => setCursor((c) => addMonths(c, -1))}><ChevronLeft size={17} /></IconButton>
              <Button size="sm" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Hoy</Button>
              <IconButton label="Mes siguiente" onClick={() => setCursor((c) => addMonths(c, 1))}><ChevronRight size={17} /></IconButton>
            </div>
          </div>
          <div className="calendar-weekdays">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => <span key={d}>{d}</span>)}</div>
          <div className="calendar-grid">
            {days.map((d) => {
              const key = dateKey(d);
              const events = byDay[key] || [];
              const outside = d.getMonth() !== cursor.getMonth();
              return (
                <button key={key} className={`calendar-day ${outside ? 'is-outside' : ''} ${key === today ? 'is-today' : ''} ${key === selectedDay ? 'is-selected' : ''}`} onClick={() => { setSelectedDay(key); if (outside) setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }} onDoubleClick={() => openNew(d)}>
                  <span className="calendar-day__num">{d.getDate()}</span>
                  <span className="calendar-day__events">
                    {events.slice(0, 2).map((e) => <i key={e.id} title={`${fmtTime(parseLocal(e.date))} · ${e.title}`} style={{ '--event-dot': typeInfo(e.type).color, opacity: e.done ? 0.4 : 1 } as React.CSSProperties}><b>{e.title}</b></i>)}
                    {events.length > 2 && <small>+{events.length - 2} más</small>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">{EVENT_TYPES.map((t) => <span key={t.id}><i style={{ background: t.color }} />{t.label}</span>)}<span className="muted">Doble clic en un día = nueva entrega</span></div>
        </GlassCard>

        <div className="calendar-side">
          <GlassCard className="agenda-card">
            <div className="card__head"><div><span className="eyebrow">Agenda</span><h3>{showAgendaAll ? 'Todas las entregas' : shortDate(fromKey(selectedDay))}</h3><p>{plural(agenda.length, 'evento', 'eventos')}</p></div><Button size="sm" variant="ghost" onClick={() => setShowAgendaAll((v) => !v)}>{showAgendaAll ? 'Ver día' : 'Ver todas'}</Button></div>
            <div className="agenda-list">
              {agenda.length === 0 && <EmptyState icon={<CheckCircle2 size={26} />} title="Día libre" description="No hay entregas aquí. Pulsa “Nueva entrega” para agregar una." />}
              {agenda.map((e) => {
                const sub = state.subjects.find((s) => s.id === e.subjectId);
                const due = relativeDue(e.date);
                const t = typeInfo(e.type);
                return (
                  <div key={e.id} className={`agenda-row ${e.done ? 'is-done' : ''}`} style={{ '--event-color': t.color } as React.CSSProperties}>
                    <div className="agenda-row__top">
                      <span className="agenda-row__type">{t.icon} {t.label}</span>
                      <span className={`agenda-row__due tone-${due.tone}`}>{due.label}</span>
                    </div>
                    <strong>{e.title}</strong>
                    <span className="agenda-row__meta"><Clock size={12} /> {shortDate(parseLocal(e.date))} · {fmtTime(parseLocal(e.date))} · {sub ? `${sub.icon} ${sub.name}` : 'General'}</span>
                    {e.description && <p>{e.description}</p>}
                    <div className="agenda-row__reminders">{e.reminders.length ? e.reminders.map((r) => <span key={r}><Bell size={11} /> {reminderLabel(r)}</span>) : <span className="muted">Sin recordatorios</span>}</div>
                    <div className="agenda-row__actions">
                      <Button size="sm" variant={e.done ? 'glass' : 'soft'} icon={<Check size={13} />} onClick={() => update((d) => { const x = d.events.find((y) => y.id === e.id); if (x) x.done = !x.done; })}>{e.done ? 'Reabrir' : 'Marcar hecha'}</Button>
                      <IconButton label="Editar entrega" onClick={() => setEditing({ ...e })}><Pencil size={14} /></IconButton>
                      <IconButton label="Eliminar entrega" onClick={() => setDeleting(e)}><Trash2 size={14} /></IconButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="upcoming-card">
            <div className="card__head"><div><span className="eyebrow"><TriangleAlert size={13} /> Próximos 14 días</span><h3>No lo dejes para luego</h3></div></div>
            {upcoming.filter((e) => parseLocal(e.date).getTime() < Date.now() + 14 * 86400000).slice(0, 4).map((e) => {
              const due = relativeDue(e.date);
              return <button key={e.id} className="upcoming-row" onClick={() => setSelectedDay(dateKey(parseLocal(e.date)))}><span className="upcoming-row__dot" style={{ background: typeInfo(e.type).color }} /><span><strong>{e.title}</strong><small>{shortDate(parseLocal(e.date))}</small></span><em className={`tone-${due.tone}`}>{due.label}</em></button>;
            })}
            {upcoming.length === 0 && <p className="muted">No hay entregas pendientes. ✨</p>}
            {!state.notificationsEnabled && <div className="notice-box"><Bell size={16} /><div><strong>Avisos del navegador</strong><span>Activa el permiso para recibir alertas. Funcionan mientras esta pestaña esté abierta (sin servidor ni push).</span></div><Button size="sm" onClick={() => void enableNotifications()}>Activar</Button></div>}
          </GlassCard>
        </div>
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Editar entrega' : 'Nueva entrega'} subtitle="Todo se agrega manualmente: tú controlas la fecha, la materia y los avisos." footer={<>
        <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
        <Button variant="primary" onClick={() => editing && saveEvent(editing)}>Guardar entrega</Button>
      </>}>
        {editing && <>
          <Field label="Título"><input className="input" autoFocus value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Ej. Entrega del ensayo final" /></Field>
          <div className="form-row">
            <Field label="Fecha y hora"><input className="input" type="datetime-local" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value, firedReminders: [] })} /></Field>
            <Field label="Tipo"><select className="select" value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as EventType })}>{EVENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}</select></Field>
          </div>
          <Field label="Materia" hint="El tutor de esta materia será el único que recuerde esta entrega."><div className="calendar-subject-notice"><BrainCircuit size={14} /> Solo el Tutor de la materia elegida verá esta tarea, examen o proyecto.</div><select className="select" value={editing.subjectId} onChange={(e) => setEditing({ ...editing, subjectId: e.target.value })}><option value="">General / sin materia</option>{state.subjects.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</select></Field>
          <Field label="Descripción"><textarea className="textarea" rows={3} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Detalles, formato de entrega, enlaces…" /></Field>
          <Field label="Recordatorios" hint="Recibirás un aviso dentro de la app y, si das permiso, una notificación del navegador."><div className="reminder-grid">{REMINDER_OPTIONS.map((m) => {
            const active = editing.reminders.includes(m);
            return <Chip key={m} active={active} onClick={() => setEditing({ ...editing, reminders: active ? editing.reminders.filter((x) => x !== m) : [...editing.reminders, m].sort((a, b) => b - a) })}><Bell size={11} /> {reminderLabel(m)}</Chip>;
          })}</div></Field>
          {editing.id && <label className="toggle-row"><span><strong>Marcar como completada</strong><small>Deja de mostrar avisos para esta entrega.</small></span><input type="checkbox" checked={editing.done} onChange={(e) => setEditing({ ...editing, done: e.target.checked })} /><span className="toggle" aria-hidden="true" /></label>}
        </>}
      </Modal>

      <ConfirmModal open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={() => {
        if (deleting) { update((d) => { d.events = d.events.filter((x) => x.id !== deleting.id); }); toast('info', 'Entrega eliminada'); }
      }} title="¿Eliminar esta entrega?" message="Se borrará el evento y sus recordatorios. Esta acción no se puede deshacer." />
    </div>
  );
}
