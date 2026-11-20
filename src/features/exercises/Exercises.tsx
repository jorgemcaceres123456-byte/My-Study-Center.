import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award, BadgeCheck, BookOpenCheck, BrainCircuit, CheckCircle2, ChevronRight,
  CircleHelp, ClipboardCheck, Flame, GraduationCap, Languages, LoaderCircle,
  RefreshCw, RotateCcw, Sparkles, TriangleAlert, Wand2, XCircle,
} from 'lucide-react';
import { Button, Chip, EmptyState, Field, GlassCard, SectionHeader } from '../../components/ui';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { useQuickAdd } from '../../lib/quickAdd';
import { USE_PROXY } from '../../data/defaults';
import { AIError } from '../../lib/ai';
import {
  LEVEL_INFO, generateEnglishQuiz, generateSubjectQuiz, localEnglishQuiz,
  localSubjectQuiz, scoreOf,
} from '../../lib/quizzes';
import { dateKey, plural, shortDate } from '../../lib/utils';
import { ENGLISH_LEVELS, type DailyQuiz, type EnglishLevel, type SectionId } from '../../types';

const OPTION_LETTERS = ['a', 'b', 'c', 'd'] as const;

export function Exercises({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  const { state, update } = useStore();
  const toast = useToast();
  const today = dateKey(new Date());
  const [selected, setSelected] = useState<string>(() => state.subjects[0]?.id || 'english');
  const [generating, setGenerating] = useState(false);
  const [batch, setBatch] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const autoKeyRef = useRef('');
  const generateRef = useRef<(force: boolean) => Promise<void>>(async () => undefined);

  const hasKey = Boolean(state.settings.apiKey.trim()) || USE_PROXY;
  const isEnglish = selected === 'english';
  const subject = state.subjects.find((s) => s.id === selected);
  const level = state.englishLevel;

  useEffect(() => {
    if (selected !== 'english' && !state.subjects.some((s) => s.id === selected)) setSelected(state.subjects[0]?.id || 'english');
  }, [state.subjects, selected]);

  const quiz = useMemo(() => state.quizzes.find((q) =>
    q.day === today && q.subjectId === selected && (isEnglish ? q.kind === 'english' && q.level === level : q.kind === 'subject'),
  ) || null, [state.quizzes, today, selected, isEnglish, level]);

  const attempt = quiz ? state.quizAttempts[quiz.id] : undefined;
  const topicCount = state.memories.filter((m) => m.subjectId === selected).length
    + state.images.filter((i) => i.subjectId === selected).length;

  const saveQuiz = (q: DailyQuiz, force: boolean) => update((d) => {
    // Un quiz por día y materia (y por nivel, en el test de inglés).
    d.quizzes = d.quizzes.filter((old) => !(old.day === q.day && old.subjectId === q.subjectId
      && (old.kind !== 'english' || old.level === q.level)));
    if (force && quiz) delete d.quizAttempts[quiz.id];
    d.quizzes.push(q);
    if (d.quizzes.length > 120) d.quizzes = d.quizzes.slice(-120);
  });

  const generate = async (force: boolean, silent = false): Promise<void> => {
    if (generating) return;
    if (!isEnglish && !subject) return;
    setGenerating(true); setError(''); setAnswers({}); setSubmitted(false);
    try {
      let q: DailyQuiz;
      if (hasKey) {
        q = isEnglish
          ? await generateEnglishQuiz(state.settings, level, today)
          : await generateSubjectQuiz(state.settings, state, subject!, today);
        if (!silent) toast('success', 'Quiz diario listo', `${plural(q.questions.length, 'pregunta', 'preguntas')} sobre ${isEnglish ? `inglés ${level}` : subject!.name}.`);
      } else {
        q = isEnglish ? localEnglishQuiz(level, today) : localSubjectQuiz(state, subject!, today);
        if (!silent) toast('warning', 'Quiz creado sin IA', 'Configura la API Key en Ajustes para preguntas generadas con tus apuntes.');
      }
      saveQuiz(q, force);
    } catch (e) {
      const msg = e instanceof AIError ? e.message : (e instanceof Error ? e.message : 'No se pudo generar el quiz.');
      setError(msg);
      const fallback = isEnglish ? localEnglishQuiz(level, today) : (subject ? localSubjectQuiz(state, subject, today) : null);
      if (fallback) { saveQuiz(fallback, force); if (!silent) toast('warning', 'La IA falló; usé un repaso local', msg); }
      else if (!silent) toast('error', 'No se pudo generar el quiz', msg);
    } finally { setGenerating(false); }
  };
  generateRef.current = (force) => generate(force);

  // Generación diaria automática: un solo intento por día / materia / nivel.
  useEffect(() => {
    const key = `${today}|${selected}|${isEnglish ? level : ''}|${quiz?.id || 'none'}`;
    if (autoKeyRef.current === key) return;
    autoKeyRef.current = key;
    if (!quiz && !generating && state.settings.dailyQuizzes !== false && (subject || isEnglish)) {
      void generateRef.current(false).then(() => undefined);
    }
  }, [today, selected, level, isEnglish, quiz?.id, generating, state.settings.dailyQuizzes, subject]);

  useQuickAdd('quiz', () => { void generateRef.current(true); });

  const generateAll = async () => {
    if (batch) return;
    setBatch(true);
    let ok = 0;
    for (const s of state.subjects) {
      if (state.quizzes.some((q) => q.day === today && q.subjectId === s.id)) continue;
      try {
        const q = hasKey ? await generateSubjectQuiz(state.settings, state, s, today) : localSubjectQuiz(state, s, today);
        update((d) => { d.quizzes = d.quizzes.filter((o) => !(o.day === today && o.subjectId === s.id)); d.quizzes.push(q); });
        ok++;
      } catch { /* sigue con la siguiente materia */ }
    }
    if (!state.quizzes.some((q) => q.day === today && q.kind === 'english' && q.level === level)) {
      try {
        const q = hasKey ? await generateEnglishQuiz(state.settings, level, today) : localEnglishQuiz(level, today);
        update((d) => { d.quizzes = d.quizzes.filter((o) => !(o.day === today && o.kind === 'english' && o.level === level)); d.quizzes.push(q); });
        ok++;
      } catch { /* ignore */ }
    }
    setBatch(false);
    toast('success', 'Ejercicios del día listos', `${plural(ok, 'quiz nuevo', 'quizzes nuevos')} generados para hoy.`);
  };

  const choose = (id: string) => { setSelected(id); setAnswers({}); setSubmitted(false); setError(''); };
  const setLevel = (l: EnglishLevel) => { update((d) => { d.englishLevel = l; }); setAnswers({}); setSubmitted(false); };

  // Si el quiz ya se resolvió, recupera sus respuestas al volver a abrirlo.
  useEffect(() => {
    const next: Record<number, number> = {};
    attempt?.answers.forEach((v, i) => { if (v >= 0) next[i] = v; });
    setAnswers(next);
    setSubmitted(false);
  }, [quiz?.id, attempt?.quizId, attempt?.completedAt]);

  const submit = () => {
    if (!quiz) return;
    if (Object.keys(answers).length < quiz.questions.length) { toast('info', 'Responde todas las preguntas', 'Marca una opción en cada ejercicio antes de comprobar.'); return; }
    const arr = quiz.questions.map((_, i) => answers[i] ?? -1);
    const score = scoreOf(quiz, arr);
    update((d) => { d.quizAttempts[quiz.id] = { quizId: quiz.id, answers: arr, score, completedAt: new Date().toISOString() }; });
    setSubmitted(true);
    toast(score >= quiz.questions.length * 0.7 ? 'success' : 'info', `${score}/${quiz.questions.length} aciertos`, score >= quiz.questions.length * 0.7 ? '¡Buen trabajo! 💪' : 'Repasa las explicaciones y vuelve a intentarlo.');
  };
  const retry = () => {
    if (quiz) update((d) => { delete d.quizAttempts[quiz.id]; });
    setAnswers({}); setSubmitted(false);
  };

  const history = state.quizzes.filter((q) => q.subjectId === selected && (!isEnglish || q.level === level)).slice(-7).reverse();
  const scored = Object.entries(state.quizAttempts).filter(([id]) => state.quizzes.some((q) => q.id === id));
  const avg = scored.length ? (scored.reduce((n, [, a]) => n + a.score / Math.max(1, state.quizzes.find((q) => q.id === a.quizId)?.questions.length || 1), 0) / scored.length) * 100 : 0;

  const showResult = submitted || Boolean(attempt);

  return (
    <div className="view view--exercises">
      <SectionHeader eyebrow="Práctica diaria" title="Ejercicios diarios" description="Cada día la IA crea quizzes nuevos de selección múltiple (a, b, c, d) con los temas que le alimentaste en cada materia, y tests de inglés por nivel MCER." actions={<>
        <Button icon={batch ? <LoaderCircle size={16} className="spin" /> : <Wand2 size={16} />} disabled={batch} onClick={() => void generateAll()}>{batch ? 'Generando…' : 'Generar para todas'}</Button>
        <Button variant="primary" icon={generating ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />} disabled={generating} onClick={() => void generate(true)}>{generating ? 'Creando…' : quiz ? 'Nuevo quiz' : 'Generar quiz de hoy'}</Button>
      </>} />

      <div className="quiz-stats">
        <GlassCard className="quiz-stat"><span className="quiz-stat__icon"><ClipboardCheck size={18} /></span><div><span>Quizzes creados</span><strong>{state.quizzes.length}</strong></div></GlassCard>
        <GlassCard className="quiz-stat"><span className="quiz-stat__icon" style={{ color: '#7ef0c1' }}><Award size={18} /></span><div><span>Aciertos medios</span><strong>{Math.round(avg)}%</strong></div></GlassCard>
        <GlassCard className="quiz-stat"><span className="quiz-stat__icon" style={{ color: '#ffc978' }}><Flame size={18} /></span><div><span>Realizados</span><strong>{scored.length}</strong></div></GlassCard>
      </div>

      <div className="quiz-tabs glass">
        <span className="quiz-tabs__label"><BookOpenCheck size={14} /> Materias</span>
        {state.subjects.map((s) => (
          <button key={s.id} className={selected === s.id ? 'is-active' : ''} onClick={() => choose(s.id)} style={{ '--tab-color': s.color } as React.CSSProperties}>
            <i>{s.icon}</i>{s.name}<small>{state.quizzes.filter((q) => q.subjectId === s.id && q.day === today).length ? '✓' : ''}</small>
          </button>
        ))}
        <button className={isEnglish ? 'is-active' : ''} onClick={() => choose('english')} style={{ '--tab-color': '#a78bfa' } as React.CSSProperties}><i>🇬🇧</i> Inglés <small>MCER</small></button>
        {state.subjects.length === 0 && <button onClick={() => onNavigate('subjects')}><i>➕</i> Crea una materia primero</button>}
      </div>

      {isEnglish && <GlassCard className="level-card">
        <div className="card__head"><div><span className="eyebrow"><Languages size={13} /> Marco Común Europeo de Referencia</span><h3>Elige tu nivel de inglés</h3><p>A1 · A2 · B1 · B2 · C1 · C2 (de principiante a maestría). El test se adapta al nivel elegido.</p></div><GraduationCap size={22} /></div>
        <div className="level-grid">{ENGLISH_LEVELS.map((l) => <button key={l} className={level === l ? 'is-active' : ''} onClick={() => setLevel(l)}><strong>{l}</strong><span>{LEVEL_INFO[l].label.split('·')[1]?.trim()}</span></button>)}</div>
        <p className="field__hint"><b>{LEVEL_INFO[level].label}</b> — {LEVEL_INFO[level].desc}</p>
      </GlassCard>}

      {!isEnglish && subject && <div className="quiz-context glass"><BrainCircuit size={18} /><div><strong>Este quiz solo usa los temas de {subject.name}</strong><span>{topicCount ? `${plural(topicCount, 'página/recuerdo', 'páginas/recuerdos')} en la memoria del Tutor de ${subject.name}.` : 'Aún no has subido apuntes de esta materia: la IA hará un diagnóstico general. Sube fotos en Fotos y apuntes → ' + subject.name + '.'}</span></div><Button size="sm" onClick={() => onNavigate('library')}>Subir apuntes <ChevronRight size={14} /></Button></div>}

      {error && <div className="chat-warning"><TriangleAlert size={17} /><div><strong>No se pudo generar con IA</strong><span>{error}</span></div><Button size="sm" onClick={() => void generate(true)}>Reintentar</Button></div>}

      {generating && !quiz ? <GlassCard><div className="quiz-loading"><LoaderCircle size={26} className="spin" /><strong>La IA está creando tus ejercicios de hoy…</strong><span>Leyendo solo la memoria de {isEnglish ? `inglés ${level}` : subject?.name || 'la materia'}.</span></div></GlassCard> : !quiz ? (
        <GlassCard><EmptyState icon={<CircleHelp size={28} />} title="Sin ejercicios para hoy" description="Pulsa el botón para que la IA cree el quiz del día con los temas de tus apuntes." action={<Button variant="primary" icon={<Sparkles size={15} />} onClick={() => void generate(true)}>Generar quiz de hoy</Button>} /></GlassCard>
      ) : (
        <GlassCard className="quiz-card">
          <div className="quiz-card__head">
            <div><span className="eyebrow"><Sparkles size={13} /> {shortDate(new Date(`${quiz.day}T12:00`))} · {quiz.source === 'ai' ? 'Generado por IA' : 'Repaso local (sin IA)'}</span><h3>{quiz.title}</h3><p>{plural(quiz.questions.length, 'pregunta', 'preguntas')} · {plural(quiz.questions.filter((q) => q.difficulty === 'avanzado').length, 'avanzada', 'avanzadas')} · selección múltiple a / b / c / d</p></div>
            {showResult && <div className="quiz-score"><strong>{attempt?.score ?? scoreOf(quiz, quiz.questions.map((_, i) => answers[i] ?? -1))}<small>/{quiz.questions.length}</small></strong><span>aciertos</span></div>}
          </div>

          {quiz.questions.map((q, i) => {
            const picked = answers[i];
            const correct = q.answer;
            const done = showResult;
            return (
              <div key={q.id} className={`quiz-question ${done ? (picked === correct ? 'is-right' : 'is-wrong') : ''}`}>
                <div className="quiz-question__top"><span className="quiz-question__n">{i + 1}</span><div><span className={`quiz-question__badge quiz-question__badge--${q.difficulty}`}>{q.difficulty}</span><strong>{q.prompt}</strong></div><small>{q.topic}</small></div>
                <div className="quiz-options">
                  {q.options.map((opt, k) => {
                    const isCorrect = done && k === correct;
                    const isWrongPick = done && picked === k && k !== correct;
                    return (
                      <button key={k} className={`${picked === k ? 'is-picked' : ''} ${isCorrect ? 'is-correct' : ''} ${isWrongPick ? 'is-incorrect' : ''}`} disabled={done} onClick={() => setAnswers((a) => ({ ...a, [i]: k }))}>
                        <b>{OPTION_LETTERS[k]}</b><span>{opt}</span>{isCorrect && <CheckCircle2 size={15} />}{isWrongPick && <XCircle size={15} />}
                      </button>
                    );
                  })}
                </div>
                {done && <p className="quiz-question__why"><BadgeCheck size={14} /><span><b>{OPTION_LETTERS[correct].toUpperCase()}) {q.options[correct]}</b> — {q.explanation}</span></p>}
              </div>
            );
          })}

          <div className="quiz-card__foot">
            {!showResult ? <Button variant="primary" icon={<CheckCircle2 size={16} />} onClick={submit}>Comprobar respuestas</Button> : <>
              <Button icon={<RotateCcw size={15} />} onClick={retry}>Reintentar</Button>
              <Button variant="primary" icon={<RefreshCw size={15} />} disabled={generating} onClick={() => void generate(true)}>Otros ejercicios nuevos</Button>
            </>}
            <span className="muted">{Object.keys(answers).length}/{quiz.questions.length} respondidas</span>
          </div>
        </GlassCard>
      )}

      <GlassCard className="quiz-history">
        <div className="card__head"><div><span className="eyebrow"><ClipboardCheck size={13} /> Historial</span><h3>Últimos ejercicios</h3></div><Chip color="#6ee7ff">{history.length} quizzes</Chip></div>
        {history.length === 0 ? <p className="muted">Todavía no hay ejercicios guardados.</p> : (
          <div className="quiz-history__list">{history.map((q) => {
            const a = state.quizAttempts[q.id];
            return <button key={q.id} onClick={() => { setSelected(q.subjectId); if (q.level) update((d) => { d.englishLevel = q.level!; }); }}><span><strong>{q.title}</strong><small>{q.day} · {q.source === 'ai' ? 'IA' : 'local'} · {q.questions.length} preguntas</small></span><b className={a ? 'is-done' : ''}>{a ? `${a.score}/${q.questions.length}` : 'Sin hacer'}</b></button>;
          })}</div>
        )}
      </GlassCard>

      <Field label="Nota"><p className="field__hint">Los ejercicios se guardan por día. Cada materia tiene su propio quiz y su propio tutor: la IA de {isEnglish ? 'inglés' : subject?.name || 'esa materia'} nunca ve apuntes de otras materias.</p></Field>
    </div>
  );
}
