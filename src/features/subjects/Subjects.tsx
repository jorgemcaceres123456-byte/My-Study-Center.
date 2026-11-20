import { useEffect, useMemo, useState } from 'react';
import { useQuickAdd } from '../../lib/quickAdd';
import { BookOpenCheck, BrainCircuit, Check, ChevronRight, CirclePlus, ClipboardCheck, Folder, Pencil, Plus, Search, Trash2, ListChecks } from 'lucide-react';
import { Button, Chip, ConfirmModal, EmptyState, Field, GlassCard, IconButton, Modal, ProgressBar, SectionHeader, Segmented } from '../../components/ui';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { SUBJECT_COLORS, SUBJECT_ICONS } from '../../data/defaults';
import { pct, plural, uid } from '../../lib/utils';
import type { Subject, Task } from '../../types';
import type { SectionId } from '../../types';

type Filter = 'todas' | 'pendientes' | 'hechas';

const blankSubject = (): Subject => ({ id: '', name: '', color: SUBJECT_COLORS[0], icon: SUBJECT_ICONS[0], folder: '', createdAt: new Date().toISOString() });

export function Subjects({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  const { state, update } = useStore();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(state.subjects[0]?.id || null);
  const [filter, setFilter] = useState<Filter>('todas');
  const [query, setQuery] = useState('');
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [deletingSubject, setDeletingSubject] = useState<Subject | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<Task['priority']>('media');
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    if (selectedId && !state.subjects.some((s) => s.id === selectedId)) setSelectedId(state.subjects[0]?.id || null);
    if (!selectedId && state.subjects.length) setSelectedId(state.subjects[0].id);
  }, [state.subjects, selectedId]);

  useQuickAdd('task', () => {
    if (!state.subjects.length) { toast('info', 'Crea una materia primero', 'Las tareas necesitan una materia asignada.'); return; }
    setEditingTask({ id: '', subjectId: selectedId || state.subjects[0].id, title: '', notes: '', priority: 'media', done: false, createdAt: '' });
  });

  const enriched = useMemo(() => state.subjects.map((s) => {
    const tasks = state.tasks.filter((t) => t.subjectId === s.id);
    return { subject: s, tasks, done: tasks.filter((t) => t.done).length, percent: pct(tasks.filter((t) => t.done).length, tasks.length) };
  }), [state.subjects, state.tasks]);

  const visible = enriched.filter((e) => e.subject.name.toLowerCase().includes(query.toLowerCase()) || e.subject.folder.toLowerCase().includes(query.toLowerCase()));
  const selected = enriched.find((e) => e.subject.id === selectedId) || null;
  const selectedTasks = selected?.tasks.filter((t) => filter === 'todas' || (filter === 'hechas' ? t.done : !t.done)) || [];

  const saveSubject = (s: Subject) => update((d) => {
    if (s.id) {
      const i = d.subjects.findIndex((x) => x.id === s.id);
      if (i >= 0) d.subjects[i] = s;
    } else {
      const id = uid();
      d.subjects.push({ ...s, id });
      if (d.pentagonSubjectIds.length < 5) d.pentagonSubjectIds.push(id);
    }
  });

  const deleteSubject = (s: Subject) => update((d) => {
    // Al borrar una materia también desaparece su tutor (ensureTutors) y su chat.
    // Ningún dato huérfano se reasigna a otro tutor: eso rompería el aislamiento.
    d.subjects = d.subjects.filter((x) => x.id !== s.id);
    d.tasks = d.tasks.filter((t) => t.subjectId !== s.id);
    d.images.forEach((x) => { if (x.subjectId === s.id) x.subjectId = ''; });
    d.memories.forEach((x) => { if (x.subjectId === s.id) x.subjectId = ''; });
    d.chatFiles.forEach((x) => { if (x.subjectId === s.id) x.subjectId = ''; });
    d.events.forEach((x) => { if (x.subjectId === s.id) x.subjectId = ''; });
    d.sessions.forEach((x) => { if (x.subjectId === s.id) x.subjectId = ''; });
    const removedQuizIds = d.quizzes.filter((q) => q.subjectId === s.id).map((q) => q.id);
    d.quizzes = d.quizzes.filter((q) => q.subjectId !== s.id);
    removedQuizIds.forEach((id) => { delete d.quizAttempts[id]; });
    d.pentagonSubjectIds = d.pentagonSubjectIds.filter((id) => id !== s.id);
  });

  const addTask = () => {
    if (!taskTitle.trim() || !selected) return;
    update((d) => { d.tasks.push({ id: uid(), subjectId: selected.subject.id, title: taskTitle.trim(), notes: '', priority: taskPriority, done: false, createdAt: new Date().toISOString() }); });
    setTaskTitle('');
    toast('success', 'Tarea añadida', `Se sumó a ${selected.subject.name}.`);
  };
  const toggleTask = (id: string) => update((d) => {
    const t = d.tasks.find((x) => x.id === id);
    if (t) { t.done = !t.done; t.completedAt = t.done ? new Date().toISOString() : undefined; }
  });

  return (
    <div className="view">
      <SectionHeader eyebrow="Organización" title="Materias y tareas" description="Cada materia crea al instante su carpeta de apuntes, su Tutor de IA con chat propio y su quiz diario. El pentágono se actualiza al instante." actions={<>
        <Button icon={<ClipboardCheck size={16} />} onClick={() => onNavigate('exercises')}>Ejercicios diarios <ChevronRight size={13} /></Button>
        <Button icon={<BrainCircuit size={16} />} onClick={() => onNavigate('chat')}>Ver tutores</Button>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditingSubject(blankSubject())}>Nueva materia</Button>
      </>} />

      <div className="toolbar glass">
        <Search size={16} className="toolbar__icon" />
        <input className="input input--bare" placeholder="Buscar materia o carpeta…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="muted">{plural(visible.length, 'materia', 'materias')}</span>
      </div>

      <div className="subjects-layout">
        <div className="subject-grid">
          {visible.length === 0 && <GlassCard><EmptyState icon={<BookOpenCheck size={26} />} title="Sin materias" description="Crea una materia para empezar a organizar tus tareas." action={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditingSubject(blankSubject())}>Nueva materia</Button>} /></GlassCard>}
          {visible.map((e) => (
            <GlassCard key={e.subject.id} className={`subject-card ${selectedId === e.subject.id ? 'is-selected' : ''}`} style={{ '--subject-color': e.subject.color } as React.CSSProperties} onClick={() => setSelectedId(e.subject.id)}>
              <div className="subject-card__top">
                <span className="subject-card__icon">{e.subject.icon}</span>
                <div className="subject-card__actions">
                  <IconButton label={`Editar ${e.subject.name}`} onClick={(ev) => { ev.stopPropagation(); setEditingSubject(e.subject); }}><Pencil size={14} /></IconButton>
                  <IconButton label={`Eliminar ${e.subject.name}`} onClick={(ev) => { ev.stopPropagation(); setDeletingSubject(e.subject); }}><Trash2 size={14} /></IconButton>
                </div>
              </div>
              <h3>{e.subject.name}</h3>
              <span className="subject-card__folder"><Folder size={12} /> {e.subject.folder || 'Sin carpeta'}</span>
              <div className="subject-card__progress"><ProgressBar value={e.percent} color={e.subject.color} /><b>{e.percent}%</b></div>
              <div className="subject-card__foot"><span>{plural(e.done, 'tarea hecha', 'tareas hechas')} de {e.tasks.length}</span><span>{plural(e.tasks.length - e.done, 'pendiente', 'pendientes')}</span></div>
              <div className="subject-card__links">
                <button onClick={(ev) => { ev.stopPropagation(); localStorage.setItem('my-study-center:library-subject', e.subject.id); onNavigate('library'); }}>📁 Sus apuntes</button>
                <button onClick={(ev) => { ev.stopPropagation(); onNavigate('chat'); window.setTimeout(() => window.dispatchEvent(new CustomEvent('msc:open-tutor', { detail: e.subject.id })), 90); }}>🧠 Su tutor</button>
              </div>
            </GlassCard>
          ))}
          <button className="subject-add glass" onClick={() => setEditingSubject(blankSubject())}><CirclePlus size={24} /><span>Nueva materia</span></button>
        </div>

        <GlassCard className="task-panel">
          {!selected ? <EmptyState icon={<ListChecks size={28} />} title="Selecciona una materia" description="Elige una tarjeta para ver y gestionar sus tareas." /> : (
            <>
              <div className="card__head">
                <div><span className="eyebrow" style={{ color: selected.subject.color }}>{selected.subject.icon} {selected.subject.folder || 'Sin carpeta'}</span><h3>{selected.subject.name}</h3><p>{selected.percent}% completado · {plural(selected.tasks.length, 'tarea', 'tareas')}</p></div>
                <Chip color={selected.subject.color}>{selected.percent}%</Chip>
              </div>
              <ProgressBar value={selected.percent} color={selected.subject.color} height={10} />
              <div className="task-add">
                <input className="input" placeholder="Escribe una tarea y pulsa Enter…" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }} />
                <select className="select select--compact" value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as Task['priority'])} aria-label="Prioridad"><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select>
                <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={addTask}>Añadir</Button>
              </div>
              <Segmented value={filter} onChange={setFilter} options={[{ value: 'todas', label: 'Todas' }, { value: 'pendientes', label: 'Pendientes' }, { value: 'hechas', label: 'Hechas' }]} />
              <div className="task-list">
                {selectedTasks.length === 0 && <p className="muted task-list__empty">No hay tareas en este filtro. ✨</p>}
                {selectedTasks.map((t) => (
                  <div key={t.id} className={`task-row ${t.done ? 'is-done' : ''}`}>
                    <button className="checkbox" style={{ '--check-color': selected.subject.color } as React.CSSProperties} onClick={() => toggleTask(t.id)} aria-label={t.done ? 'Marcar como pendiente' : 'Marcar como hecha'}>{t.done && <Check size={13} />}</button>
                    <div className="task-row__text"><strong>{t.title}</strong>{t.notes && <small>{t.notes}</small>}</div>
                    <span className={`priority priority--${t.priority}`}>{t.priority}</span>
                    <IconButton label="Editar tarea" onClick={() => setEditingTask({ ...t })}><Pencil size={14} /></IconButton>
                    <IconButton label="Eliminar tarea" onClick={() => update((d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id); })}><Trash2 size={14} /></IconButton>
                  </div>
                ))}
              </div>
            </>
          )}
        </GlassCard>
      </div>

      <Modal open={Boolean(editingSubject)} onClose={() => setEditingSubject(null)} title={editingSubject?.id ? 'Editar materia' : 'Nueva materia'} subtitle="Al guardar, aparece automáticamente en Fotos y apuntes como carpeta, nace su Tutor de IA (chat y memoria separados) y entra en los Ejercicios diarios." footer={<>
        <Button variant="ghost" onClick={() => setEditingSubject(null)}>Cancelar</Button>
        <Button variant="primary" onClick={() => {
          if (!editingSubject?.name.trim()) { toast('error', 'Falta el nombre', 'Escribe un nombre para la materia.'); return; }
          saveSubject({ ...editingSubject, name: editingSubject.name.trim() });
          toast('success', editingSubject.id ? 'Materia actualizada' : 'Materia, carpeta y tutor creados', editingSubject.id ? editingSubject.name : `${editingSubject.name}: ya puedes subir fotos en su carpeta y hablar con su Tutor de IA.`);
          setEditingSubject(null);
        }}>Guardar</Button>
      </>}>
        {editingSubject && <>
          <Field label="Nombre de la materia"><input className="input" autoFocus value={editingSubject.name} onChange={(e) => setEditingSubject({ ...editingSubject, name: e.target.value })} placeholder="Ej. Química orgánica" /></Field>
          <Field label="Carpeta de estudio" hint="Agrupa materias afines, por ejemplo “Ciencias exactas”."><input className="input" value={editingSubject.folder} onChange={(e) => setEditingSubject({ ...editingSubject, folder: e.target.value })} placeholder="Ej. Ciencias" /></Field>
          <Field label="Color"><div className="swatches">{SUBJECT_COLORS.map((c) => <button key={c} className={`swatch ${editingSubject.color === c ? 'is-active' : ''}`} style={{ background: c }} onClick={() => setEditingSubject({ ...editingSubject, color: c })} aria-label={`Color ${c}`} />)}</div></Field>
          <Field label="Icono"><div className="icon-picker">{SUBJECT_ICONS.map((i) => <button key={i} className={editingSubject.icon === i ? 'is-active' : ''} onClick={() => setEditingSubject({ ...editingSubject, icon: i })}>{i}</button>)}</div></Field>
        </>}
      </Modal>

      <Modal open={Boolean(editingTask)} onClose={() => setEditingTask(null)} title="Editar tarea" size="sm" footer={<>
        <Button variant="ghost" onClick={() => setEditingTask(null)}>Cancelar</Button>
        <Button variant="primary" onClick={() => {
          if (!editingTask?.title.trim()) { toast('error', 'Falta el título'); return; }
          const t = { ...editingTask, title: editingTask.title.trim() };
          update((d) => { if (t.id) d.tasks[d.tasks.findIndex((x) => x.id === t.id)] = t; else d.tasks.push({ ...t, id: uid(), createdAt: new Date().toISOString() }); });
          setEditingTask(null);
          toast('success', 'Tarea guardada');
        }}>Guardar</Button>
      </>}>
        {editingTask && <>
          <Field label="Título"><input className="input" autoFocus value={editingTask.title} onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })} /></Field>
          <Field label="Materia"><select className="select" value={editingTask.subjectId} onChange={(e) => setEditingTask({ ...editingTask, subjectId: e.target.value })}>{state.subjects.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}</select></Field>
          <Field label="Prioridad"><select className="select" value={editingTask.priority} onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value as Task['priority'] })}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select></Field>
          <Field label="Notas"><textarea className="textarea" rows={3} value={editingTask.notes} onChange={(e) => setEditingTask({ ...editingTask, notes: e.target.value })} placeholder="Detalles, páginas, enlaces…" /></Field>
        </>}
      </Modal>

      <ConfirmModal open={Boolean(deletingSubject)} onClose={() => setDeletingSubject(null)} onConfirm={() => {
        if (deletingSubject) { deleteSubject(deletingSubject); toast('info', 'Materia eliminada', 'Sus tareas se borraron; apuntes y entregas quedaron sin materia asignada.'); }
      }} title="¿Eliminar esta materia y su tutor?" message={`Se borrarán sus tareas, su chat y sus quizzes diarios. Los apuntes, recuerdos, archivos, sesiones y entregas se conservarán SIN materia asignada para no filtrarlos a otro tutor. Esta acción no se puede deshacer.`} />
    </div>
  );
}
