import { useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUp, ArrowDown, CalendarClock, Check, CheckCircle2, ChevronRight,
  Flame, Images, Layers3, ListChecks, Plus, Settings2, Sparkles, Target, TrendingUp, X,
} from 'lucide-react';
import { Button, Chip, GlassCard, IconButton, Modal, ProgressBar, BlobImage, EmptyState } from '../../components/ui';
import { PentagonChart, type PentagonDatum } from './PentagonChart';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { formatDuration, longDate, parseLocal, pct, plural, relativeDue, sessionStreak, shortDate, todayKey } from '../../lib/utils';
import type { SectionId } from '../../types';

export function Dashboard({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  const { state, update } = useStore();
  const toast = useToast();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [dismissedAlert, setDismissedAlert] = useState(false);
  const today = todayKey();

  const stats = useMemo(() => {
    const bySubject = (id: string) => {
      const list = state.tasks.filter((t) => t.subjectId === id);
      const done = list.filter((t) => t.done).length;
      return { done, total: list.length, percent: pct(done, list.length) };
    };
    return state.subjects.map((s) => ({ subject: s, ...bySubject(s.id) }));
  }, [state.subjects, state.tasks]);

  const pentagonData: PentagonDatum[] = state.pentagonSubjectIds
    .map((id) => stats.find((s) => s.subject.id === id))
    .filter(Boolean)
    .map((s) => ({ id: s!.subject.id, name: s!.subject.name, color: s!.subject.color, icon: s!.subject.icon, percent: s!.percent, done: s!.done, total: s!.total }));

  const allDone = state.tasks.filter((t) => t.done).length;
  const overall = pct(allDone, state.tasks.length);
  const pending = state.tasks.filter((t) => !t.done);
  const focus = [...pending].sort((a, b) => ({ alta: 0, media: 1, baja: 2 }[a.priority] - { alta: 0, media: 1, baja: 2 }[b.priority])).slice(0, 5);
  const upcoming = [...state.events].filter((e) => !e.done).sort((a, b) => parseLocal(a.date).getTime() - parseLocal(b.date).getTime()).slice(0, 4);
  const urgent = upcoming.filter((e) => parseLocal(e.date).getTime() - Date.now() < 48 * 3600000 && parseLocal(e.date).getTime() > Date.now());
  const realStreak = sessionStreak(Array.from(new Set(state.sessions.map((x) => x.day))));
  const todaySessions = state.sessions.filter((x) => x.day === today);
  const todaySec = todaySessions.reduce((n, x) => n + x.durationSec, 0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  const toggleTask = (id: string) => update((d) => {
    const t = d.tasks.find((x) => x.id === id);
    if (t) { t.done = !t.done; t.completedAt = t.done ? new Date().toISOString() : undefined; }
  });
  const askAI = (prompt: string) => {
    onNavigate('chat');
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('msc:chat-prompt', { detail: prompt })), 80);
  };

  return (
    <div className="view view--dashboard">
      <section className="hero">
        <div className="hero__copy">
          <span className="eyebrow"><Sparkles size={13} /> {longDate(new Date())}</span>
          <h2>{greeting}, <span className="grad-text">vamos a avanzar</span> 👋</h2>
          <p>Tu progreso, tus apuntes y tus entregas en un solo lugar. Todo se guarda automáticamente.</p>
          <div className="hero__actions">
            <Button variant="primary" icon={<Sparkles size={16} />} onClick={() => askAI('Con base en mi avance y mis próximas entregas, ¿qué debería estudiar hoy y con qué método?')}>Plan de estudio de hoy</Button>
            <Button icon={<Settings2 size={16} />} onClick={() => setSelectorOpen(true)}>Elegir materias del pentágono</Button>
          </div>
        </div>
        <div className="hero__orbit" aria-hidden="true"><div className="hero__orbit-ring" /><div className="hero__orbit-core">{overall}%</div></div>
      </section>

      <div className="stat-grid">
        <StatCard icon={<TrendingUp size={18} />} label="Avance general" value={`${overall}%`} note={`${plural(allDone, 'tarea completada', 'tareas completadas')} de ${state.tasks.length}`} color="#6ee7ff" />
        <StatCard icon={<ListChecks size={18} />} label="Tareas pendientes" value={String(pending.length)} note={`${plural(pending.filter((t) => t.priority === 'alta').length, 'prioridad alta', 'prioridades altas')}`} color="#a78bfa" />
        <StatCard icon={<CalendarClock size={18} />} label="Próximas entregas" value={String(state.events.filter((e) => !e.done).length)} note={upcoming[0] ? `${relativeDue(upcoming[0].date).label} · ${upcoming[0].title}` : 'Sin entregas'} color="#ffc978" />
        <StatCard icon={<Flame size={18} />} label="Racha real" value={`${realStreak} d`} note={`${plural(todaySessions.length, 'sesión', 'sesiones')} hoy · ${formatDuration(todaySec)}`} color="#7ef0c1" />
      </div>

      {urgent.length > 0 && !dismissedAlert && (
        <div className="alert-banner glass">
          <CalendarClock size={20} />
          <div><strong>Atención: {plural(urgent.length, 'entrega próxima', 'entregas próximas')}</strong><span>{urgent.map((e) => `${e.title} (${relativeDue(e.date).label})`).join(' · ')}</span></div>
          <Button size="sm" onClick={() => onNavigate('calendar')}>Ver calendario <ArrowRight size={14} /></Button>
          <IconButton label="Descartar aviso" onClick={() => setDismissedAlert(true)}><X size={15} /></IconButton>
        </div>
      )}

      <div className="dashboard-grid">
        <GlassCard className="pentagon-card">
          <div className="card__head">
            <div><span className="eyebrow"><Target size={13} /> Radar académico</span><h3>Pentágono de avance</h3><p>Cada vértice muestra el 0–100% de una materia según sus tareas completadas.</p></div>
            <Button size="sm" icon={<Settings2 size={14} />} onClick={() => setSelectorOpen(true)}>Editar 5 materias</Button>
          </div>
          <div className="pentagon-card__body">
            <PentagonChart data={pentagonData} onPick={(id) => setSelected((s) => (s === id ? null : id))} activeIndex={pentagonData.findIndex((d) => d.id === selected) >= 0 ? pentagonData.findIndex((d) => d.id === selected) : null} onActiveChange={() => undefined} />
          </div>
          <div className="pentagon-card__chips">
            {pentagonData.map((d) => <Chip key={d.id} color={d.color} active={selected === d.id} onClick={() => setSelected(selected === d.id ? null : d.id)}>{d.icon} {d.name} · {d.percent}%</Chip>)}
            {pentagonData.length < 5 && <Chip onClick={() => setSelectorOpen(true)}><Plus size={12} /> Añadir materia</Chip>}
          </div>
          {selected && (() => {
            const s = stats.find((x) => x.subject.id === selected);
            if (!s) return null;
            const tasks = state.tasks.filter((t) => t.subjectId === selected);
            return (
              <div className="pentagon-detail">
                <div className="pentagon-detail__head">
                  <div><strong>{s.subject.icon} {s.subject.name}</strong><span>{s.percent}% · {plural(s.done, 'tarea hecha', 'tareas hechas')} de {s.total} · {s.subject.folder}</span></div>
                  <ProgressBar value={s.percent} color={s.subject.color} />
                </div>
                {tasks.slice(0, 4).map((t) => (
                  <button key={t.id} className={`mini-task ${t.done ? 'is-done' : ''}`} onClick={() => toggleTask(t.id)}>
                    <span className="checkbox">{t.done && <Check size={12} />}</span>{t.title}
                  </button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => onNavigate('subjects')}>Ver todas las tareas <ChevronRight size={14} /></Button>
              </div>
            );
          })()}
        </GlassCard>

        <div className="dashboard-side">
          <GlassCard className="focus-card">
            <div className="card__head"><div><span className="eyebrow"><Layers3 size={13} /> Prioridades</span><h3>Enfócate hoy</h3></div><IconButton label="Ir a materias" onClick={() => onNavigate('subjects')}><ArrowRight size={16} /></IconButton></div>
            {focus.length === 0 ? <EmptyState icon={<CheckCircle2 size={26} />} title="¡Todo al día!" description="No quedan tareas pendientes. Disfruta el logro." /> : (
              <div className="focus-list">{focus.map((t) => {
                const sub = state.subjects.find((s) => s.id === t.subjectId);
                return (
                  <button key={t.id} className="focus-row" onClick={() => toggleTask(t.id)}>
                    <span className="checkbox" style={{ '--check-color': sub?.color } as React.CSSProperties}>{t.done && <Check size={12} />}</span>
                    <span className="focus-row__text"><strong>{t.title}</strong><small>{sub?.icon} {sub?.name || 'Sin materia'} · {t.priority}</small></span>
                    <Check size={15} className="focus-row__check" />
                  </button>
                );
              })}</div>
            )}
          </GlassCard>

          <GlassCard className="habit-today-card">
            <div className="card__head"><div><span className="eyebrow"><Flame size={13} /> Estudio real</span><h3>Sesiones de hoy</h3></div><IconButton label="Ir a sesiones" onClick={() => onNavigate('sessions')}><ArrowRight size={16} /></IconButton></div>
            <div className="session-today-summary"><strong>{formatDuration(todaySec)}</strong><span>{plural(todaySessions.length, 'sesión registrada', 'sesiones registradas')} · racha de {realStreak} {realStreak === 1 ? 'día' : 'días'}</span></div>
            {state.activeSession && <div className="session-today-active"><span className="recording-bar__dot" /> Cronómetro en curso <Button size="sm" onClick={() => onNavigate('sessions')}>Ver</Button></div>}
            {todaySessions.length === 0 && !state.activeSession && <p className="muted">Aún no has registrado estudio hoy. Inicia el cronómetro en <b>Sesiones y racha</b> para subir la racha.</p>}
            <Button size="sm" variant="primary" icon={<ArrowRight size={14} />} onClick={() => onNavigate('sessions')}>Ir al registro de sesiones</Button>
          </GlassCard>
        </div>
      </div>

      <div className="dashboard-grid dashboard-grid--bottom">
        <GlassCard>
          <div className="card__head"><div><span className="eyebrow"><CalendarClock size={13} /> Agenda</span><h3>Próximas entregas</h3></div><Button size="sm" variant="ghost" onClick={() => onNavigate('calendar')}>Abrir calendario <ChevronRight size={14} /></Button></div>
          <div className="deadline-list">
            {upcoming.length === 0 && <EmptyState icon={<CalendarClock size={26} />} title="Sin entregas" description="Agrega fechas manualmente en el calendario." />}
            {upcoming.map((e) => {
              const sub = state.subjects.find((s) => s.id === e.subjectId);
              const due = relativeDue(e.date);
              return (
                <div key={e.id} className="deadline-row">
                  <div className="deadline-date"><strong>{parseLocal(e.date).getDate()}</strong><span>{shortDate(parseLocal(e.date)).split(' ')[1]}</span></div>
                  <div className="deadline-info"><strong>{e.title}</strong><span>{sub?.name || 'General'} · {e.type}{e.description ? ` · ${e.description}` : ''}</span></div>
                  <Chip color={due.tone === 'overdue' ? '#ff8f8f' : due.tone === 'soon' ? '#ffc978' : '#6ee7ff'}>{due.label}</Chip>
                </div>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="card__head"><div><span className="eyebrow"><Images size={13} /> Memoria visual</span><h3>Apuntes recientes</h3></div><Button size="sm" variant="ghost" onClick={() => onNavigate('library')}>Ver biblioteca <ChevronRight size={14} /></Button></div>
          <div className="recent-notes">
            {state.images.length === 0 && <EmptyState icon={<Images size={26} />} title="Aún no hay apuntes" description="Sube fotos de tu cuaderno para darle contexto real a la IA." />}
            {state.images.slice(0, 3).map((img) => (
              <button key={img.id} className="recent-note" onClick={() => onNavigate('library')}>
                <BlobImage blobKey={img.blobKey} alt={img.name} />
                <span><strong>{img.name}</strong><small>{state.subjects.find((s) => s.id === img.subjectId)?.name || 'Sin materia'} · {shortDate(new Date(img.createdAt))}</small></span>
                {img.aiSummary && <i title="Analizado por IA"><Sparkles size={13} /></i>}
              </button>
            ))}
          </div>
        </GlassCard>
      </div>

      <PentagonSelector open={selectorOpen} onClose={() => setSelectorOpen(false)} stats={stats} selected={state.pentagonSubjectIds} onSave={(ids) => {
        update((d) => { d.pentagonSubjectIds = ids; });
        toast('success', 'Pentágono actualizado', ids.length ? `${plural(ids.length, 'materia visible', 'materias visibles')} en el radar.` : 'Selecciona al menos una materia.');
      }} />
    </div>
  );
}

function StatCard({ icon, label, value, note, color }: { icon: React.ReactNode; label: string; value: string; note: string; color: string }) {
  return (
    <GlassCard className="stat-card" style={{ '--stat-color': color } as React.CSSProperties}>
      <div className="stat-card__icon">{icon}</div>
      <div className="stat-card__body"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    </GlassCard>
  );
}

function PentagonSelector({ open, onClose, stats, selected, onSave }: {
  open: boolean; onClose: () => void;
  stats: Array<{ subject: { id: string; name: string; color: string; icon: string }; percent: number; done: number; total: number }>;
  selected: string[]; onSave: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(selected);
  const [search, setSearch] = useState('');
  // Keep the draft in sync each time the modal opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) { setWasOpen(true); setDraft(selected); }
  if (!open && wasOpen) setWasOpen(false);

  const toggle = (id: string) => setDraft((d) => d.includes(id) ? d.filter((x) => x !== id) : d.length >= 5 ? d : [...d, id]);
  const move = (i: number, dir: number) => setDraft((d) => {
    const next = [...d]; const j = i + dir;
    if (j < 0 || j >= next.length) return d;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const filtered = stats.filter((s) => s.subject.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal open={open} onClose={onClose} title="Elegir materias del pentágono" subtitle="Selecciona hasta 5 materias. El orden define la posición de cada vértice (0–100%)." size="lg" footer={<>
      <span className="muted modal__count">{draft.length}/5 seleccionadas</span>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button variant="primary" onClick={() => { onSave(draft); onClose(); }}>Guardar selección</Button>
    </>}>
      <input className="input" placeholder="Buscar materia…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="selector-list">
        {filtered.length === 0 && <p className="muted">No hay materias con ese nombre. Créalas en “Materias y tareas”.</p>}
        {filtered.map((s) => {
          const index = draft.indexOf(s.subject.id);
          const checked = index >= 0;
          return (
            <div key={s.subject.id} className={`selector-row ${checked ? 'is-selected' : ''}`}>
              <button className="selector-row__main" onClick={() => toggle(s.subject.id)}>
                <span className="checkbox checkbox--lg" style={{ '--check-color': s.subject.color } as React.CSSProperties}>{checked && <Check size={13} />}</span>
                <span className="selector-row__name"><strong>{s.subject.icon} {s.subject.name}</strong><small>{plural(s.done, 'tarea hecha', 'tareas hechas')} de {s.total}</small></span>
                <ProgressBar value={s.percent} color={s.subject.color} height={6} />
                <b style={{ color: s.subject.color }}>{s.percent}%</b>
              </button>
              {checked && <span className="selector-row__order">
                <IconButton label="Mover antes" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></IconButton>
                <span>V{index + 1}</span>
                <IconButton label="Mover después" disabled={index === draft.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></IconButton>
              </span>}
            </div>
          );
        })}
      </div>
      <p className="field__hint">Consejo: pasa el cursor o toca cada punto del pentágono para ver el porcentaje exacto y las tareas contadas.</p>
    </Modal>
  );
}
