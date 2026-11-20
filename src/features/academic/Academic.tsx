import { useEffect, useState } from 'react';
import {
  Archive, BookOpenCheck, BrainCircuit, CalendarCheck2, ChevronRight, ClipboardCheck,
  FolderArchive, GraduationCap, Layers3, ShieldAlert, Sparkles,
} from 'lucide-react';
import { Button, Chip, ConfirmModal, EmptyState, Field, GlassCard, SectionHeader } from '../../components/ui';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import {
  closePartial, closeSchoolYear, gradeLabel, periodLabel, schoolYearLabel, shortPeriodLabel,
} from '../../lib/academic';
import { plural } from '../../lib/utils';
import type { SectionId } from '../../types';

export function Academic({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  const { state, update } = useStore();
  const toast = useToast();
  const cycle = state.academic;
  const [partialLabel, setPartialLabel] = useState(`Parcial ${cycle.partial}`);
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [confirmYear1, setConfirmYear1] = useState(false);
  const [confirmYear2, setConfirmYear2] = useState(false);

  useEffect(() => {
    setPartialLabel(`Parcial ${state.academic.partial}`);
  }, [state.academic.grade, state.academic.schoolYear, state.academic.partial]);

  const currentCounts = {
    apuntes: state.images.length,
    recuerdos: state.memories.length,
    archivos: state.chatFiles.length,
    tareas: state.tasks.length,
    entregas: state.events.length,
    quizzes: state.quizzes.length,
    mensajes: Object.values(state.tutorMessages).reduce((n, list) => n + (list?.length || 0), 0),
  };
  const totalTopics = currentCounts.apuntes + currentCounts.recuerdos + currentCounts.archivos
    + currentCounts.tareas + currentCounts.entregas + currentCounts.quizzes + currentCounts.mensajes;
  const archives = [...state.archives].reverse();

  const finishPartial = () => {
    const label = partialLabel.trim() || `Parcial ${cycle.partial}`;
    const archived = totalTopics;
    update((d) => { closePartial(d, label); });
    setPartialLabel(`Parcial ${cycle.partial + 1}`);
    toast('success', 'Parcial finalizado', `Se archivaron ${plural(archived, 'tema', 'temas')}. Ahora estás en ${gradeLabel(cycle.grade)} · Parcial ${cycle.partial + 1}. Los tutores y quizzes empiezan limpios.`);
  };

  const finishYear = () => {
    const prevGrade = cycle.grade;
    update((d) => { closeSchoolYear(d); });
    setPartialLabel('Parcial 1');
    toast('success', 'Año escolar finalizado', `Se archivó todo ${gradeLabel(prevGrade)}. Ahora comienzas ${gradeLabel(prevGrade + 1)}, parcial 1, con tutores y ejercicios separados del año anterior.`);
  };

  return (
    <div className="view view--academic">
      <SectionHeader
        eyebrow="Ciclo escolar"
        title="Parciales y año escolar"
        description={`Arrancamos desde ${gradeLabel(7)}. Cuando cierras un parcial o el año, todos los tutores, su alimentación y los quizzes separan automáticamente los temas anteriores.`}
        actions={<>
          <Button icon={<BrainCircuit size={16} />} onClick={() => onNavigate('chat')}>Ver tutores <ChevronRight size={14} /></Button>
          <Button icon={<ClipboardCheck size={16} />} onClick={() => onNavigate('exercises')}>Ejercicios del periodo</Button>
        </>} />

      <GlassCard className="cycle-hero">
        <div className="cycle-hero__grade"><GraduationCap size={26} /><strong>{gradeLabel(cycle.grade)}</strong><span>Ciclo {schoolYearLabel(cycle.schoolYear)}</span></div>
        <div className="cycle-hero__body">
          <span className="eyebrow"><Sparkles size={13} /> Periodo activo</span>
          <h2>{periodLabel(cycle)}</h2>
          <p>Los tutores solo recuerdan lo que se suba en este periodo. Lo anterior queda archivado, no se borra ni se mezcla.</p>
          <div className="cycle-hero__chips">
            <Chip color="#6ee7ff">{shortPeriodLabel(cycle)}</Chip>
            <Chip color="#a78bfa">{plural(state.tutors.length, 'tutor', 'tutores')}</Chip>
            <Chip color="#7ef0c1">{plural(totalTopics, 'tema activo', 'temas activos')}</Chip>
          </div>
        </div>
      </GlassCard>

      <div className="cycle-actions glass">
        <div className="cycle-actions__copy">
          <strong>Finalizar periodo</strong>
          <span>El botón de la izquierda cierra el parcial. El de la derecha cierra el año y pide <b>dos confirmaciones</b>.</span>
        </div>
        <Field label="Etiqueta del parcial (opcional)" hint="Puedes ponerle nombre, por ejemplo «Parcial 1 · Ciencias»." className="cycle-actions__field">
          <input className="input" value={partialLabel} onChange={(e) => setPartialLabel(e.target.value)} placeholder={`Parcial ${cycle.partial}`} />
        </Field>
        <div className="cycle-actions__buttons">
          <Button variant="primary" icon={<CalendarCheck2 size={16} />} onClick={() => setConfirmPartial(true)}>Finalizar parcial</Button>
          <Button variant="danger" icon={<GraduationCap size={16} />} onClick={() => setConfirmYear1(true)}>Finalizar año escolar</Button>
        </div>
      </div>

      <div className="notice-box cycle-notice"><ShieldAlert size={18} /><div><strong>Qué se separa automáticamente</strong><span>Apuntes por materia, recuerdos absorbidos por IA, archivos enviados al chat, tareas, exámenes/proyectos con fecha, quizzes diarios, intentos y el historial de cada tutor. Las materias y sus tutores se conservan; sesiones y hábitos siguen contando.</span></div></div>

      <div className="cycle-stats">
        <GlassCard className="cycle-stat"><span><BookOpenCheck size={17} /></span><div><small>Apuntes activos</small><strong>{currentCounts.apuntes}</strong></div></GlassCard>
        <GlassCard className="cycle-stat"><span><BrainCircuit size={17} /></span><div><small>Recuerdos IA</small><strong>{currentCounts.recuerdos}</strong></div></GlassCard>
        <GlassCard className="cycle-stat"><span><ClipboardCheck size={17} /></span><div><small>Quizzes activos</small><strong>{currentCounts.quizzes}</strong></div></GlassCard>
        <GlassCard className="cycle-stat"><span><Archive size={17} /></span><div><small>Periodos archivados</small><strong>{archives.length}</strong></div></GlassCard>
      </div>

      <GlassCard className="archive-panel">
        <div className="card__head"><div><span className="eyebrow"><FolderArchive size={13} /> Historial escolar</span><h3>Parciales y años archivados</h3><p>Cada tarjeta conserva los temas de ese periodo, lejos del contexto activo de los tutores.</p></div><Chip color="#ffc978">{plural(archives.length, 'archivo', 'archivos')}</Chip></div>
        {archives.length === 0 ? (
          <EmptyState icon={<Layers3 size={28} />} title="Aún no hay periodos archivados" description="Cuando finalices un parcial o el año escolar, sus temas aparecerán aquí separados." />
        ) : (
          <div className="archive-list">{archives.map((a) => (
            <div key={a.id} className="archive-card glass">
              <div className="archive-card__head">
                <span className={`archive-card__icon ${a.kind === 'year' ? 'is-year' : ''}`}>{a.kind === 'year' ? <GraduationCap size={18} /> : <CalendarCheck2 size={18} />}</span>
                <div><strong>{a.label}</strong><small>{gradeLabel(a.grade)} · Ciclo {schoolYearLabel(a.schoolYear)} · {new Date(a.closedAt).toLocaleDateString('es')}</small></div>
                <Chip color={a.kind === 'year' ? '#ffc978' : '#6ee7ff'}>{a.kind === 'year' ? 'Año completo' : `Parcial ${a.partial}`}</Chip>
              </div>
              <div className="archive-card__counts">
                <span>📷 {a.counts.images}</span><span>🧠 {a.counts.memories}</span><span>📎 {a.counts.files}</span><span>✓ {a.counts.tasks}</span><span>📅 {a.counts.events}</span><span>📝 {a.counts.quizzes}</span><span>💬 {a.counts.messages}</span>
              </div>
              {a.topics.length > 0 && <div className="archive-card__topics">{a.topics.slice(0, 8).map((t) => <span key={t}>{t}</span>)}{a.topics.length > 8 && <small>+{a.topics.length - 8} más</small>}</div>}
            </div>
          ))}</div>
        )}
      </GlassCard>

      <ConfirmModal
        open={confirmPartial}
        onClose={() => setConfirmPartial(false)}
        onConfirm={finishPartial}
        title="¿Finalizar este parcial?"
        message={`Se archivarán ${plural(totalTopics, 'tema activo', 'temas activos')} de ${shortPeriodLabel(cycle)}. Todos los tutores, su memoria y los quizzes pasarán al siguiente parcial con temas nuevos. Podrás seguir en ${gradeLabel(cycle.grade)}.`}
        confirmLabel="Finalizar parcial"
      />
      <ConfirmModal
        open={confirmYear1}
        onClose={() => setConfirmYear1(false)}
        onConfirm={() => setConfirmYear2(true)}
        title="¿Seguro que finalizas el año escolar? (1/2)"
        message={`Esta es la PRIMERA confirmación. Se archivará todo ${gradeLabel(cycle.grade)} y después comenzarás ${gradeLabel(cycle.grade + 1)}. Te lo volveré a preguntar antes de hacerlo.`}
        confirmLabel="Sí, continuar"
      />
      <ConfirmModal
        open={confirmYear2}
        onClose={() => setConfirmYear2(false)}
        onConfirm={finishYear}
        title="Confirma por segunda vez (2/2)"
        message={`ÚLTIMA confirmación: ${plural(totalTopics, 'tema', 'temas')} de ${gradeLabel(cycle.grade)} quedarán archivados y separados para siempre del nuevo año. Los tutores y ejercicios de ${gradeLabel(cycle.grade + 1)} empezarán desde cero. Esta acción no se puede deshacer desde la interfaz.`}
        confirmLabel="Sí, finalizar año"
      />
    </div>
  );
}
