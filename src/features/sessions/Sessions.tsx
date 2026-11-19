import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Check, Clock3, Flame, ListPlus, Pause, Pencil, Play, Plus,
  Square, Timer, Trash2, TrendingUp,
} from 'lucide-react';
import { Button, Chip, ConfirmModal, EmptyState, Field, GlassCard, IconButton, Modal, SectionHeader } from '../../components/ui';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { useQuickAdd } from '../../lib/quickAdd';
import {
  addDays, dateKey, formatClock, formatDuration, pct, plural, sessionStreak, shortDate, todayKey, uid,
} from '../../lib/utils';
import type { StudySession } from '../../types';

const blankSession = (): StudySession => ({
  id: '', subjectId: '', day: todayKey(), startedAt: '', endedAt: '', durationSec: 1500, note: '', source: 'manual',
});

export function Sessions() {
  const { state, update } = useStore();
  const toast = useToast();
  const [now, setNow] = useState(Date.now());
  const [subjectId, setSubjectId] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<StudySession | null>(null);
  const [deleting, setDeleting] = useState<StudySession | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const active = state.activeSession;

  useQuickAdd('session', () => setEditing(blankSession()));

  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, []);

  const elapsed = active ? active.accumulatedSec + (active.running ? Math.max(0, (now - active.startedAt) / 1000) : 0) : 0;
  const days = useMemo(() => Array.from(new Set(state.sessions.map((s) => s.day))), [state.sessions]);
  const streak = sessionStreak(days);
  const totalSec = state.sessions.reduce((n, s) => n + s.durationSec, 0);
  const todaySec = state.sessions.filter((s) => s.day === todayKey()).reduce((n, s) => n + s.durationSec, 0);
  const weekStart = dateKey(addDays(new Date(), -6));
  const weekSec = state.sessions.filter((s) => s.day >= weekStart).reduce((n, s) => n + s.durationSec, 0);
  const byDay = useMemo(() => {
    const map: Record<string, number> = {};
    state.sessions.forEach((s) => { map[s.day] = (map[s.day] || 0) + s.durationSec; });
    return map;
  }, [state.sessions]);
  const last30 = Array.from({ length: 30 }, (_, i) => dateKey(addDays(new Date(), -(29 - i))));

  const start = () => {
    if (active) return;
    update((d) => { d.activeSession = { subjectId, note, running: true, startedAt: Date.now(), accumulatedSec: 0 }; });
    toast('success', 'Sesión iniciada', 'El cronómetro sigue corriendo aunque cambies de pestaña o recargues.');
  };
  const pause = () => update((d) => {
    if (!d.activeSession) return;
    d.activeSession.accumulatedSec = elapsed;
    d.activeSession.running = false;
    d.activeSession.startedAt = Date.now();
  });
  const resume = () => update((d) => {
    if (!d.activeSession) return;
    d.activeSession.running = true;
    d.activeSession.startedAt = Date.now();
  });
  const finish = () => {
    if (!active) return;
    const sec = Math.round(elapsed);
    if (sec < 30) { toast('warning', 'Sesión muy corta', 'Registra al menos 30 segundos para que cuente en la racha.'); return; }
    const session: StudySession = {
      id: uid(), subjectId: active.subjectId, day: todayKey(),
      startedAt: new Date(Date.now() - sec * 1000).toISOString(), endedAt: new Date().toISOString(),
      durationSec: sec, note: active.note, source: 'timer',
    };
    update((d) => { d.sessions.push(session); d.activeSession = null; });
    toast('success', '¡Sesión registrada!', `${formatDuration(sec)} de estudio real · racha de ${sessionStreak([...days, session.day])} días.`);
  };

  const saveManual = (s: StudySession) => {
    const durationSec = Math.max(60, Math.round(s.durationSec));
    const next = { ...s, durationSec };
    update((d) => {
      if (next.id) { const i = d.sessions.findIndex((x) => x.id === next.id); if (i >= 0) d.sessions[i] = next; }
      else d.sessions.push({ ...next, id: uid(), source: 'manual', startedAt: new Date(`${next.day}T12:00`).toISOString(), endedAt: new Date(`${next.day}T12:00`).toISOString() });
    });
    setEditing(null);
    toast('success', next.id ? 'Sesión actualizada' : 'Sesión registrada', `${formatDuration(durationSec)} · tu racha se recalcula al instante.`);
  };

  const sorted = [...state.sessions].sort((a, b) => b.day.localeCompare(a.day) || b.startedAt.localeCompare(a.startedAt));

  return (
    <div className="view">
      <SectionHeader eyebrow="Estudio real" title="Sesiones y racha" description="Inicia el cronómetro o registra una sesión manual: solo el tiempo de estudio real aumenta el contador de la racha." actions={<Button variant="primary" icon={<ListPlus size={16} />} onClick={() => setEditing(blankSession())}>Registrar sesión</Button>} />

      <div className="session-stats">
        <GlassCard className="streak-hero">
          <span className="streak-hero__icon"><Flame size={26} /></span>
          <div><span>Racha de estudio</span><strong>{streak} <small>{streak === 1 ? 'día' : 'días'}</small></strong><small>Días consecutivos con una sesión real terminada</small></div>
          <div className="streak-hero__ring" style={{ background: `conic-gradient(var(--a1) ${Math.min(100, streak * 14)}%, rgba(255,255,255,.08) 0)` }}><span>{Math.min(100, streak * 14)}%</span></div>
        </GlassCard>
        <GlassCard className="habit-stat"><span className="habit-stat__icon" style={{ color: '#a78bfa' }}><Clock3 size={18} /></span><div><span>Tiempo total</span><strong>{(totalSec / 3600).toFixed(1)} h</strong></div></GlassCard>
        <GlassCard className="habit-stat"><span className="habit-stat__icon" style={{ color: '#7ef0c1' }}><TrendingUp size={18} /></span><div><span>Últimos 7 días</span><strong>{Math.round(weekSec / 60)} min</strong></div></GlassCard>
        <GlassCard className="habit-stat"><span className="habit-stat__icon" style={{ color: '#ffc978' }}><CalendarDays size={18} /></span><div><span>Hoy</span><strong>{Math.round(todaySec / 60)} min</strong></div></GlassCard>
      </div>

      <div className="sessions-layout">
        <GlassCard className="timer-card">
          <div className="card__head"><div><span className="eyebrow"><Timer size={13} /> Cronómetro real</span><h3>{active ? (active.running ? 'Sesión en curso' : 'Sesión en pausa') : 'Nueva sesión de estudio'}</h3><p>El tiempo se guarda en tu navegador: puedes recargar sin perderlo.</p></div>{active && <Chip color={active.running ? '#7ef0c1' : '#ffc978'}>{active.running ? '● Grabando' : '⏸ Pausa'}</Chip>}</div>
          <div className={`timer-display ${active?.running ? 'is-running' : ''}`}>
            <div className="timer-display__glow" />
            <span>{formatClock(elapsed)}</span>
            <small>{active ? `${state.subjects.find((s) => s.id === active.subjectId)?.name || 'Estudio general'}${active.note ? ` · ${active.note}` : ''}` : 'Horas : Minutos : Segundos'}</small>
          </div>
          {!active && <>
            <div className="form-row">
              <Field label="Materia (opcional)"><select className="select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Estudio general</option>{state.subjects.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</select></Field>
              <Field label="¿Qué vas a estudiar?"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Ejercicios de integrales" /></Field>
            </div>
            <Button variant="primary" icon={<Play size={16} />} onClick={start}>Iniciar sesión</Button>
          </>}
          {active && <div className="timer-actions">
            {active.running ? <Button icon={<Pause size={16} />} onClick={pause}>Pausar</Button> : <Button icon={<Play size={16} />} onClick={resume}>Continuar</Button>}
            <Button variant="primary" icon={<Check size={16} />} onClick={finish}>Terminar y registrar</Button>
            <Button variant="danger" icon={<Square size={15} />} onClick={() => setConfirmDiscard(true)}>Descartar</Button>
          </div>}
          <p className="field__hint timer-note">Una sesión terminada suma un día a tu racha. Varias sesiones el mismo día cuentan como un solo día, pero suman tiempo total.</p>
        </GlassCard>

        <GlassCard className="session-heat-card">
          <div className="card__head"><div><span className="eyebrow"><TrendingUp size={13} /> Últimos 30 días</span><h3>Constancia real</h3></div></div>
          <div className="heat-grid">
            {last30.map((k) => {
              const min = Math.round((byDay[k] || 0) / 60);
              const level = min === 0 ? 0 : min < 25 ? 1 : min < 60 ? 2 : min < 120 ? 3 : 4;
              return <i key={k} className={`heat-cell heat-cell--${level}`} title={`${k}: ${min} min`} />;
            })}
          </div>
          <div className="heat-legend"><span>Menos</span>{[0, 1, 2, 3, 4].map((i) => <i key={i} className={`heat-cell heat-cell--${i}`} />)}<span>Más</span></div>
          <div className="session-bars">
            {last30.slice(-14).map((k) => {
              const min = Math.round((byDay[k] || 0) / 60);
              return <div key={k} className="session-bar" title={`${shortDate(addDays(new Date(), 0))} · ${k}: ${min} min`}><span style={{ height: `${Math.min(100, pct(min, 180))}%` }} /><small>{new Date(`${k}T12:00`).getDate()}</small></div>;
            })}
          </div>
          <p className="field__hint">Cada barra es un día; el color y la altura indican minutos reales de estudio.</p>
        </GlassCard>
      </div>

      <GlassCard>
        <div className="card__head"><div><span className="eyebrow"><ListPlus size={13} /> Historial</span><h3>Sesiones registradas</h3><p>{plural(state.sessions.length, 'sesión', 'sesiones')} · {formatDuration(totalSec)} acumulados</p></div><Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing(blankSession())}>Añadir manual</Button></div>
        {sorted.length === 0 ? <EmptyState icon={<Timer size={28} />} title="Sin sesiones todavía" description="Inicia el cronómetro o registra una sesión manual para empezar tu racha real." /> : (
          <div className="session-list">
            {sorted.map((s) => {
              const sub = state.subjects.find((x) => x.id === s.subjectId);
              return (
                <div key={s.id} className="session-row">
                  <span className="session-row__icon"><Clock3 size={16} /></span>
                  <div className="session-row__info"><strong>{sub ? `${sub.icon} ${sub.name}` : 'Estudio general'}</strong><span>{s.day} · {s.source === 'timer' ? 'Cronómetro' : 'Registro manual'}{s.note ? ` · ${s.note}` : ''}</span></div>
                  <b>{formatDuration(s.durationSec)}</b>
                  <IconButton label="Editar sesión" onClick={() => setEditing({ ...s, durationSec: Math.round(s.durationSec / 60) * 60 })}><Pencil size={14} /></IconButton>
                  <IconButton label="Eliminar sesión" onClick={() => setDeleting(s)}><Trash2 size={14} /></IconButton>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Editar sesión' : 'Registrar sesión manual'} subtitle="Úsalo si estudiaste sin el cronómetro: fecha, materia y minutos reales." size="sm" footer={<>
        <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
        <Button variant="primary" onClick={() => editing && saveManual(editing)}>Guardar sesión</Button>
      </>}>
        {editing && <>
          <Field label="Día"><input className="input" type="date" value={editing.day} onChange={(e) => setEditing({ ...editing, day: e.target.value })} /></Field>
          <Field label="Materia"><select className="select" value={editing.subjectId} onChange={(e) => setEditing({ ...editing, subjectId: e.target.value })}><option value="">Estudio general</option>{state.subjects.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</select></Field>
          <Field label={`Duración: ${Math.round(editing.durationSec / 60)} minutos`}><input type="range" className="range" min={5} max={240} step={5} value={Math.round(editing.durationSec / 60)} onChange={(e) => setEditing({ ...editing, durationSec: Number(e.target.value) * 60 })} /></Field>
          <Field label="Nota"><input className="input" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} placeholder="Ej. Repaso capítulo 4" /></Field>
        </>}
      </Modal>

      <ConfirmModal open={confirmDiscard} onClose={() => setConfirmDiscard(false)} onConfirm={() => { update((d) => { d.activeSession = null; }); toast('info', 'Sesión descartada', 'No sumó a tu racha.'); }} title="¿Descartar esta sesión?" message="Se perderá el tiempo acumulado y no contará para la racha." confirmLabel="Descartar" />
      <ConfirmModal open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={() => {
        if (!deleting) return;
        update((d) => { d.sessions = d.sessions.filter((x) => x.id !== deleting.id); });
        toast('info', 'Sesión eliminada', 'La racha se recalculó automáticamente.');
      }} title="¿Eliminar esta sesión?" message="Se quitará del historial y del cálculo de la racha." />
    </div>
  );
}
